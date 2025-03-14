import { LcaInputs } from '@ucdavis/lca/model';
import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/output.model';
import { transmission } from '@ucdavis/tea/utility';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { findNearest, getBoundsOfDistance, getDistance } from 'geolib';
import _fetch from 'isomorphic-fetch';
import knex from 'knex';
import OSRM from '@project-osrm/osrm';
import { performance } from 'perf_hooks';
import pg, { Connection } from 'pg';
import swaggerUi from 'swagger-ui-express';
import saveModels from './saveModels';
import saveUserDetails from './saveUserDetails';

import { getFrcsInputsTest } from './frcsInputCalculations';
import { setupAppInsights, trackMetric } from './logging';
import { TreatedCluster } from './models/treatedcluster';
import {
  AllYearsResults,
  Geometry,
  LCAresults,
  RequestByDistanceParams,
  RequestByRoutesParams,
  RequestParams,
  RequestParamsAllYears,
  RequestParamsTest,
} from './models/types';
import { processClustersByDistance } from './processDistance';
import { getTeaOutputs, processClustersForYear, runLca } from './processYear';
import { testRunFrcsOnCluster } from './runFrcs';
import { getMoveInTrip, getTransportationCostTotal, KM_TO_MILES } from './transportation';
import { hookupKnexTiming } from './util';

// tslint:disable-next-line: no-var-requires
const swaggerDocument = require('./swagger.json');

const PG_DECIMAL_OID = 1700;
pg.types.setTypeParser(PG_DECIMAL_OID, parseFloat);
dotenv.config();

if (process.env.APPINSIGHTS_INSTRUMENTATIONKEY) {
  setupAppInsights();
}

const apiTimeout = 60 * 5 * 1000; // 5 minutes

const app = express();

app.use(bodyParser.json({ limit: '50mb' }));

const port = process.env.PORT || 3000;

console.log('connecting to db', process.env.DB_HOST);
// https://knexjs.org/
export const db = knex({
  client: 'pg',
  debug: false,
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false,
  },
});

// reports query time for every db query
hookupKnexTiming(db);

//const test = db.table('treatedclusters')
//console.log(test)

console.log('connected to db. connecting to osrm...');

const osrm = new OSRM(process.env.OSRM_FILE || './data/california-latest.osrm');
console.log('connected to osrm');

// allow cors
app.use(cors());

// 5 minutes to timeout, extending the default of 2 minutes
app.use((req, res, next) => {
  res.setTimeout(apiTimeout, () => {
    console.log('Request has timed out.');
    res.send(500);
  });

  next();
});

/**
 * Router module to handle saving and retrieving model URLs.
 * @module saveModels
 */
app.use(saveModels);

/**
 * Router module to handle user details saving and updating.
 * @module saveUserDetails
 */
app.use(saveUserDetails);

// constants
const systems = [
  'Ground-Based Mech WT',
  'Ground-Based Manual WT',
  'Ground-Based Manual Log',
  'Ground-Based CTL',
  'Cable Manual WT/Log',
  'Cable Manual WT',
  'Cable Manual Log',
  'Cable CTL',
  'Helicopter Manual Log',
  'Helicopter CTL',
];

