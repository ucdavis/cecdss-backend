import { RunParams } from '@ucdavis/lca/out/lca.model';
import { transmission } from '@ucdavis/tea';
import { InputModTransimission } from '@ucdavis/tea/out/models/input.model';
import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/out/models/output.model';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { findNearest, getBoundsOfDistance, getDistance } from 'geolib';
import knex from 'knex';
import OSRM from 'osrm';
import { performance } from 'perf_hooks';
import pg from 'pg';
import { getFrcsInputsTest } from './frcsInputCalculations';
import { LCAresults } from './models/lcaModels';
import { TreatedCluster } from './models/treatedcluster';
import {
  AllYearsResults,
  RequestParams,
  RequestParamsAllYears,
  RequestParamsTest
} from './models/types';
import { getTeaOutputs, processClustersForYear, runLca } from './processYear';
import { testRunFrcsOnCluster } from './runFrcs';
import { getTransportationCost, KM_TO_MILES } from './transportation';

const PG_DECIMAL_OID = 1700;
pg.types.setTypeParser(PG_DECIMAL_OID, parseFloat);
dotenv.config();

const app = express();

app.use(bodyParser.json({ limit: '50mb' }));

const port = process.env.PORT || 3000;

console.log('connecting to db', process.env.DB_HOST);
// https://knexjs.org/
const db = knex({
  client: 'pg',
  debug: false,
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT)
  }
});
console.log('connected to db. connected to osrm...');

const osrm = new OSRM('./data/california-latest.osrm');
console.log('connected to osrm');

// allow cors
app.use(cors());

app.post('/initialProcessing', async (req, res) => {
  console.log('running initial processing...');

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
          substations.map(substation => {
            return { latitude: substation.latitude, longitude: substation.longitude };
          })
        )
      : substations[0];
  const distanceToNearestSubstationInM = getDistance(
    { latitude: params.facilityLat, longitude: params.facilityLng },
    { latitude: nearestSubstation.latitude, longitude: nearestSubstation.longitude }
  ); // m
  const distanceToNearestSubstation = (distanceToNearestSubstationInM / 1000) * KM_TO_MILES;
  const distanceAveraged = distanceToNearestSubstation / 8; // 8 types of land,
  if (distanceToNearestSubstation < 3) {
    params.transmission.LengthCategory = '< 3 miles';
  } else if (distanceToNearestSubstation >= 3 && distanceToNearestSubstation <= 10) {
    params.transmission.LengthCategory = '3-10 miles';
  } else {
    params.transmission.LengthCategory = '> 10 miles';
  }
  params.transmission.Miles = {
    ...params.transmission.Miles,
    Forested: distanceAveraged,
    Flat: distanceAveraged,
    Wetland: distanceAveraged,
    Farmland: distanceAveraged,
    Desert: distanceAveraged,
    Urban: distanceAveraged,
    Hills: distanceAveraged,
    Mountain: distanceAveraged
  };
  console.log(
    `nearest substation: ${nearestSubstation.substation_name} is ${distanceToNearestSubstation} miles away`
  );
  const transmissionResults = transmission(params.transmission);

  const additionalCosts =
    transmissionResults.AllCost + (params.includeUnloadingCost ? params.unloadingCost : 0);
  console.log(
    `additionalCosts: ${additionalCosts}: ${transmissionResults.AllCost}, ${params.includeUnloadingCost}: ${params.unloadingCost}`
  );
  const teaInputs: any = { ...params.teaInputs };
  if (params.teaModel === 'GP') {
    // GP capital costs will be summed in TEA function anyway, so we can just add it to one property
    teaInputs.CapitalCostElements.GasifierSystemCapitalCost += additionalCosts;
  } else {
    teaInputs.CapitalCost += additionalCosts;
  }
  console.log(JSON.stringify(teaInputs));
  // TODO: use separate TEA endpoint just to get biomass target
  const teaOutput: OutputModGPO | OutputModCHP | OutputModGP = await getTeaOutputs(
    params.teaModel,
    teaInputs
  );
  const biomassTarget = teaOutput.ElectricalAndFuelBaseYear.BiomassTarget;
  // TODO: clean up in TEA models
  const electricalAndFuelBaseYear: any = teaOutput.ElectricalAndFuelBaseYear;
  const annualGeneration =
    params.teaModel === 'GP'
      ? electricalAndFuelBaseYear.AnnualNetElectricityGeneration
      : electricalAndFuelBaseYear.AnnualGeneration;
  const results: AllYearsResults = {
    biomassTarget: biomassTarget,
    transmissionResults: transmissionResults,
    teaResults: teaOutput,
    teaInputs: teaInputs,
    annualGeneration: annualGeneration,
    nearestSubstation: nearestSubstation.substation_name,
    distanceToNearestSubstation: distanceToNearestSubstationInM / 1000 // km
  };

  res.status(200).json(results);
});

