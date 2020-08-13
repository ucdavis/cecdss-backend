import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/out/models/output.model';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import knex from 'knex';
import OSRM from 'osrm';
import { performance } from 'perf_hooks';
import pg from 'pg';
import { getFrcsInputsTest } from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';
import { RequestParamsTest, RequestParamsYear, RequestParamsYears, Results } from './models/types';
import { getTeaOutputs, processClustersForYear } from './processYear';
import { testRunFrcsOnCluster } from './runFrcs';
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

app.post('/processYears', async (req, res) => {
  const t0 = performance.now();
  const params: RequestParamsYears = req.body;
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
  const results: Results = {
    clusterIds: [],
    errorIds: [],
    years: [],
    radius: 0
  };
  // TODO: use separate TEA endpoint just to get biomass target
  const teaOutput: OutputModGPO | OutputModCHP | OutputModGP = await getTeaOutputs(
    params.teaModel,
    params.teaInputs
  );
  const biomassTarget = teaOutput.ElectricalAndFuelBaseYear.BiomassTarget;
  console.log(`biomassTarget: ${biomassTarget}, processing...`);
  for (let index = 0; index < params.years.length; index++) {
    const yearResult = await processClustersForYear(
      db,
      osrm,
      results.radius,
      params,
      teaOutput,
      biomassTarget,
      params.years[index],
      results.clusterIds,
      results.errorIds
    );
    console.log(`year: ${params.years[index]}, # of clusters: ${yearResult.clusterNumbers.length}`);
    // console.log(yearResult);
    results.years.push(yearResult);
    results.clusterIds.push(...yearResult.clusterNumbers);
    results.errorIds.push(...yearResult.errorClusterNumbers);
    results.radius = yearResult.radius;
  }
  console.log('RESULTS:');
  console.log(results);

  const t1 = performance.now();
  console.log(`Running took ${t1 - t0} milliseconds.`);

  res.status(200).json(results.years);
});

app.post('/process', async (req, res) => {
  const t0 = performance.now();
  const params: RequestParamsYear = req.body;
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

  // TODO: use separate TEA endpoint just to get biomass target
  const teaOutput: OutputModGPO | OutputModCHP | OutputModGP = await getTeaOutputs(
    params.teaModel,
    params.teaInputs
  );
  const biomassTarget = teaOutput.ElectricalAndFuelBaseYear.BiomassTarget;
  console.log(`biomassTarget: ${biomassTarget}, processing...`);

  const yearResult = await processClustersForYear(
    db,
    osrm,
    params.radius,
    params,
    teaOutput,
    biomassTarget,
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
      params.teaInputs.ElectricalFuelBaseYear.MoistureContent
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
