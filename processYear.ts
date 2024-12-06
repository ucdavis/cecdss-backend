import { getMoveInOutputs } from '@ucdavis/frcs';
import { FrcsOutputs } from '@ucdavis/frcs/out/model';
import { lifeCycleAnalysis } from '@ucdavis/lca/function';
import { LcaInputs } from '@ucdavis/lca/model';
import { CashFlow, OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/output.model';
import {
  computeCarbonCredit,
  computeEnergyRevenueRequired,
  gasificationPower,
  genericCombinedHeatPower,
  genericPowerOnly,
} from '@ucdavis/tea/utility';
import fs from 'fs';
import { getBoundsOfDistance, getDistance } from 'geolib';
import { Knex } from 'knex';
import OSRM from '@project-osrm/osrm';
import { performance } from 'perf_hooks';
import { getEquipmentPrice } from './equipment';
import { trackMetric } from './logging';
import { ProcessedTreatedCluster } from './models/ProcessedTreatedCluster';
import {
  ClusterErrorResult,
  ClusterResult,
  LCAresults,
  LCATotals,
  RequestParams,
  TreatedClustersInfo,
  YearlyResult,
} from './models/types';
import { runFrcsOnCluster } from './runFrcs';
import {
  calculateMoveInDistance,
  FULL_TRUCK_PAYLOAD,
  getTransportationCostTotal,
  KM_TO_MILES,
  TRUCK_OWNERSHIP_COST,
} from './transportation';
import { isError } from 'util';

const unloadingTime = 0.25; // assume the self-unloading process takes 15 minutes (0.25 h)
const unloadingDieselUsageRate = 2; // assume fuel consumption rate is 2 gal/h
const unloadingDieselUsagePerTruck = unloadingDieselUsageRate * unloadingTime;

export const processClustersForYear = async (
  db: Knex,
  osrm: OSRM,
  radius: number,
  params: RequestParams,
  biomassTarget: number,
  year: number,
  usedIds: string[],
  errorIds: string[]
): Promise<YearlyResult> => {
  return new Promise(async (resolve, reject) => {
    if (!params.facilityLat || !params.facilityLng) {
      // if we don't have valid facility location, assume provided biomass location is also where facility is
      params.facilityLat = params.lat;
      params.facilityLng = params.lng;
    }

    try {
      const results: YearlyResult = {
        year,
        clusterNumbers: [],
        numberOfClusters: 0,
        totalArea: 0,
        candidateTotalFeedstock: 0,
        totalFeedstock: 0,
        totalDryFeedstock: 0,
        totalHarvestCost: 0,
        totalCoproduct: 0,
        totalDryCoproduct: 0,
        totalCoproductCost: 0,
        totalMoveInCost: 0,
        totalMoveInDistance: 0,
        totalTransportationCost: 0,
        harvestCostPerDryTon: 0,
        transportationCostPerDryTon: 0,
        moveInCostPerDryTon: 0,
        feedstockCostPerTon: 0,
        tripGeometries: [],
        radius,
        clusters: [],
        errorClusters: [],
        errorClusterNumbers: [],
        fuelCost: 0,
        geoJson: [],
        errorGeoJson: [],
        cashFlow: {},
        lcaResults: {
          lifeCycleEmissions: {
            CO2: 0,
            CH4: 0,
            N2O: 0,
            CO: 0,
            NOx: 0,
            PM10: 0,
            PM25: 0,
            SOx: 0,
            VOC: 0,
            CI: 0,
          },
          lifeCycleImpacts: {
            global_warming_air: 0,
            acidification_air: 0,
            hh_particulate_air: 0,
            eutrophication_air: 0,
            smog_air: 0,
          },
          lifeStageCO2: {
            harvest: 0,
            transport: 0,
            conversion: 0,
            construction: 0,
            equipment: 0,
          },
          lifeStageGWP: {
            harvest: 0,
            transport: 0,
            conversion: 0,
            construction: 0,
            equipment: 0,
          },
          inputs: {
            technology: '',
            harvestDiesel: 0,
            unloadDiesel: 0,
            gasoline: 0,
            jetfuel: 0,
            distance: 0,
            construction: 0,
            equipment: 0,
          },
        },
      };

      const lcaTotals: LCATotals = {
        totalHarvestDiesel: 0,
        totalUnloadDiesel: 0,
        totalGasoline: 0,
        totalJetFuel: 0,
        totalTransportationDistance: 0,
      };

      // biomassTarget in metric tons comes from TEA whereas FRCS returns weight in short tons.
      // we want the units to be consistent in order to compare them later so convert biomassTarget to short tons
      const TONNE_TO_TON = 1.10231; // 1 metric ton = 1.10231 short tons
      biomassTarget = biomassTarget * TONNE_TO_TON;
      const extraBiomassTarget = biomassTarget * params.expansionFactor;

      const moistureContentPercentage = params.moistureContent / 100.0;
      const harvestableClusters: ProcessedTreatedCluster[] = [];

      /*** feedstock searching algorithm ***/
      // get the candidate clusters whose total feedstock amount is just greater than extraBiomassTarget
      // feedstock and biomassTarget are both in short tons
      // for each cluster, run frcs and transportation model
      const candidateIds: string[] = [];
      while (results.candidateTotalFeedstock < extraBiomassTarget) {
        if (
          // TODO: might need a better terminating condition
          results.radius > 40000 &&
          results.clusters.length > 3800 &&
          results.candidateTotalFeedstock / biomassTarget < 0.1
        ) {
          console.log('radius large & not enough biomass');
          break;
        }

        results.radius += 1000;
        console.log(
          `year:${year} getting clusters from db, radius: ${
            results.radius
          }, candidateTotalFeedstock: ${
            results.candidateTotalFeedstock
          }, extraBiomassTarget: ${extraBiomassTarget}, ${
            results.candidateTotalFeedstock < extraBiomassTarget
          } ...`
        );

        // get the clusters within the radius from the database, excluding used and error cluters
        const clusters: ProcessedTreatedCluster[] = await getClusters(
          db,
          params,
          year,
          usedIds,
          errorIds,
          results.radius,
          candidateIds
        );
        console.log(`year:${year} clusters found: ${clusters.length}`);

        // process clusters to compute feedstock amount, harvest cost, transport cost, etc.for each cluster
        // add harvestable clusters to harvestableClusters
        // add Id of non-harvestable clusters to errorIds
        console.log(`year:${year} processing clusters...`);
        await processClusters(
          osrm,
          params,
          clusters,
          results,
          errorIds,
          harvestableClusters,
          candidateIds
        );
      } // end of the while loop

      console.log(`year:${year} sorting candidate clusters by unit feedstock cost...`);
      const sortedClusters = harvestableClusters.sort(
        (a, b) =>
          (a.feedstockHarvestCost + a.transportationCost) / a.feedstock -
          (b.feedstockHarvestCost + b.transportationCost) / b.feedstock
      );

      // select from the sorted harvestable clusters the ones that can supply one-year feedstock (biomassTarget)
      console.log(`year:${year} selecting clusters...`);
      await selectClusters(biomassTarget, sortedClusters, results, lcaTotals, usedIds);

      // if (year === params.firstYear) {
      //   // determine csv file name and only run if file does not already exist
      //   let fileName = `${year}_test`;

      //   // replace non-alphanumeric characters with underscores
      //   fileName = fileName.replace(/[^a-z0-9]/gi, '_');

      //   const fileWithDirectory = (process.env.CSV_DIR || './results/') + fileName + '.csv';

      //   let fileContents = 'cluster_no,feedstockCost,feedstockAmount\n';
      //   sortedClusters.slice(0, 100).forEach((c) => {
      //     fileContents += `${c.cluster_no}, ${
      //       (c.feedstockHarvestCost + c.transportationCost) / c.feedstock
      //     },${c.feedstock}\n`;
      //   });

      //   fs.writeFileSync(fileWithDirectory, fileContents);
      // }

      results.numberOfClusters = results.clusterNumbers.length;
      console.log(
        `annualGeneration: ${params.annualGeneration}, radius: ${results.radius}, # of clusters: ${results.numberOfClusters}`
      );

      /*** move-in cost calculation ***/
      let moveInDistance = 0;
      if (results.totalFeedstock > 0) {
        console.log('move in distance required, calculating');
        moveInDistance = await calculateMoveInDistance(
          osrm,
          results,
          params.facilityLat,
          params.facilityLng
        ); // in meters
      } else {
        console.log(
          `skipping updating move in distance, totalBiomass: ${results.totalFeedstock}, # of clusters: ${results.clusters.length}`
        );
      }

      const moveInOutputs = getMoveInOutputs({
        system: params.system,
        moveInDistance: (moveInDistance / 1000) * KM_TO_MILES,
        dieselFuelPrice: params.dieselFuelPrice,
        isBiomassSalvage: false, // true if treatment is biomass Salvage but we have no option for biomass salvage with C-BREC data
        wageFaller: params.wageFaller,
        wageOther: params.wageOther,
        laborBenefits: params.laborBenefits,
        ppiCurrent: params.ppiCurrent,
        harvestChipTrees: true,
        includeCostsCollectChipResidues: true,
      });

      console.log(`move in cost: ${moveInOutputs.residualCost}`);

      results.totalMoveInDistance = moveInDistance;
      results.totalMoveInCost = moveInOutputs.residualCost;
      lcaTotals.totalHarvestDiesel += moveInOutputs.residualDiesel;

      // unloading ($ / dry metric ton)
      const unloadingCostPerDryTon =
        (((1 + params.laborBenefits / 100) * params.wageTruckDriver + TRUCK_OWNERSHIP_COST) *
          unloadingTime) /
        ((FULL_TRUCK_PAYLOAD * (1 - moistureContentPercentage)) / TONNE_TO_TON);

      const CPI2002 = 179.9;
      const CPI2021 = 270.97;

      /*** run LCA ***/
      const lcaInputs: LcaInputs = {
        technology: params.teaModel,
        harvestDiesel: lcaTotals.totalHarvestDiesel / params.annualGeneration, // gal/kWh
        unloadDiesel: lcaTotals.totalUnloadDiesel / params.annualGeneration, // gal/kWh
        gasoline: lcaTotals.totalGasoline / params.annualGeneration, // gal/kWh
        jetfuel: lcaTotals.totalJetFuel / params.annualGeneration, // gal/kWh
        distance: (lcaTotals.totalTransportationDistance * KM_TO_MILES) / params.annualGeneration, // miles/kWh
        construction:
          params.year === params.firstYear
            ? ((params.capitalCost / CPI2021) * CPI2002) / 1000 / params.annualGeneration
            : 0, // thousand$/kWh, assume the first year is 2016 for now
        equipment:
          getEquipmentPrice(params.treatmentid, params.system, params.year - params.firstYear) /
          1000 /
          params.annualGeneration, // thousand$/kWh
      };

      console.log('running LCA...');
      console.log('lcaInputs = ', lcaInputs);
      const lca = await runLca(lcaInputs);
      console.log('lifeCycleEmissions = ', lca.lifeCycleEmissions);
      results.lcaResults = lca;

      // calculate dry values ($ / dry metric ton)
      results.totalDryFeedstock =
        (results.totalFeedstock * (1 - moistureContentPercentage)) / TONNE_TO_TON;
      results.totalDryCoproduct =
        (results.totalCoproduct * (1 - moistureContentPercentage)) / TONNE_TO_TON;

      results.harvestCostPerDryTon = results.totalHarvestCost / results.totalDryFeedstock;
      results.transportationCostPerDryTon =
        results.totalTransportationCost / results.totalDryFeedstock + unloadingCostPerDryTon;
      results.moveInCostPerDryTon = results.totalMoveInCost / results.totalDryFeedstock;
      results.feedstockCostPerTon =
        results.harvestCostPerDryTon +
        results.transportationCostPerDryTon +
        results.moveInCostPerDryTon;
      console.log(`totalDryFeedstock (BDMT): ${results.totalDryFeedstock}`);
      console.log(`movein cost ($/BDMT): ${results.moveInCostPerDryTon}`);

      /*** run TEA ***/
      const cashFlow: CashFlow = params.cashFlow;
      // update annual feedstock (biomass fuel) cost
      cashFlow.BiomassFuelCost = results.feedstockCostPerTon * results.totalDryFeedstock;
      const carbonIntensity = (lca.lifeCycleEmissions.CI * 1000) / 3.6; // convert from kg/kWh to g/MJ
      cashFlow.LcfsCreditRevenue = computeCarbonCredit(
        params.year,
        params.firstYear,
        params.carbonCreditPrice,
        carbonIntensity,
        params.energyEconomyRatio,
        params.generalInflation,
        params.annualGeneration
      ); // update LCFS credit revenue
      const energyRevenueRequired = computeEnergyRevenueRequired(
        params.teaModel,
        params.cashFlow,
        params.includeCarbonCredit
      );
      cashFlow.EnergyRevenueRequired = energyRevenueRequired;
      results.cashFlow = cashFlow;

      const geoJson = await getGeoJson(db, results.clusterNumbers, results.clusters);
      results.geoJson = geoJson;
      const errorGeoJson = await getErrorGeoJson(
        db,
        results.errorClusterNumbers,
        results.errorClusters
      );
      results.errorGeoJson = errorGeoJson;

      resolve(results);
    } catch (e: any) {
      console.log('ERROR!');
      console.log(e);
      reject(e.message);
    }
  });
};

const getClusters = async (
  db: Knex,
  params: RequestParams,
  year: number,
  usedIds: string[],
  errorIds: string[],
  radius: number,
  candidateIds: string[]
): Promise<ProcessedTreatedCluster[]> => {
  return new Promise(async (res, rej) => {
    const bounds = getBoundsOfDistance({ latitude: params.lat, longitude: params.lng }, radius);
    const clusters: ProcessedTreatedCluster[] = await db
      .table('treatedclusters')
      .where({ treatmentid: params.treatmentid })
      .where({ year: 2025 }) // TODO: filter by actual year if we get data for multiple years
      .whereIn('land_use', ['private', 'United States Forest Service'])
      .whereNotIn('cluster_no', [...usedIds, ...errorIds, ...candidateIds])
      .whereBetween('center_lat', [bounds[0].latitude, bounds[1].latitude])
      .andWhereBetween('center_lng', [bounds[0].longitude, bounds[1].longitude]);

    // only include those clusters that are inside a circular radius
    const clustersInCircle = clusters.filter(
      (c) =>
        getDistance(
          { latitude: params.lat, longitude: params.lng },
          { latitude: c.center_lat, longitude: c.center_lng }
        ) <= radius
    );

    res(clustersInCircle);
  });
};

const processClusters = async (
  osrm: OSRM,
  params: RequestParams,
  clusters: ProcessedTreatedCluster[],
  results: YearlyResult,
  errorIds: string[],
  harvestableClusters: ProcessedTreatedCluster[],
  candidateIds: string[]
) => {
  return new Promise<void>(async (res, rej) => {
    const t0 = performance.now();

    const processPromises = [];
    for (const cluster of clusters) {
      processPromises.push(
        processCluster(cluster, params, osrm, results, harvestableClusters, errorIds, candidateIds)
      );
    }

    // process all clusters in parallel
    await Promise.all(processPromises);

    // keep track of how long it takes to process all clusters
    const t1 = performance.now();
    trackMetric(
      `processClusters for ${clusters.length}. ${results.clusters.length} processed, ${results.errorClusters.length} errors`,
      t1 - t0
    );

    res();
  });
};

const processCluster = async (
  cluster: ProcessedTreatedCluster,
  params: RequestParams,
  osrm: OSRM,
  results: YearlyResult,
  harvestableClusters: ProcessedTreatedCluster[],
  errorIds: string[],
  candidateIds: string[]
) => {
  try {
    const frcsResult: FrcsOutputs = await runFrcsOnCluster(
      cluster,
      params.system,
      params.dieselFuelPrice,
      params.moistureContent,
      params.wageFaller,
      params.wageOther,
      params.laborBenefits,
      params.ppiCurrent,
      params.residueRecovFracWT,
      params.residueRecovFracCTL
    );


    const clusterFeedstock = frcsResult.residual.yieldPerAcre * cluster.area; // green tons
    const clusterCoproduct =
      (frcsResult.total.yieldPerAcre - frcsResult.residual.yieldPerAcre) * cluster.area; // green tons
    if (clusterFeedstock === 0) {
      throw new Error(`Cluster feedstock was: ${clusterFeedstock}`);
    }
    const routeOptions: OSRM.RouteOptions = {
      coordinates: [
        [params.facilityLng, params.facilityLat],
        [cluster.landing_lng, cluster.landing_lat],
      ],
      annotations: ['duration', 'distance'],
    };
     // currently distance is the osrm generated distance between each landing site and the facility location
    const route: any = await getRouteDistanceAndDuration(osrm, routeOptions);
    
    // number of trips is how many truckloads it takes to transport biomass
    const numberOfTripsForTransportation = Math.ceil(clusterFeedstock / FULL_TRUCK_PAYLOAD);
    // multiply the osrm road distance by number of trips, transportation eq doubles it for round trip
    const distance = route.distance / 1000; // m to km
    const duration = route.duration / 3600; // seconds to hours
    const transportationCostTotal = getTransportationCostTotal(
      clusterFeedstock,
      distance,
      duration,
      params.dieselFuelPrice,
      params.wageTruckDriver,
      params.driverBenefits,
      params.oilCost
    );

    cluster.feedstock = clusterFeedstock;
    results.candidateTotalFeedstock += clusterFeedstock;
    cluster.feedstockHarvestCost = frcsResult.residual.costPerAcre * cluster.area;
    cluster.coproduct = clusterCoproduct;
    cluster.coproductHarvestCost =
      (frcsResult.total.costPerAcre - frcsResult.residual.costPerAcre) * cluster.area;
    cluster.frcsResult = frcsResult;
    cluster.transportationCost = transportationCostTotal;
    cluster.harvestDiesel = frcsResult.residual.dieselPerAcre * cluster.area;
    cluster.unloadDiesel = unloadingDieselUsagePerTruck * numberOfTripsForTransportation;
    cluster.gasoline = frcsResult.residual.gasolinePerAcre * cluster.area;
    cluster.juetFuel = frcsResult.residual.jetFuelPerAcre * cluster.area;
    cluster.distance = distance;
    cluster.transportationDistance = distance * 2 * numberOfTripsForTransportation;
    harvestableClusters.push(cluster);
    candidateIds.push(cluster.cluster_no);
  } catch (err: any) {
    // swallow errors frcs throws and push the error message instead
    results.errorClusters.push({
      cluster_no: cluster.cluster_no,
      area: cluster.area,
      biomass: 0,
      error: err.message,
      slope: cluster.slope,
    });
    results.errorClusterNumbers.push(cluster.cluster_no);
    errorIds.push(cluster.cluster_no);
  }
};

const selectClusters = async (
  biomassTarget: number,
  sortedClusters: ProcessedTreatedCluster[],
  results: YearlyResult,
  lcaTotals: LCATotals,
  usedIds: string[]
) => {
  return new Promise<void>(async (res, rej) => {
    for (const cluster of sortedClusters) {
      if (results.totalFeedstock >= biomassTarget) {
        // results.skippedClusters.push(cluster); // keeping for testing for now
        break;
      } else {
        results.totalFeedstock += cluster.feedstock;
        results.totalHarvestCost += cluster.feedstockHarvestCost;
        results.totalCoproduct += cluster.coproduct;
        results.totalCoproductCost += cluster.coproductHarvestCost;
        results.totalArea += cluster.area;
        results.totalTransportationCost += cluster.transportationCost;
        lcaTotals.totalTransportationDistance += cluster.transportationDistance;
        lcaTotals.totalHarvestDiesel += cluster.harvestDiesel;
        lcaTotals.totalUnloadDiesel += cluster.unloadDiesel;
        lcaTotals.totalGasoline += cluster.gasoline;
        lcaTotals.totalJetFuel += cluster.juetFuel;

        results.clusters.push({
          cluster_no: cluster.cluster_no,
          area: cluster.area, // acre
          biomass: cluster.feedstock, // green tons
          distance: cluster.distance, // km
          combinedCost: cluster.feedstockHarvestCost + cluster.coproductHarvestCost, // total harvest cost ($)
          residueCost: cluster.feedstockHarvestCost, // feedstock harvest cost ($)
          transportationCost: cluster.transportationCost,
          frcsResult: cluster.frcsResult,
          center_lat: cluster.center_lat,
          center_lng: cluster.center_lng,
          landing_lat: cluster.landing_lat,
          landing_lng: cluster.landing_lng,
          landing_distance: getDistance(
            { latitude: cluster.landing_lat, longitude: cluster.landing_lng },
            { latitude: cluster.center_lat, longitude: cluster.center_lng }
          ),
          county: cluster.county_name,
          land_use: cluster.land_use,
          haz_class: cluster.haz_class,
          forest_type: cluster.forest_type,
          site_class: cluster.site_class,
        });
        results.clusterNumbers.push(cluster.cluster_no);
        usedIds.push(cluster.cluster_no);
      }
    }
    res();
  });
};

export const runLca = async (inputs: LcaInputs) => {
  const lcaOutputs = await lifeCycleAnalysis(inputs);
  const results: LCAresults = {
    lifeCycleEmissions: lcaOutputs.lifeCycleEmissions,
    lifeCycleImpacts: lcaOutputs.lifeCycleImpacts,
    lifeStageCO2: lcaOutputs.lifeStageCO2,
    lifeStageGWP: lcaOutputs.lifeStageGWP,
    inputs: inputs,
  };
  // convert US units to SI units: gallon to liter, mile to km
  const GALLON_TO_LITER = 3.78541;
  results.inputs.harvestDiesel *= GALLON_TO_LITER; // L/kWh
  results.inputs.unloadDiesel *= GALLON_TO_LITER; // L/kWh
  results.inputs.gasoline *= GALLON_TO_LITER; // L/kWh
  results.inputs.jetfuel *= GALLON_TO_LITER; // L/kWh
  results.inputs.distance /= KM_TO_MILES; // km/kWh

  return results;
};

const getRouteDistanceAndDuration = (osrm: OSRM, routeOptions: OSRM.RouteOptions) => {
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

export const getTeaOutputs = async (type: string, inputs: any) => {
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

const getGeoJson = async (
  db: Knex,
  clusterNumbers: string[],
  clusters: ClusterResult[]
): Promise<any> => {
  return new Promise(async (res, rej) => {
    const clusterGeoJson: TreatedClustersInfo[] = await db
      .table('treatedclustersInfo')
      .whereIn('cluster_no', [...clusterNumbers])
      .orderBy('cluster_no', 'asc');
    const clustersCopy = [...clusters];
    clustersCopy.sort((a, b) => {
      return Number(a.cluster_no) - Number(b.cluster_no);
    });
    const features = clusterGeoJson.map((treatedClusterInfo, index) => {
      const i =
        treatedClusterInfo.cluster_no === clustersCopy[index].cluster_no
          ? index
          : clustersCopy.findIndex((a) => a.cluster_no === treatedClusterInfo.cluster_no);
      return {
        ...treatedClusterInfo.geography,
        properties: {
          ...clustersCopy[i],
        },
      };
    });
    res(features);
  });
};

const getErrorGeoJson = async (
  db: Knex,
  clusterNumbers: string[],
  clusters: ClusterErrorResult[]
): Promise<any> => {
  return new Promise(async (res, rej) => {
    const clusterGeoJson: TreatedClustersInfo[] = await db
      .table('treatedclustersInfo')
      .whereIn('cluster_no', [...clusterNumbers])
      .orderBy('cluster_no', 'asc');
    const clustersCopy = [...clusters];
    clustersCopy.sort((a, b) => {
      return Number(a.cluster_no) - Number(b.cluster_no);
    });
    const features = clusterGeoJson.map((treatedClusterInfo, index) => {
      const i =
        treatedClusterInfo.cluster_no === clustersCopy[index].cluster_no
          ? index
          : clustersCopy.findIndex((a) => a.cluster_no === treatedClusterInfo.cluster_no);
      return {
        ...treatedClusterInfo.geography,
        properties: {
          ...clustersCopy[i],
        },
      };
    });
    res(features);
  });
  // tslint:disable-next-line: max-file-line-count
};