app.post('/initialProcessing', async (req, res) => {
  console.log('running initial processing...');

  try {
    const params: RequestParamsAllYears = req.body;
    const bounds = getBoundsOfDistance(
      { latitude: params.facilityLat, longitude: params.facilityLng },
      150000
    );
    // TODO: clean up, add substation type
    const substations: any[] = await db
      .table('substations') // TODO: only select appropriate voltage
      .whereBetween('latitude', [bounds[0].latitude, bounds[1].latitude])
      .andWhereBetween('longitude', [bounds[0].longitude, bounds[1].longitude]);
    console.log(`found: ${substations.length} substations`);
    const nearestSubstation: any =
      substations.length > 1
        ? findNearest(
            { latitude: params.facilityLat, longitude: params.facilityLng },
            substations.map((substation) => {
              return {
                name: substation.Substation_Name,
                latitude: substation.latitude,
                longitude: substation.longitude,
              };
            })
          )
        : substations[0];
    console.log(
      `nearestSubstation: {name: ${nearestSubstation.name}, longitude: ${nearestSubstation.longitude}, latitude: ${nearestSubstation.latitude}}`
    );
    const distanceToNearestSubstationInM = getDistance(
      { latitude: params.facilityLat, longitude: params.facilityLng },
      { latitude: nearestSubstation.latitude, longitude: nearestSubstation.longitude }
    );
    const distanceToNearestSubstation = (distanceToNearestSubstationInM / 1000) * KM_TO_MILES;
    console.log(`nearest substation is ${distanceToNearestSubstationInM} meters away`);
    if (distanceToNearestSubstation < 3) {
      params.transmission.LengthCategory = '< 3 miles';
    } else if (distanceToNearestSubstation >= 3 && distanceToNearestSubstation <= 10) {
      params.transmission.LengthCategory = '3-10 miles';
    } else {
      params.transmission.LengthCategory = '> 10 miles';
    }
    console.log(`transmission.LengthCategory = ${params.transmission.LengthCategory}`);
    params.transmission.Miles = {
      ...params.transmission.Miles,
      Forested: distanceToNearestSubstation,
    };
    console.log(JSON.stringify(params.transmission));
    const transmissionResults = transmission(params.transmission);
    console.log(`transmission cost: $${transmissionResults.AllCost}`);

    const teaInputs: any = { ...params.teaInputs };
    teaInputs.CapitalCost += transmissionResults.AllCost;
    // console.log(JSON.stringify(teaInputs));
    const teaOutput: OutputModGPO | OutputModCHP | OutputModGP = await getTeaOutputs(
      params.teaModel,
      teaInputs
    );
    const biomassTarget = teaOutput.ElectricalAndFuelBaseYear.BiomassTarget;
    const electricalAndFuelBaseYear: any = teaOutput.ElectricalAndFuelBaseYear;
    const annualGeneration = electricalAndFuelBaseYear.AnnualGeneration;
    const results: AllYearsResults = {
      biomassTarget: biomassTarget,
      transmissionResults: transmissionResults,
      teaResults: teaOutput,
      teaInputs: teaInputs,
      annualGeneration: annualGeneration,
      nearestSubstation: nearestSubstation.name,
      distanceToNearestSubstation: distanceToNearestSubstationInM / 1000, // km
    };

    res.status(200).json(results);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
});

app.post('/runLCA', async (req, res) => {
  const params: LcaInputs = req.body;
  const lca: LCAresults = await runLca(params);
  res.status(200).json(lca);
});

app.post('/process', async (req, res) => {
  const t0 = performance.now();
  const params: RequestParams = req.body;

  if (!systems.some((x) => x === params.system)) {
    res.status(400).send('System not recognized');
  }

  const teaModels = ['GPO', 'CHP', 'GP'];
  if (!teaModels.some((x) => x === params.teaModel)) {
    res.status(400).send('TEA Model not recognized');
  }

  try {
    const yearResult = await processClustersForYear(
      db,
      osrm,
      params.radius,
      params,
      // 10000,
      params.biomassTarget,
      params.year,
      params.clusterIds,
      params.errorIds
    );

    console.log(`year: ${params.year}, # of clusters: ${yearResult.clusterNumbers.length}`);

    const t1 = performance.now();
    console.log(`Running took ${t1 - t0} milliseconds.`);

    trackMetric(`Process method ${params.year} - biomass target ${params.biomassTarget}`, t1 - t0);

    return res.status(200).json(yearResult);
  } catch (error) {
    console.log(error);
    return res.status(500).send(error);
  }
});

app.post('/processDistance', async (req, res) => {
  const t0 = performance.now();
  const params: RequestByDistanceParams = req.body;

  if (!systems.some((x) => x === params.system)) {
    res.status(400).send('System not recognized');
    return;
  }

  const teaModels = ['GPO', 'CHP', 'GP'];
  if (!teaModels.some((x) => x === params.teaModel)) {
    res.status(400).send('TEA Model not recognized');
    return;
  }

  if (
    params.minRadiusInMeters === undefined ||
    params.maxRadiusInMeters === undefined ||
    params.minRadiusInMeters > params.maxRadiusInMeters ||
    params.maxRadiusInMeters <= 0
  ) {
    res.status(400).send('Radius details invalid');
    return;
  }

  const distanceResult = await processClustersByDistance(
    db,
    osrm,
    params.minRadiusInMeters,
    params.maxRadiusInMeters,
    params,
    params.year
  );
  console.log(
    `distance: ${params.minRadiusInMeters} -> ${params.maxRadiusInMeters}, # of clusters: ${distanceResult.clusterNumbers.length}`
  );

  const t1 = performance.now();
  console.log(`Running took ${t1 - t0} milliseconds.`);

  res.status(200).json(distanceResult);
});

app.post('/processRoutes', async (req, res) => {
  const t0 = performance.now();
  const params: RequestByRoutesParams = req.body;

  // loop through each cluster and get trip geometry
  const clusterRouteResults: Promise<Geometry[]>[] = [];

  for (let i = 0; i < params.clusters.length; i++) {
    const cluster = params.clusters[i];
    const routeOptions: OSRM.RouteOptions = {
      geometries: 'geojson',
      coordinates: [
        [params.facilityLng, params.facilityLat],
        [cluster.landing_lng, cluster.landing_lat],
      ],
    };

    const promise = new Promise<Geometry[]>((resolve, reject) => {
      osrm.route(routeOptions, async (err, result) => {
        if (err) {
          reject(err);
        }
        // Assume we only have one route
        if (result.routes.length > 0) {
          resolve(result.routes[0].geometry as Geometry[]);
        }
      });
    });

    clusterRouteResults.push(promise);
  }

  const routeResults = await Promise.all(clusterRouteResults);

  const t1 = performance.now();
  console.log(`Running took ${t1 - t0} milliseconds.`);

  res.status(200).json(routeResults);
});

app.post('/processMoveIn', async (req, res) => {
  const t0 = performance.now();
  const params: RequestByRoutesParams = req.body;

  if (params.clusters.length > 3000) {
    res.status(400).send('Too many clusters');
    return;
  }

  // get moveIn geometry for return trip from facility to all clusters
  const moveInTripResults = await getMoveInTrip(
    osrm,
    params.facilityLat,
    params.facilityLng,
    params.clusters
  );

  const t1 = performance.now();
  console.log(`Running took ${t1 - t0} milliseconds.`);

  const tripGeometries = moveInTripResults.trips.map((t) => t.geometry);

  res.status(200).json(tripGeometries);
});

// tslint:disable-next-line: max-file-line-count
const server = app.listen(port, () => console.log(`Listening on port ${port}!`));
server.setTimeout(apiTimeout);

app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.post('/testCluster', async (req, res) => {
  console.log('pulling cluster from db...');
  const params: RequestParamsTest = req.body;
  const clusters: TreatedCluster[] = await db
    .table('treatedclusters')
    .where({ treatmentid: params.treatmentid, year: params.year, cluster_no: params.cluster_no });
  const cluster = clusters[0];
  const distance = 0.5; // km
  const duration = 0.5; // route.duration / 3600; // seconds to hours

  console.log('running frcs...');
  let clusterResults = {};
  try {
    const {
      frcsInputs,
      boleWeightCT,
      residueWeightCT,
      residueFractionCT,
      volumeCT,
      removalsCT,
      boleWeightSLT,
      residueWeightSLT,
      residueFractionSLT,
      volumeSLT,
      removalsSLT,
      boleWeightLLT,
      residueWeightLLT,
      residueFractionLLT,
      volumeLLT,
      removalsLLT,
      frcsResult,
    } = await testRunFrcsOnCluster(
      cluster,
      params.system,
      distance * 0.621371, // move in distance km to miles
      params.dieselFuelPrice,
      params.moistureContent,
      params.wageFaller,
      params.wageOther,
      params.laborBenefits,
      params.ppiCurrent,
      params.residueRecovFracWT,
      params.residueRecovFracCTL
    );
    const residueBiomass = frcsResult.residual.yieldPerAcre * cluster.area;
    const transportationCostTotal = getTransportationCostTotal(
      residueBiomass,
      distance,
      duration,
      params.dieselFuelPrice,
      params.wageTruckDriver,
      params.driverBenefits,
      params.oilCost
    );

    clusterResults = {
      cluster_no: cluster.cluster_no,
      cluster: cluster,
      area: cluster.area,
      residueBiomass: residueBiomass,
      distance: distance,
      combinedCost: frcsResult.total.costPerAcre * cluster.area,
      residueCost: frcsResult.residual.costPerAcre * cluster.area,
      transportationCost: transportationCostTotal,
      frcsInputs: {
        boleWeightCT,
        residueWeightCT,
        residueFractionCT,
        volumeCT,
        removalsCT,
        boleWeightSLT,
        residueWeightSLT,
        residueFractionSLT,
        volumeSLT,
        removalsSLT,
        boleWeightLLT,
        residueWeightLLT,
        residueFractionLLT,
        volumeLLT,
        removalsLLT,
        frcsInputs,
      },
      frcsResult: frcsResult,
      lat: cluster.landing_lat,
      lng: cluster.landing_lng,
    };
  } catch (e) {
    const {
      frcsInputs,
      boleWeightCT,
      residueWeightCT,
      residueFractionCT,
      volumeCT,
      removalsCT,
      boleWeightSLT,
      residueWeightSLT,
      residueFractionSLT,
      volumeSLT,
      removalsSLT,
      boleWeightLLT,
      residueWeightLLT,
      residueFractionLLT,
      volumeLLT,
      removalsLLT,
    } = getFrcsInputsTest(
      cluster,
      params.system,
      distance * 0.621371, // move in distance km to miles
      params.dieselFuelPrice,
      params.moistureContent,
      params.wageFaller,
      params.wageOther,
      params.laborBenefits,
      params.ppiCurrent,
      params.residueRecovFracWT,
      params.residueRecovFracCTL
    );

    clusterResults = {
      cluster_no: cluster.cluster_no,
      cluster: cluster,
      area: cluster.area,
      distance: distance,
      lat: cluster.landing_lat,
      lng: cluster.landing_lng,
      frcsInputs: frcsInputs,
      boleWeightCT,
      residueWeightCT,
      residueFractionCT,
      volumeCT,
      removalsCT,
      boleWeightSLT,
      residueWeightSLT,
      residueFractionSLT,
      volumeSLT,
      removalsSLT,
      boleWeightLLT,
      residueWeightLLT,
      residueFractionLLT,
      volumeLLT,
      removalsLLT,
      e: e,
    };
  } finally {
    res.status(200).json(clusterResults);
  }
});
