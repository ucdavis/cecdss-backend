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
import knex from 'knex';
import OSRM from 'osrm';
import pg from 'pg';
import {
  ElectricalFuelBaseYearModCHPClass,
  ElectricalFuelBaseYearModGPClass,
  ElectricalFuelBaseYearModGPOClass
} from './models/classes';
import { TreatedCluster } from './models/treatedcluster';
import { ClusterRequestParams, ClusterResult, RequestParams, Results } from './models/types';
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

  const teaOutput: any = await getTeaOutputs(params.teaModel, params.teaInputs);
  console.log('TEA OUTPUT:');
  console.log(teaOutput);
  let biomassTarget = 0;
  if (
    params.teaModel === 'GPO' ||
    params.teaModel === 'CHP' // &&
    // (teaOutput.ElectricalAndFuelBaseYear instanceof ElectricalFuelBaseYearModGPOClass ||
    //   teaOutput.ElectricalAndFuelBaseYear instanceof ElectricalFuelBaseYearModCHPClass)
  ) {
    console.log('GPO or CHP');
    biomassTarget = teaOutput.ElectricalAndFuelBaseYear.AnnualFuelConsumption; // dry metric tons / year
  } else if (
    params.teaModel === 'GP' // &&
    // teaOutput.ElectricalAndFuelBaseYear instanceof ElectricalFuelBaseYearModGPClass
  ) {
    console.log('GP');
    biomassTarget = teaOutput.ElectricalAndFuelBaseYear.AnnualBiomassConsumptionDryMass;
  } else {
    console.log('what');
  }
  console.log('biomassTarget: ' + biomassTarget);
  const bounds = getBoundsOfDistance(
    { latitude: params.lat, longitude: params.lng },
    params.radius * 1000 // km to m
  );

  try {
    const clusters: TreatedCluster[] = await db
      .table('treatedclusters')
      .whereBetween('landing_lat', [bounds[0].latitude, bounds[1].latitude])
      .andWhereBetween('landing_lng', [bounds[0].longitude, bounds[1].longitude]);
    const results: Results = {
      teaResults: teaOutput,
      numberOfClusters: 0,
      totalBiomass: 0,
      totalArea: 0,
      totalCombinedCost: 0,
      totalResidueCost: 0,
      totalTransportationCost: 0,
      clusters: [],
      skippedClusters: [],
      errorClusters: []
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
          combinedCost: frcsResult.TotalPerAcre * cluster.area,
          biomass: clusterBiomass, // TODO: maybe just use residue biomass
          distance: distance,
          residueCost: frcsResult.Residue.ResiduePerAcre * cluster.area,
          transportationCost: transportationCostTotal,
          frcsResult: frcsResult,
          lat: cluster.landing_lat,
          lng: cluster.landing_lng
        });
      } catch (err) {
        // swallow errors frcs throws and push the error message instead
        results.errorClusters.push({
          cluster_no: cluster.cluster_no,
          area: cluster.area,
          biomass: clusterBiomass,
          error: err.message
        });
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

    for (const cluster of clusterCosts) {
      if (results.totalBiomass >= biomassTarget) {
        results.skippedClusters.push(cluster); // keeping for testing for now
        // break
      } else {
        console.log(cluster.cluster_no + ',');
        results.totalBiomass += cluster.biomass;
        results.totalArea += cluster.area;
        results.totalCombinedCost += cluster.combinedCost;
        results.totalTransportationCost += cluster.transportationCost;
        results.totalResidueCost += cluster.residueCost;
        results.clusters.push(cluster);
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
    results.numberOfClusters = results.clusters.length;
    // params.teaInputs.FuelCost = results.totalCost / results.totalBiomass;
    // const teaOutput2 = genericPowerOnly(params.teaInputs);
    res.status(200).json(results);
  } catch (e) {
    res.status(400).send(e.message);
  }
});

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

export const sumBiomass = (cluster: TreatedCluster) => {
  return (
    cluster.bmfol_0 +
    cluster.bmfol_2 +
    cluster.bmfol_7 +
    cluster.bmfol_15 +
    cluster.bmfol_25 +
    // pixel.bmfol_35 +
    // pixel.bmfol_40 +
    cluster.bmcwn_0 +
    cluster.bmcwn_2 +
    cluster.bmcwn_7 +
    cluster.bmcwn_15 +
    cluster.bmcwn_25 +
    // pixel.bmcwn_35 +
    // pixel.bmcwn_40 +
    cluster.bmstm_0 +
    cluster.bmstm_2 +
    cluster.bmstm_7 +
    cluster.bmstm_15 +
    cluster.bmstm_25
    // + pixel.bmstm_35 +
    // pixel.bmstm_40
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
