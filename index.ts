import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express from 'express';
import { getBoundsOfDistance } from 'geolib';
import knex from 'knex';
import { TreatedCluster } from './models/treatedcluster';
import { runFrcsOnCluster } from './runFrcs';

dotenv.config();

const app = express();

app.use(bodyParser.json());

const port = process.env.PORT || 3000;

console.log('connecting to db', process.env.DB_HOST);
// https://knexjs.org/
const pg = knex({
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

app.post('/process', async (req, res) => {
  const params: RequestParams = req.body;
  console.log('PARAMS');
  console.log(params);
  const bounds = getBoundsOfDistance(
    { latitude: params.lat, longitude: params.lng },
    params.radius
  );
  console.log('BOUNDS:');
  console.log(bounds);
  try {
    const clusters: TreatedCluster[] = await pg
      .table('treatedclusters')
      .whereBetween('center_lat', [bounds[0].latitude, bounds[1].latitude])
      .andWhereBetween('center_lng', [bounds[0].longitude, bounds[1].longitude]);
    // console.log('CLUSTERS: ' + clusters.length);
    console.log(clusters[1]);
    const results = await runFrcsOnCluster(clusters[1]);
    // const results = clusters.map(async cluster => {
    //   try {
    //     const result = await runFrcsOnCluster(cluster);
    //     console.log('RESULT: ');
    //     console.log(result);
    //     return result;
    //   } catch (err) {
    //     console.log('ERROR:');
    //     console.log(err);
    //     return {};
    //   }
    // });
    console.log('RESULTS: ');
    console.log(results);
    res.status(200).json(results);
  } catch (e) {
    res.status(400).send(e.message);
  }
});

app.listen(port, () => console.log(`Listening on port ${port}!`));
