import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import {
  gasificationPower,
  genericCombinedHeatPower,
  genericPowerOnly,
  hydrogen
} from '@ucdavis/tea';
import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/out/models/output.model';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { getBoundsOfDistance, getDistance } from 'geolib';
import fetch from 'isomorphic-fetch';
import knex from 'knex';
import OSRM from 'osrm';
import pg from 'pg';
import { getFrcsInputs, getFrcsInputsTest } from './frcsInputCalculations';
import { LCAresults, LCARunParams } from './models/lcaModels';
import { TreatedCluster } from './models/treatedcluster';
import {
  Bounds,
  ClusterRequestParams,
  ClusterResult,
  LCATotals,
  RequestParams,
  Results,
  YearlyResult
} from './models/types';
import { runFrcsOnCluster, testRunFrcsOnCluster } from './runFrcs';
import { getTransportationCost } from './transportation';

const PG_DECIMAL_OID = 1700;
pg.types.setTypeParser(PG_DECIMAL_OID, parseFloat);
dotenv.config();

const app = express();

app.use(bodyParser.json());

const port = process.env.PORT || 3000;

console.log('connecting to db', process.env.DB_HOST);
// https://knexjs.org/
const db = knex({
  client: 'pg',
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

app.post('/testCluster', async (req, res) => {
  console.log('pulling cluster from db...');
  const params: RequestParams = req.body;
  const clusters: TreatedCluster[] = await db
    .table('treatedclusters')
    .where({ treatmentid: params.treatmentid, year: 2016, cluster_no: 35611 });
  const cluster = clusters[0];

  const routeOptions: OSRM.RouteOptions = {
    coordinates: [
      [params.lng, params.lat],
      [cluster.landing_lng, cluster.landing_lat]
    ],
    annotations: ['duration', 'distance']
  };

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
      params.teaInputs.ElectricalFuelBaseYear.MoistureContent
    );
    const clusterBiomass = sumBiomass(cluster);
    const residueBiomass = frcsResult.Residue.WeightPerAcre * cluster.area;
    const transportationCostTotal = transportationCostPerGT * residueBiomass;

    clusterResults = {
      cluster_no: cluster.cluster_no,
      cluster: cluster,
      area: cluster.area,
      residueBiomass: residueBiomass,
      totalBiomass: clusterBiomass,
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
      params.teaInputs.ElectricalFuelBaseYear.MoistureContent
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

export const sumBiomass = (pixel: TreatedCluster) => {
  return (
    pixel.bmfol_2 +
    pixel.bmfol_7 +
    pixel.bmfol_15 +
    pixel.bmfol_25 +
    pixel.bmfol_35 +
    pixel.bmfol_40 +
    pixel.bmcwn_2 +
    pixel.bmcwn_7 +
    pixel.bmcwn_15 +
    pixel.bmcwn_25 +
    pixel.bmcwn_35 +
    pixel.bmcwn_40 +
    pixel.bmstm_2 +
    pixel.bmstm_7 +
    pixel.bmstm_15 +
    pixel.bmstm_25 +
    pixel.bmstm_35 +
    pixel.bmstm_40 +
    pixel.dbmsm_2 +
    pixel.dbmsm_7 +
    pixel.dbmsm_15 +
    pixel.dbmsm_25 +
    pixel.dbmsm_35 +
    pixel.dbmsm_40 +
    pixel.dbmcn_2 +
    pixel.dbmcn_7 +
    pixel.dbmcn_15 +
    pixel.dbmcn_25 +
    pixel.dbmcn_35 +
    pixel.dbmcn_40
  );
};

app.post('/process', async (req, res) => {
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
    'Helicopter Manual WT',
    'Helicopter CTL'
  ];
  if (!systems.some(x => x === params.system)) {
    res.status(400).send('System not recognized');
  }

  const teaModels = ['GPO', 'CHP', 'GP'];
  if (!teaModels.some(x => x === params.teaModel)) {
    res.status(400).send('TEA Model not recognized');
  }
  const results: Results = {
    clusterIds: [],
    errorIds: [],
    years: [],
    radius: 0
  };
  const years = [2016, 2017]; // , 2018, 2019, 2020, 2021];
  // TODO: use separate TEA endpoint just to get biomass target
  const teaOutput: OutputModGPO | OutputModCHP | OutputModGP = await getTeaOutputs(
    params.teaModel,
    params.teaInputs
  );
  const biomassTarget = teaOutput.ElectricalAndFuelBaseYear.BiomassTarget;
  console.log(`biomassTarget: ${biomassTarget}, processing...`);

  for (let index = 0; index < years.length; index++) {
    const result = await processClustersForYear(
      index,
      results.radius,
      params,
      teaOutput,
      biomassTarget,
      years[index],
      results.clusterIds,
      results.errorIds
    ).then(yearResult => {
      console.log(`year: ${years[index]}, # of clusters: ${yearResult.clusterNumbers.length}`);
      // console.log(yearResult);
      results.years.push(yearResult);
      results.clusterIds.push(...yearResult.clusterNumbers);
      results.errorIds.push(...yearResult.errorClusterNumbers);
      results.radius = yearResult.radius;
    });
  }

  console.log('RESULTS:');
  console.log(results);
  res.status(200).json(results.years);
});

const processClustersForYear = async (
  index: number,
  radius: number,
  params: RequestParams,
  teaOutput: OutputModGPO | OutputModCHP | OutputModGP,
  biomassTarget: number,
  year: number,
  usedIds: number[],
  errorIds: number[]
): Promise<YearlyResult> => {
  return new Promise(async (resolve, reject) => {
    // console.log(`year: ${year}, usedIds: ${usedIds}`);
    try {
      const results: YearlyResult = {
        year,
        clusterNumbers: [],
        numberOfClusters: 0,
        totalBiomass: 0,
        biomassTarget,
        totalArea: 0,
        totalCombinedCost: 0,
        totalResidueCost: 0,
        totalTransportationCost: 0,
        clusters: [],
        errorClusters: [],
        errorClusterNumbers: [],
        teaResults: teaOutput,
        radius
      };

      const lcaTotals: LCATotals = {
        totalDiesel: 0,
        totalGasoline: 0,
        totalJetFuel: 0,
        totalTransportationDistance: 0
      };

      while (results.totalBiomass < biomassTarget) {
        results.radius += 1000;
        console.log(
          `getting clusters from db, radius: ${results.radius}, totalBiomass: ${
            results.totalBiomass
          }, biomassTarget: ${biomassTarget}, ${results.totalBiomass < biomassTarget} ...`
        );
        const clusters: TreatedCluster[] = await getClusters(
          params,
          year,
          usedIds,
          errorIds,
          results.radius
        );
        console.log(`clusters found: ${clusters.length}`);
        console.log('sorting clusters...');
        const sortedClusters = clusters.sort(
          (a, b) =>
            getDistance(
              { lat: params.lat, lng: params.lng },
              { lat: a.landing_lat, lng: a.landing_lng }
            ) -
            getDistance(
              { lat: params.lat, lng: params.lng },
              { lat: b.landing_lat, lng: b.landing_lng }
            )
        );
        console.log('selecting clusters...');
        await selectClusters(params, biomassTarget, sortedClusters, results, lcaTotals);
      }

      results.numberOfClusters = results.clusterNumbers.length;
      // console.log(results);
      const lcaInputs: LCARunParams = {
        technology: params.teaModel,
        dieselPerKwhElectricity:
          lcaTotals.totalDiesel / params.teaInputs.ElectricalFuelBaseYear.NetElectricalCapacity,
        gasolinePerKwhElectricity:
          lcaTotals.totalGasoline / params.teaInputs.ElectricalFuelBaseYear.NetElectricalCapacity,
        jetFuelPerKwhElectricity:
          lcaTotals.totalJetFuel / params.teaInputs.ElectricalFuelBaseYear.NetElectricalCapacity,
        transportationDistance: lcaTotals.totalTransportationDistance,
        biomassPerKwhElectricity:
          results.totalBiomass / params.teaInputs.ElectricalFuelBaseYear.NetElectricalCapacity
      };
      console.log('running LCA...');
      // const lca = await runLca(lcaInputs);
      // console.log(lca);
      // results.lcaResults = lca;
      // $ / dry metric ton
      const fuelCost =
        (results.totalResidueCost + results.totalTransportationCost) / results.totalBiomass;
      const updatedTeaInputs: any = { ...params.teaInputs }; // copy original tea inputs
      updatedTeaInputs.BiomassFuelCost = fuelCost; // but update using fuel cost calculated from frcs results

      console.log('updating tea outputs...');
      const updatedTeaOutputs: any = await getTeaOutputs(params.teaModel, updatedTeaInputs);
      results.teaResults = updatedTeaOutputs;

      resolve(results);
    } catch (e) {
      console.log('ERROR!');
      console.log(e);
      reject(e.message);
    }
  });
};

const getClusters = async (
  params: RequestParams,
  year: number,
  usedIds: number[],
  errorIds: number[],
  radius: number
): Promise<TreatedCluster[]> => {
  return new Promise(async (res, rej) => {
    const bounds = getBoundsOfDistance(
      { latitude: params.lat, longitude: params.lng },
      radius // expand by 1 km at a time
    );
    const clusters: TreatedCluster[] = await db
      .table('treatedclusters')
      .where({ treatmentid: params.treatmentid, year: year })
      .whereNotIn('cluster_no', [...usedIds, ...errorIds])
      .whereBetween('landing_lat', [bounds[0].latitude, bounds[1].latitude])
      .andWhereBetween('landing_lng', [bounds[0].longitude, bounds[1].longitude]);
    res(clusters);
  });
};

const selectClusters = async (
  params: RequestParams,
  biomassTarget: number,
  sortedClusters: TreatedCluster[],
  results: YearlyResult,
  lcaTotals: LCATotals
) => {
  return new Promise(async (res, rej) => {
    for (const cluster of sortedClusters) {
      if (results.totalBiomass >= biomassTarget) {
        // results.skippedClusters.push(cluster); // keeping for testing for now
        break;
      } else {
        const routeOptions: OSRM.RouteOptions = {
          coordinates: [
            [params.lng, params.lat],
            [cluster.landing_lng, cluster.landing_lat]
          ],
          annotations: ['duration', 'distance']
        };

        // currently distance is the osrm generated distance between each landing site and the facility location
        const route: any = await getRouteDistanceAndDuration(routeOptions);
        let distance = route.distance;
        distance = distance / 1000; // m to km
        distance = distance * 0.5; // to compensate for the distance being too high, multiply by factor of 0.5
        // TODO: remove factor mult when we update distance calculation

        const duration = route.duration / 3600; // seconds to hours
        // TODO: update how we are calculating transportation cost
        // in reality a truck is not taking 1 trip per cluster
        // could be multiple trips, depending on load
        const transportationCostPerGT = getTransportationCost(
          distance,
          duration,
          params.dieselFuelPrice
        );

        try {
          const frcsResult: OutputVarMod = await runFrcsOnCluster(
            cluster,
            params.system,
            distance * 0.621371, // move in distance km to miles
            params.dieselFuelPrice,
            params.teaInputs.ElectricalFuelBaseYear.MoistureContent
          );

          // use frcs calculated available feedstock
          const clusterBiomass = frcsResult.Residue.WeightPerAcre * cluster.area;
          const transportationCostTotal = transportationCostPerGT * clusterBiomass;

          results.totalBiomass += clusterBiomass;
          results.totalArea += cluster.area;
          results.totalCombinedCost += frcsResult.Total.CostPerAcre * cluster.area;
          results.totalTransportationCost += transportationCostTotal;
          results.totalResidueCost += frcsResult.Residue.CostPerAcre * cluster.area;
          lcaTotals.totalDiesel += frcsResult.Residue.DieselPerAcre * cluster.area;
          lcaTotals.totalGasoline += frcsResult.Residue.GasolinePerAcre * cluster.area;
          lcaTotals.totalJetFuel += frcsResult.Residue.JetFuelPerAcre * cluster.area;
          lcaTotals.totalTransportationDistance += distance;

          results.clusters.push({
            cluster_no: cluster.cluster_no,
            area: cluster.area,
            biomass: clusterBiomass,
            distance: distance,
            combinedCost: frcsResult.Total.CostPerAcre * cluster.area,
            residueCost: frcsResult.Residue.CostPerAcre * cluster.area,
            transportationCost: transportationCostTotal,
            frcsResult: frcsResult,
            lat: cluster.landing_lat,
            lng: cluster.landing_lng
          });
          results.clusterNumbers.push(cluster.cluster_no);
        } catch (err) {
          // swallow errors frcs throws and push the error message instead
          results.errorClusters.push({
            cluster_no: cluster.cluster_no,
            area: cluster.area,
            biomass: 0,
            error: err.message,
            slope: cluster.slope
          });
          results.errorClusterNumbers.push(cluster.cluster_no);
        }
      }
    }
    res();
  });
};

const getRouteDistanceAndDuration = (routeOptions: OSRM.RouteOptions) => {
  return new Promise((resolve, reject) => {
    osrm.route(routeOptions, async (err, result) => {
      if (err) {
        reject(err);
      }
      const distance = result.routes[0].distance;
      const duration = result.routes[0].duration;
      resolve({ distance, duration });
    });
  });
};

export const runLca = async (inputs: LCARunParams) => {
  const results: LCAresults = await fetch(
    `https://lifecycle-analysis.azurewebsites.net/lcarun?technology=\
       ${inputs.technology}&diesel=${inputs.dieselPerKwhElectricity}\
       &gasoline=${inputs.gasolinePerKwhElectricity}\
       &jetfuel=${inputs.jetFuelPerKwhElectricity}\
       &distance=${inputs.transportationDistance}&biomass=${inputs.biomassPerKwhElectricity}`,
    {
      mode: 'cors',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(res => res.json());
  return results;
};

const getTeaOutputs = async (type: string, inputs: any) => {
  let result: OutputModGPO | OutputModCHP | OutputModGP;
  if (type === 'GPO') {
    result = genericPowerOnly(inputs);
  } else if (type === 'CHP') {
    result = genericCombinedHeatPower(inputs);
  } else {
    // type === 'GP' checked before this is called
    result = gasificationPower(inputs);
  }
  return result;
};
// tslint:disable-next-line: max-file-line-count
app.listen(port, () => console.log(`Listening on port ${port}!`));