// app.post('/postProcessing', async(req, res) => {
//   console.log('running post processing...')
//   const params: RequestParamsAllYearsPost = req.body;

//   res.status(200).json(results);
// })

app.post('/runLCA', async (req, res) => {
  const params: RunParams = req.body;
  const lca: LCAresults = await runLca(params);
  res.status(200).json(lca);
});

app.post('/process', async (req, res) => {
  const t0 = performance.now();
  const params: RequestParams = req.body;
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
    'Helicopter CTL'
  ];
  if (!systems.some(x => x === params.system)) {
    res.status(400).send('System not recognized');
  }

  const teaModels = ['GPO', 'CHP', 'GP'];
  if (!teaModels.some(x => x === params.teaModel)) {
    res.status(400).send('TEA Model not recognized');
  }

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
  // console.log(yearResult);

  const t1 = performance.now();
  console.log(`Running took ${t1 - t0} milliseconds.`);

  res.status(200).json(yearResult);
});

// tslint:disable-next-line: max-file-line-count
app.listen(port, () => console.log(`Listening on port ${port}!`));

app.post('/testCluster', async (req, res) => {
  console.log('pulling cluster from db...');
  const params: RequestParamsTest = req.body;
  const clusters: TreatedCluster[] = await db
    .table('treatedclusters')
    .where({ treatmentid: params.treatmentid, year: params.year, cluster_no: params.cluster_no });
  const cluster = clusters[0];

  const distance = 0.5; // km
  const duration = 0.5; // route.duration / 3600; // seconds to hours
  // TODO: update how we are calculating transportation cost, in reality a truck is not taking 1 trip per cluster
  // could be multiple trips, depending on load
  const transportationCostPerGT = getTransportationCost(distance, duration, params.dieselFuelPrice);

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
      frcsResult
    } = await testRunFrcsOnCluster(
      cluster,
      params.system,
      distance * 0.621371, // move in distance km to miles
      params.dieselFuelPrice,
      params.moistureContent
    );
    const residueBiomass = frcsResult.Residue.WeightPerAcre * cluster.area;
    const transportationCostTotal = transportationCostPerGT * residueBiomass;

    clusterResults = {
      cluster_no: cluster.cluster_no,
      cluster: cluster,
      area: cluster.area,
      residueBiomass: residueBiomass,
      distance: distance,
      combinedCost: frcsResult.Total.CostPerAcre * cluster.area,
      residueCost: frcsResult.Residue.CostPerAcre * cluster.area,
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
        frcsInputs
      },
      frcsResult: frcsResult,
      lat: cluster.landing_lat,
      lng: cluster.landing_lng
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
      removalsLLT
    } = getFrcsInputsTest(
      cluster,
      params.system,
      distance * 0.621371, // move in distance km to miles
      params.dieselFuelPrice,
      params.moistureContent
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
      e: e
    };
  } finally {
    res.status(200).json(clusterResults);
  }
});
