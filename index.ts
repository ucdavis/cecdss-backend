import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { genericPowerOnly } from '@ucdavis/tea';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express from 'express';
import { getBoundsOfDistance, getDistance } from 'geolib';
import knex from 'knex';
import OSRM from 'osrm';
import pg from 'pg';
import { TreatedCluster } from './models/treatedcluster';
import { ClusterRequestParams, RequestParams, Results } from './models/types';
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

const osrm = new OSRM('./data/california-latest.osrm');

// allow cors
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.post('/processCluster', async (req, res) => {
  const params: ClusterRequestParams = req.body;
  console.log('PARAMS');
  console.log(params);
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

  try {
    const clusters: TreatedCluster[] = await db
      .table('treatedclusters')
      .where({ cluster_no: params.clusterId });
    const cluster = clusters[0];
    const results: Results = {
      numberOfClusters: clusters.length,
      totalBiomass: 0,
      totalArea: 0,
      totalCost: 0,
      clusters: [],
      skippedClusters: []
    };
    const clusterBiomass = sumBiomass(cluster);
    try {
      const result: OutputVarMod = await runFrcsOnCluster(cluster, params.system, 2);

      results.totalBiomass += clusterBiomass;
      results.totalArea += cluster.area;
      results.totalCost += result.TotalPerAcre * cluster.area;
      results.clusters.push({
        cluster_no: cluster.cluster_no,
        area: cluster.area,
        cost: result.TotalPerAcre * cluster.area,
        biomass: clusterBiomass,
        distance: 0,
        transportationCost: 0,
        frcsResult: result
      });
    } catch (err) {
      // swallow errors frcs throws and push the error message instead
      results.skippedClusters.push({
        cluster_no: cluster.cluster_no,
        area: cluster.area,
        biomass: clusterBiomass,
        cost: 0,
        distance: 0,
        transportationCost: 0,
        frcsResult: err.message
      });
    }
    console.log(results);
    res.status(200).json(results);
  } catch (e) {
    res.status(400).send(e.message);
  }
});

app.post('/process', async (req, res) => {
  const params: RequestParams = req.body;
  console.log('PARAMS');
  console.log(params);
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
  const bounds = getBoundsOfDistance(
    { latitude: params.lat, longitude: params.lng },
    params.radius
  );

  try {
    const clusters: TreatedCluster[] = await db
      .table('treatedclusters')
      .whereBetween('landing_lat', [bounds[0].latitude, bounds[1].latitude])
      .andWhereBetween('landing_lng', [bounds[0].longitude, bounds[1].longitude]);
    const results: Results = {
      numberOfClusters: clusters.length,
      totalBiomass: 0,
      totalArea: 0,
      totalCost: 0,
      clusters: [],
      skippedClusters: []
    };
    for (const cluster of clusters) {
      // const distance = getDistance(
      //   { latitude: params.lat, longitude: params.lng },
      //   { latitude: cluster.landing_lat, longitude: cluster.landing_lng }
      // );
      const routeOptions: OSRM.RouteOptions = {
        coordinates: [
          [params.lng, params.lat],
          [cluster.landing_lng, cluster.landing_lat]
        ],
        annotations: ['duration', 'distance']
      };
      const route: any = await getRouteDistanceAndDuration(routeOptions);
      console.log(
        `cluster: ${cluster.cluster_no} duration: ${route.duration} distance: ${
          route.distance
        }(m) ${route.distance * 0.00062137} (mi)`
      );
      const transportationCostPerGT = getTransportationCost(route.distance, route.duration);
      const clusterBiomass = sumBiomass(cluster);
      try {
        const frcsResult: OutputVarMod = await runFrcsOnCluster(
          cluster,
          params.system,
          route.distance * 0.00062137
        );
        results.totalBiomass += clusterBiomass;
        results.totalArea += cluster.area;
        results.totalCost += frcsResult.TotalPerAcre * cluster.area;
        results.clusters.push({
          cluster_no: cluster.cluster_no,
          area: cluster.area,
          cost: frcsResult.TotalPerAcre * cluster.area,
          biomass: clusterBiomass,
          distance: route.distance,
          transportationCost: transportationCostPerGT,
          frcsResult: frcsResult
        });
      } catch (err) {
        // swallow errors frcs throws and push the error message instead
        results.skippedClusters.push({
          cluster_no: cluster.cluster_no,
          area: cluster.area,
          biomass: clusterBiomass,
          cost: 0,
          distance: route.distance,
          transportationCost: 0,
          frcsResult: err.message
        });
      }
    }
    console.log(results);
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
      console.log(result.waypoints);
      console.log(result.routes);
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
app.listen(port, () => console.log(`Listening on port ${port}!`));
