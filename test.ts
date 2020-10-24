// import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/out/models/output.model';
// import dotenv from 'dotenv';
// import knex from 'knex';
// import OSRM from 'osrm';
// import { RequestParamsTest, RequestParamsTestYears, YearlyResultTest } from './models/types';
// import { getTeaOutputs, processClustersForYear } from './processYear';

// dotenv.config();
// console.log('connecting to db', process.env.DB_HOST);
// // https://knexjs.org/
// const db = knex({
//   client: 'pg',
//   connection: {
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASS,
//     database: process.env.DB_NAME,
//     port: Number(process.env.DB_PORT)
//   }
// });
// console.log('connected to db. connected to osrm...');

// const osrm = new OSRM('./data/california-latest.osrm');
// console.log('connected to osrm');
// const test = async () => {
//   console.log('test.....');
//   const params: RequestParamsTestYears = {
//     years: [2016],
//     facilityLat: 39.644308,
//     facilityLng: -121.553971,
//     teaModel: 'GPO',
//     teaInputs: {
//       CapitalCost: 70000000,
//       ElectricalFuelBaseYear: {
//         NetElectricalCapacity: 25000,
//         CapacityFactor: 85,
//         MoistureContent: 50,
//         NetStationEfficiency: 20,
//         FuelHeatingValue: 18608,
//         FuelAshConcentration: 5
//       },
//       ExpensesBaseYear: {
//         BiomassFuelCost: 22.05,
//         LaborCost: 2000000,
//         MaintenanceCost: 1500000,
//         InsurancePropertyTax: 1400000,
//         Utilities: 200000,
//         Management: 200000,
//         OtherOperatingExpenses: 400000,
//         AshDisposal: 100000
//       },
//       Taxes: { FederalTaxRate: 34, StateTaxRate: 9.6, ProductionTaxCredit: 0.009 },
//       Financing: { DebtRatio: 75, InterestRateOnDebt: 5, EconomicLife: 20, CostOfEquity: 15 },
//       IncomeOtherThanEnergy: {
//         CapacityPayment: 166,
//         InterestRateOnDebtReserve: 5,
//         SalesPriceForChar: 0
//       },
//       EscalationInflation: {
//         GeneralInflation: 2.1,
//         EscalationBiomassFuel: 2.1,
//         EscalationProductionTaxCredit: 2.1,
//         EscalationHeatSales: 2.1,
//         EscalationOther: 2.1,
//         EscalationDualFuel: 2.1,
//         EscalationCharSales: 2.1
//       },
//       TaxCreditFrac: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
//     },
//     transmission: {
//       VoltageClass: '230 kV Single Circuit',
//       ConductorType: 'ACSS',
//       Structure: 'Lattice',
//       LengthCategory: '> 10 miles',
//       NewOrReconductor: 'New',
//       AverageTerrainMultiplier: 1,
//       Miles: {
//         Forested: 0,
//         Flat: 1,
//         Wetland: 0,
//         Farmland: 0,
//         Desert: 0,
//         Urban: 0,
//         Hills: 0,
//         Mountain: 0,
//         Zone1: 0,
//         Zone2: 0,
//         Zone3: 1,
//         Zone4: 0,
//         Zone5: 0,
//         Zone6: 0,
//         Zone7: 0,
//         Zone8: 0,
//         Zone9: 0,
//         Zone10: 0,
//         Zone11: 0,
//         Zone12: 0
//       }
//     },
//     unloadingCost: 10000,
//     includeUnloadingCost: true
//   };

//   const systems = [
//     'Ground-Based Mech WT',
//     'Ground-Based Manual WT',
//     'Ground-Based Manual Log',
//     'Ground-Based CTL',
//     'Cable Manual WT/Log',
//     'Cable Manual WT',
//     'Cable Manual Log',
//     'Cable CTL',
//     'Helicopter Manual Log',
//     'Helicopter CTL'
//   ];
//   const treatments = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
//   const teaOutput: OutputModGPO | OutputModCHP | OutputModGP = await getTeaOutputs(
//     params.teaModel,
//     params.teaInputs
//   );
//   const biomassTarget = teaOutput.ElectricalAndFuelBaseYear.BiomassTarget;
//   for (const treatment of treatments) {
//     for (const system of systems) {
//       console.log(`treatment: ${treatment}, system: ${system}`);
//     }
//   }

//   console.log('done testing...');
//   process.exit(0);
// };

// test();

// const testYears = async (
//   treatmentid: number,
//   system: string,
//   teaModel: string,
//   teaOutput: any,
//   biomassTarget: number,
//   params: RequestParamsTestYears
// ): Promise<YearlyResultTest> => {
//   return new Promise(async (resolve, reject) => {
//     // TODO: use separate TEA endpoint just to get biomass target

//     // console.log(`biomassTarget: ${biomassTarget}, processing...`);

//     try {
//       const radius = 0;
//       const paramsTest: RequestParamsTestYears = {
//         ...params,
//         treatmentid: treatmentid,
//         system: system,
//         teaModel: teaModel
//       };
//       const yearResult = await processClustersForYear(
//         db,
//         osrm,
//         radius,
//         paramsTest,
//         teaOutput,
//         biomassTarget,
//         params.years[0],
//         []
//       );
//       yearResult.lcaResults = undefined;

//       // console.log(`year: ${result.year}, # of clusters: ${yearResult.clusterNumbers.length}`);
//       // console.log(yearResult);
//       const result: YearlyResultTest = {
//         treatmentid: treatmentid,
//         system: system,
//         teaModel: teaModel,
//         year: 2016,
//         biomassTarget: yearResult.biomassTarget,
//         totalBiomass: yearResult.totalBiomass,
//         totalArea: yearResult.totalArea,
//         totalResidueCost: yearResult.totalResidueCost,
//         totalMoveInCost: yearResult.totalMoveInCost,
//         totalMoveInDistance: yearResult.totalMoveInDistance,
//         totalTransportationCost: yearResult.totalTransportationCost,
//         numberOfClusters: yearResult.numberOfClusters,
//         radius: yearResult.radius,
//         data: JSON.stringify(yearResult)
//       };
//       console.log(`system: ${system}, treatment: ${treatmentid} resolving...`);
//       resolve(result);
//     } catch (e) {
//       console.log('ERROR! ---------');
//       console.log(e);
//       reject(e);
//     }
//   });
// };
