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
import { getBoundsOfDistance } from 'geolib';
import fetch from 'isomorphic-fetch';
import knex from 'knex';
import OSRM from 'osrm';
import pg from 'pg';
import { LCAresults, LCARunParams } from './models/lcaModels';
import { TreatedCluster } from './models/treatedcluster';
import {
  ClusterRequestParams,
  ClusterResult,
  RequestParams,
  Results,
  YearlyResult
} from './models/types';
import { runFrcsOnCluster } from './runFrcs';
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
    years: []
  };
  const years = [2016, 2017, 2018, 2019, 2020, 2021];
  // TODO: use separate TEA endpoint just to get biomass target
  const teaOutput: OutputModGPO | OutputModCHP | OutputModGP = await getTeaOutputs(
    params.teaModel,
    params.teaInputs
  );
  const biomassTarget = teaOutput.ElectricalAndFuelBaseYear.BiomassTarget;
  console.log(`biomassTarget: ${biomassTarget}, processing...`);
  const bounds = getBoundsOfDistance(
    { latitude: params.lat, longitude: params.lng },
    params.radius * 1000 // km to m
  );

  for (let index = 0; index < years.length; index++) {
    const result = await processClustersForYear(
      params,
      teaOutput,
      biomassTarget,
      bounds,
      years[index],
      results.clusterIds
    ).then(yearResult => {
      console.log(`year: ${years[index]}, clusterNos: ${yearResult.clusterNumbers}`);
      // console.log(yearResult);
      results.years.push(yearResult);
      results.clusterIds.push(...yearResult.clusterNumbers);
    });
  }

  console.log('RESULTS:');
  console.log(results);
  res.status(200).json(results.years);
});

