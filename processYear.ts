import { getMoveInCosts } from '@ucdavis/frcs';
import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { lifeCycleAnalysis } from '@ucdavis/lca/function';
import { LcaInputs } from '@ucdavis/lca/model';
import { CashFlow, OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/output.model';
import {
  computeCarbonCredit,
  computeEnergyRevenueRequired,
  computeEnergyRevenueRequiredPW,
  gasificationPower,
  genericCombinedHeatPower,
  genericPowerOnly,
} from '@ucdavis/tea/utility';
import { getBoundsOfDistance, getDistance } from 'geolib';
import { Knex } from 'knex';
import OSRM from 'osrm';
import { performance } from 'perf_hooks';
import { trackMetric } from './logging';
import { LCAresults } from './models/lcaModels';
import { ProcessedTreatedCluster } from './models/ProcessedTreatedCluster';
import {
  ClusterErrorResult,
  ClusterResult,
  LCATotals,
  RequestParams,
  TreatedClustersInfo,
  YearlyResult,
} from './models/types';
import { runFrcsOnCluster } from './runFrcs';
import {
  FULL_TRUCK_PAYLOAD,
  getMoveInTrip,
  getTransportationCostTotal,
  KM_TO_MILES,
} from './transportation';

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
        energyRevenueRequired: 0,
        energyRevenueRequiredPW: 0,
        geoJson: [],
        errorGeoJson: [],
        cashFlow: {},
      };

      const lcaTotals: LCATotals = {
        totalDiesel: 0,
        totalGasoline: 0,
        totalJetFuel: 0,
        totalTransportationDistance: 0,
      };

      // biomassTarget in metric tons comes from TEA whereas FRCS returns weight in short tons.
      // we want the units to be consistent in order to compare them later so convert biomassTarget to short tons
      const TONNE_TO_TON = 1.10231; // 1 metric ton = 1.10231 short tons
      biomassTarget = biomassTarget * TONNE_TO_TON;
      const expansionFactor = 5;
      const extraBiomassTarget = biomassTarget * expansionFactor;

      const moistureContentPercentage = params.moistureContent / 100.0;
      const harvestableClusters: ProcessedTreatedCluster[] = [];

      /*** feedstock searching algorithm ***/
      // get the candidate clusters whose total feedstock amount is just greater than extraBiomassTarget
      // feedstock and biomassTarget are both in short tons
      // for each cluster, run frcs and transportation model
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
          results.radius
        );
        console.log(`year:${year} clusters found: ${clusters.length}`);

        // process clusters to compute feedstock amount, harvest cost, transport cost, etc.for each cluster
        // add harvestable clusters to harvestableClusters
        // add Id of non-harvestable clusters to errorIds
        console.log(`year:${year} processing clusters...`);
        await processClusters(osrm, params, clusters, results, errorIds, harvestableClusters);
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

      results.numberOfClusters = results.clusterNumbers.length;
      console.log(
        `annualGeneration: ${params.annualGeneration}, radius: ${results.radius}, # of clusters: ${results.numberOfClusters}`
      );

      console.log(`calculating move in distance on ${results.clusters.length} clusters...`);
      const t0 = performance.now();
      const moveInTripResults = await getMoveInTrip(
        osrm,
        params.facilityLat,
        params.facilityLng,
        results.clusters
      );
      const t1 = performance.now();
      console.log(
        `Running took ${t1 - t0} milliseconds, move in distance: ${moveInTripResults.distance}.`
      );

      trackMetric(`moveInDistance for ${results.clusters.length} clusters`, t1 - t0);

      results.tripGeometries = moveInTripResults.trips.map((t) => t.geometry);

      /*** move-in cost calculation ***/
      // we only update the move in distance if it is applicable for this type of treatment & system
      let moveInDistance = 0;
      if (results.totalFeedstock > 0 && params.system === 'Ground-Based CTL') {
        console.log('updating move in distance of');
        moveInDistance = moveInTripResults.distance;
      } else {
        console.log(
          `skipping updating move in distance, totalBiomass: ${results.totalFeedstock}, # of clusters: ${results.clusters.length}`
        );
      }

      const moveInCosts = getMoveInCosts({
        System: params.system,
        MoveInDist: moveInDistance,
        DieselFuelPrice: params.dieselFuelPrice,
        ChipAll: params.treatmentid === 10 ? true : false, // true if treatment is biomass salvage
      });

      console.log(`move in cost: ${moveInCosts.Residue}`);

      results.totalMoveInDistance = moveInDistance;
      results.totalMoveInCost = moveInCosts.Residue;

      /*** run LCA ***/
      const lcaInputs: LcaInputs = {
        technology: params.teaModel,
        diesel: lcaTotals.totalDiesel / params.annualGeneration, // gal/kWh
        gasoline: lcaTotals.totalGasoline / params.annualGeneration, // gal/kWh
        jetfuel: lcaTotals.totalJetFuel / params.annualGeneration, // gal/kWh
        distance: (lcaTotals.totalTransportationDistance * KM_TO_MILES) / params.annualGeneration, // miles/kWh
      };

      console.log();
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
        results.totalTransportationCost / results.totalDryFeedstock;
      results.moveInCostPerDryTon = results.totalMoveInCost / results.totalDryFeedstock;
      results.feedstockCostPerTon =
        results.harvestCostPerDryTon +
        results.transportationCostPerDryTon +
        results.moveInCostPerDryTon;

      /*** run TEA ***/
      const cashFlow: CashFlow = params.cashFlow;
      cashFlow.BiomassFuelCost = // update annual feedstock (biomass fuel) cost
        results.totalHarvestCost + results.totalTransportationCost + results.totalMoveInCost;
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
      results.energyRevenueRequired = energyRevenueRequired;
      cashFlow.EnergyRevenueRequired = energyRevenueRequired;
      const energyRevenueRequiredPresent = computeEnergyRevenueRequiredPW(
        params.year - params.firstYear + 1, // currently, the first year is 2016
        params.costOfEquity,
        energyRevenueRequired
      );
      console.log(`energyRevenueRequiredPW: ${energyRevenueRequiredPresent}`);
      results.energyRevenueRequiredPW = energyRevenueRequiredPresent;

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
  radius: number
): Promise<ProcessedTreatedCluster[]> => {
  return new Promise(async (res, rej) => {
    const bounds = getBoundsOfDistance({ latitude: params.lat, longitude: params.lng }, radius);
    const clusters: ProcessedTreatedCluster[] = await db
      .table('treatedclusters')
      .where({ treatmentid: params.treatmentid })
      .where({ year: 2016 }) // TODO: filter by actual year if we get data for multiple years
      .whereIn('land_use', ['private', 'USDA Forest Service'])
      .whereNotIn('cluster_no', [...usedIds, ...errorIds])
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
  harvestableClusters: ProcessedTreatedCluster[]
) => {
  return new Promise<void>(async (res, rej) => {
    const t0 = performance.now();

    const processPromises = [];
    for (const cluster of clusters) {
      processPromises.push(
        processCluster(cluster, params, osrm, results, harvestableClusters, errorIds)
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
  errorIds: string[]
) => {
  try {
    const frcsResult: OutputVarMod = await runFrcsOnCluster(
      cluster,
      params.system,
      params.dieselFuelPrice,
      params.moistureContent
    );

    const clusterFeedstock = frcsResult.Residue.WeightPerAcre * cluster.area; // green tons
    const clusterCoproduct =
      (frcsResult.Total.WeightPerAcre - frcsResult.Residue.WeightPerAcre) * cluster.area; // green tons
    if (clusterFeedstock < 1) {
      throw new Error(`Cluster biomass was: ${clusterFeedstock}, which is too low to use`);
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
      params.dieselFuelPrice
    );

    cluster.feedstock = clusterFeedstock;
    results.candidateTotalFeedstock += clusterFeedstock;
    cluster.feedstockHarvestCost = frcsResult.Residue.CostPerAcre * cluster.area;
    cluster.coproduct = clusterCoproduct;
    cluster.coproductHarvestCost =
      (frcsResult.Total.CostPerAcre - frcsResult.Residue.CostPerAcre) * cluster.area;
    cluster.frcsResult = frcsResult;
    cluster.transportationCost = transportationCostTotal;
    cluster.diesel = frcsResult.Residue.DieselPerAcre * cluster.area;
    cluster.gasoline = frcsResult.Residue.GasolinePerAcre * cluster.area;
    cluster.juetFuel = frcsResult.Residue.JetFuelPerAcre * cluster.area;
    cluster.distance = distance;
    cluster.transportationDistance = distance * 2 * numberOfTripsForTransportation;
    harvestableClusters.push(cluster);
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
        lcaTotals.totalDiesel += cluster.diesel;
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
  const results: LCAresults = await lifeCycleAnalysis(inputs);
  results.inputs = inputs;
  // convert US units to SI units: gallon to liter, mile to km
  const GALLON_TO_LITER = 3.78541;
  results.inputs.diesel *= GALLON_TO_LITER; // L/kWh
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
          ...clusters[i],
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
          ...clusters[i],
        },
      };
    });
    res(features);
  });
  // tslint:disable-next-line: max-file-line-count
};
