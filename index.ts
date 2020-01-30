import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express from 'express';
import { getBoundsOfDistance, getDistance } from 'geolib';
import knex from 'knex';
import pg from 'pg';
import { TreatedCluster } from './models/treatedcluster';
import { RequestParams, Results } from './models/types';
import { runFrcsOnCluster } from './runFrcs';

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
    database: 'plumas-kmeans'
  }
});

// allow cors for local dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.post('/process', async (req, res) => {
  const params: RequestParams = req.body;
  console.log('PARAMS');
  console.log(params);
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
      clusters: []
    };
    for (const cluster of clusters) {
      const distance = getDistance(
        { latitude: params.lat, longitude: params.lng },
        { latitude: cluster.landing_lat, longitude: cluster.landing_lng }
      );
      const clusterBiomass = sumBiomass(cluster);
      try {
        const result: OutputVarMod = await runFrcsOnCluster(cluster);
        results.totalBiomass += clusterBiomass;
        results.clusters.push({
          cluster_no: cluster.cluster_no,
          totalBiomass: clusterBiomass,
          distance: distance,
          frcsResult: result
        });
      } catch (err) {
        // swallow errors frcs throws and push the error message instead
        results.clusters.push({
          cluster_no: cluster.cluster_no,
          totalBiomass: clusterBiomass,
          distance: distance,
          frcsResult: err.message
        });
      }
    }
    res.status(200).json(results);
  } catch (e) {
    res.status(400).send(e.message);
  }
});

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
