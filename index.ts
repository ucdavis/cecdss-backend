import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express from 'express';
import { getBoundsOfDistance, getDistance } from 'geolib';
import knex from 'knex';
import pg from 'pg';
import { TreatedCluster } from './models/treatedcluster';
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

interface RequestParams {
  lat: number;
  lng: number;
  radius: number;
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.post('/process', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
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
    const results: any[] = [];
    results.push({ totalClusters: clusters.length });
    for (const cluster of clusters) {
      try {
        const result = await runFrcsOnCluster(cluster);
        const distance = getDistance(
          { latitude: params.lat, longitude: params.lng },
          { latitude: cluster.landing_lat, longitude: cluster.landing_lng }
        );
        results.push({ cluster: cluster, frcsOutput: result, distance: distance });
      } catch (err) {
        // swallow errors frcs throws and push the error message instead
        results.push({ cluster: cluster, frcsOutput: err.message });
      }
    }
    res.status(200).json(results);
  } catch (e) {
    res.status(400).send(e.message);
  }
});

app.listen(port, () => console.log(`Listening on port ${port}!`));
