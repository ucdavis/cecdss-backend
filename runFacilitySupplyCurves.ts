import dotenv from 'dotenv';
import fs from 'fs';
import _fetch from 'isomorphic-fetch';
import knex from 'knex';
import OSRM from 'osrm';
import pg from 'pg';

import { RequestByDistanceParams } from 'models/types';
import { processClustersByDistance } from './processDistance';

// Run all supply curves for a given facility and treatment (one per system)

const PG_DECIMAL_OID = 1700;
pg.types.setTypeParser(PG_DECIMAL_OID, parseFloat);
dotenv.config();

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
    port: Number(process.env.DB_PORT),
  },
});
console.log('connected to db. connecting to osrm...');

const osrm = new (OSRM as any)({
  path: process.env.OSRM || './data/california-latest.osrm',
  mmap_memory: false,
});

console.log('connected to osrm');

const run = async () => {
  const facilityLat = process.env.FACILITY_LAT
    ? parseFloat(process.env.FACILITY_LAT)
    : 39.710361488650186;
  const facilityLng = process.env.FACILITY_LNG
    ? parseFloat(process.env.FACILITY_LNG)
    : -120.21618958848077;
  const facilityName = process.env.FACILITY_NAME || 'DefaultFacility';

  const bandsInMiles = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const treatments = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
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

  // nested loop over all systems and treatments
  for (const treatmentId of treatments) {
    for (const harvestSystem of systems) {
      console.log(`running for facility ${facilityName} at (${facilityLat}, ${facilityLng})`);
      console.log(`processing ${treatmentId}: ${harvestSystem}`);

      if (harvestSystem === 'Ground-Based CTL') {
        console.log('skipping Ground-Based CTL because of move-in performance issues');
        continue;
      }

      // determine csv file name and only run if file does not already exist
      let fileName = `${facilityName}_${treatmentId}_${harvestSystem}.csv`;

      // replace non-alphanumeric characters with underscores
      fileName = fileName.replace(/[^a-z0-9]/gi, '_');

      const fileWithDirectory = (process.env.CSV_DIR || './data/') + fileName;

      // continue if filename is present on disk
      if (fs.existsSync(fileWithDirectory)) {
        console.log(
          `skipping ${treatmentId}-${harvestSystem} because file already exists for this facility`
        );
        continue;
      }

      const allResults = [];

      // keep running totals across all bands
      let runningTotalDryFeedstock = 0;
      let runningTotalCost = 0;

      // TODO: get rid of cash flow stuff and any other stuff that we don't need
      const params: RequestByDistanceParams = {
        facilityLat: facilityLat,
        facilityLng: facilityLng,
        system: harvestSystem,
        treatmentid: treatmentId,
        dieselFuelPrice: 3.251,
        firstYear: 2016,
        year: 2016,
        minRadiusInMeters: 0,
        maxRadiusInMeters: 0,
        teaModel: 'GPO',
        annualGeneration: 186150000,
        moistureContent: 50,
        cashFlow: {
          Year: 3,
          EquityRecovery: 5307860.705204948,
          EquityInterest: 4878958.389822159,
          EquityPrincipalPaid: 428902.3153827889,
          EquityPrincipalRemaining: 32097486.950098272,
          DebtRecovery: 7997857.199581821,
          DebtInterest: 4674582.338474968,
          DebtPrincipalPaid: 3323274.861106853,
          DebtPrincipalRemaining: 90168371.9083925,
          NonFuelExpenses: 6046157.799999999,
          DebtReserve: 0,
          Depreciation: 6644731.9140524315,
          IncomeCapacity: 4150000,
          InterestOnDebtReserve: 399892.85997909104,
          TaxesWoCredit: 1342913.2763062133,
          TaxCredit: 1746453.5293499993,
          Taxes: 162218.89510713916,
          EnergyRevenueRequired: 23242211.267465867,
          BiomassFuelCost: 8278009.527551053,
          LcfsCreditRevenue: 0,
        },
        costOfEquity: 15,
        generalInflation: 2.1,
        carbonCreditPrice: 196,
        energyEconomyRatio: 1,
        includeCarbonCredit: false,
      };

      for (let i = 1; i < bandsInMiles.length; i++) {
        const milesToMeters = 1609.34;

        const minBandInMeters = bandsInMiles[i - 1] * milesToMeters;
        const maxBandInMeters = bandsInMiles[i] * milesToMeters;

        // params just for this run
        const runParams = {
          ...params,
          minRadiusInMeters: minBandInMeters,
          maxRadiusInMeters: maxBandInMeters,
        };

        const distanceResult = await processClustersByDistance(
          db,
          osrm,
          minBandInMeters,
          maxBandInMeters,
          runParams,
          runParams.year
        );
        console.log(
          `distance: ${runParams.minRadiusInMeters} -> ${runParams.maxRadiusInMeters}, # of clusters: ${distanceResult.clusterNumbers.length}`
        );

        const totalCostPerDryTon =
          (distanceResult.totalHarvestCost +
            distanceResult.totalTransportationCost +
            distanceResult.totalMoveInCost) /
          distanceResult.totalDryFeedstock;

        const totalCost = totalCostPerDryTon * distanceResult.totalDryFeedstock;

        runningTotalCost += totalCost || 0;
        runningTotalDryFeedstock += distanceResult.totalDryFeedstock || 0;

        const importantData = {
          system: params.system,
          treatment: params.treatmentid,
          teaModel: params.teaModel,
          band: bandsInMiles[i],
          totalDryFeedstock: distanceResult.totalDryFeedstock || 0,
          totalCost: totalCost || 0,
          totalCostPerDryTon: totalCostPerDryTon || 0,
          runningTotalDryFeedstock,
          runningTotalCost,
        };

        allResults.push(importantData);
      }

      let fileContents =
        'system,treatment,teaModel,band,totalDryFeedstock,totalCost,totalCostPerDryTon,runningTotalDryFeedstock,runningTotalCost\n';
      allResults.forEach((result) => {
        fileContents += `${result.system},${result.treatment},${result.teaModel},${result.band},${result.totalDryFeedstock},${result.totalCost},${result.totalCostPerDryTon},${result.runningTotalDryFeedstock},${result.runningTotalCost}\n`;
      });

      fs.writeFileSync(fileWithDirectory, fileContents);
    }
  }
};

run()
  .then(() => {
    console.log('done processing all bands, treatments and systems');
    process.exit();
  })
  .catch((err) => {
    console.log(err);
  });