const processClustersForYear = async (
  params: RequestParams,
  teaOutput: OutputModGPO | OutputModCHP | OutputModGP,
  biomassTarget: number,
  bounds: any,
  year: number,
  usedIds: number[]
): Promise<YearlyResult> => {
  return new Promise(async (resolve, reject) => {
    console.log(`year: ${year}, usedIds: ${usedIds}`);

    try {
      const clusters: TreatedCluster[] = await db
        .table('butte_treatedclusters')
        .where({ treatmentid: params.treatmentid, year: year })
        .whereNotIn('cluster_no', usedIds)
        .whereBetween('landing_lat', [bounds[0].latitude, bounds[1].latitude])
        .andWhereBetween('landing_lng', [bounds[0].longitude, bounds[1].longitude]);
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
        // clusters: [],
        teaResults: teaOutput
      };

      const clusterCosts: ClusterResult[] = [];

      // first generate costs for each cluster
      for (const cluster of clusters) {
        const routeOptions: OSRM.RouteOptions = {
          coordinates: [
            [params.lng, params.lat],
            [cluster.landing_lng, cluster.landing_lat]
          ],
          annotations: ['duration', 'distance']
        };

        const route: any = await getRouteDistanceAndDuration(routeOptions);
        let distance = route.distance;
        distance = distance / 1000; // m to km

        const duration = route.duration / 3600; // seconds to hours
        const transportationCostPerGT = getTransportationCost(distance, duration);
        const clusterBiomass = sumBiomass(cluster);
        const transportationCostTotal = transportationCostPerGT * clusterBiomass;
        try {
          const frcsResult: OutputVarMod = await runFrcsOnCluster(
            cluster,
            params.system,
            distance * 0.621371 // move in distance km to miles
          );

          clusterCosts.push({
            cluster_no: cluster.cluster_no,
            area: cluster.area,
            biomass: clusterBiomass, // TODO: maybe just use residue biomass
            distance: distance,
            combinedCost: frcsResult.Total.CostPerAcre * cluster.area,
            residueCost: frcsResult.Residue.CostPerAcre * cluster.area,
            transportationCost: transportationCostTotal,
            frcsResult: frcsResult,
            lat: cluster.landing_lat,
            lng: cluster.landing_lng
          });
        } catch (err) {
          // swallow errors frcs throws and push the error message instead
          // results.errorClusters.push({
          //   cluster_no: cluster.cluster_no,
          //   area: cluster.area,
          //   biomass: clusterBiomass,
          //   error: err.message
          // });
        }
      }
      clusterCosts.sort((a, b) => {
        return (
          (a.residueCost + a.transportationCost) / a.biomass -
          (b.residueCost + b.transportationCost) / b.biomass
        );
      });
      // clusterCosts.sort((a, b) => {
      //   return a.distance - b.distance;
      // });

      const lcaTotals = {
        totalDiesel: 0,
        totalGasoline: 0,
        totalJetFuel: 0,
        totalTransportationDistance: 0
      };

      for (const cluster of clusterCosts) {
        if (results.totalBiomass >= biomassTarget) {
          // results.skippedClusters.push(cluster); // keeping for testing for now
          break;
        } else {
          // console.log(cluster.cluster_no + ',');
          results.totalBiomass += cluster.biomass;
          results.totalArea += cluster.area;
          results.totalCombinedCost += cluster.combinedCost;
          results.totalTransportationCost += cluster.transportationCost;
          results.totalResidueCost += cluster.residueCost;
          lcaTotals.totalDiesel += cluster.frcsResult.Residue.DieselPerAcre * cluster.area;
          lcaTotals.totalGasoline += cluster.frcsResult.Residue.GasolinePerAcre * cluster.area;
          lcaTotals.totalJetFuel += cluster.frcsResult.Residue.JetFuelPerAcre * cluster.area;
          lcaTotals.totalTransportationDistance += cluster.distance;

          // results.clusters.push(cluster);
          results.clusterNumbers.push(cluster.cluster_no);
          // await db.table('cluster_results_biomass_cost').insert({
          //   cluster_no: cluster.cluster_no,
          //   biomass: cluster.biomass,
          //   totalcost: cluster.totalCost,
          //   area: cluster.area,
          //   distance: cluster.distance,
          //   harvestcost: cluster.harvestCost,
          //   transportationcost: cluster.transportationCost,
          //   residuewt: cluster.frcsResult.Residue.ResidueWt,
          //   residuepergt: cluster.frcsResult.Residue.ResiduePerGT,
          //   residueperacre: cluster.frcsResult.Residue.ResiduePerAcre,
          //   lat: cluster.lat,
          //   lng: cluster.lng
          // });
        }
      }
      results.numberOfClusters = results.clusterNumbers.length;
      console.log('running LCA...');
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
      const lca = await runLca(lcaInputs);
      // console.log(lca);
      results.lcaResults = lca;
      // $ / dry metric ton
      const fuelCost =
        (results.totalResidueCost + results.totalTransportationCost) / results.totalBiomass;
      const updatedTeaInputs: any = { ...params.teaInputs }; // copy original tea inputs
      updatedTeaInputs.BiomassFuelCost = fuelCost; // but update using fuel cost calculated from frcs results

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

export const sumBiomass = (cluster: TreatedCluster) => {
  // TODO: include missing variables
  return (
    cluster.bmfol_2 +
    cluster.bmfol_7 +
    cluster.bmfol_15 +
    cluster.bmfol_25 +
    cluster.bmfol_35 +
    cluster.bmfol_40 +
    cluster.bmcwn_2 +
    cluster.bmcwn_7 +
    cluster.bmcwn_15 +
    cluster.bmcwn_25 +
    cluster.bmcwn_35 +
    cluster.bmcwn_40 +
    cluster.bmstm_2 +
    cluster.bmstm_7 +
    cluster.bmstm_15 +
    cluster.bmstm_25 +
    cluster.bmstm_35 +
    cluster.bmstm_40 +
    cluster.dbmsm_2 +
    cluster.dbmsm_7 +
    cluster.dbmsm_15 +
    cluster.dbmsm_25 +
    cluster.dbmsm_35 +
    cluster.dbmsm_40 +
    cluster.dbmcn_2 +
    cluster.dbmcn_7 +
    cluster.dbmcn_15 +
    cluster.dbmcn_25 +
    cluster.dbmcn_35 +
    cluster.dbmcn_40
  );
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
app.listen(port, () => console.log(`Listening on port ${port}!`));
