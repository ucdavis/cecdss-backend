import { getMoveInOutputs } from '@ucdavis/frcs';
import { FrcsOutputs } from '@ucdavis/frcs/out/model';
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
import geocluster from 'geocluster';
import { getDistance } from 'geolib';
import { Knex } from 'knex';
import OSRM from 'osrm';
import { performance } from 'perf_hooks';
import { LCAresults } from './models/lcaModels';
import { TreatedCluster } from './models/treatedcluster';
import { ClusterResult, LCATotals, RequestByDistanceParams, YearlyResult } from './models/types';
import { runFrcsOnCluster } from './runFrcs';
import {
  FULL_TRUCK_PAYLOAD,
  getMoveInTrip,
  getTransportationCostTotal,
  KM_TO_MILES,
} from './transportation';

export const processClustersByDistance = async (
  db: Knex,
  osrm: OSRM,
  minRadiusInMeters: number,
  maxRadiusInMeters: number,
  params: RequestByDistanceParams,
  year: number
): Promise<YearlyResult> => {
  return new Promise(async (resolve, reject) => {
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
        radius: 0,
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

      // get all clusters in a band between min/max radius
      console.log(
        `year:${year} getting clusters from db, radius between ${minRadiusInMeters} and ${maxRadiusInMeters}`
      );

      const clusters: TreatedCluster[] = await getClusters(
        db,
        params,
        year,
        minRadiusInMeters,
        maxRadiusInMeters
      );

      console.log(`year:${year} clusters found: ${clusters.length}`);

      console.log(`year:${year} selecting clusters...`);
      await selectClusters(osrm, params, clusters, results, lcaTotals, [], []);

      let moveInDistance = 0;

      if (doesNeedMoveIn(results, params)) {
        console.log('move in distance required, calculating');
        moveInDistance = await calculateMoveInDistance(osrm, clusters, results, params);
      } else {
        console.log(
          `skipping updating move in distance, totalBiomass: ${results.totalFeedstock}, # of clusters: ${results.clusters.length}`
        );
      }

      const moveInOutputs = getMoveInOutputs({
        system: params.system,
        moveInDistance: moveInDistance,
        dieselFuelPrice: params.dieselFuelPrice,
        isBiomassSalvage: params.treatmentid === 10 ? true : false, // true if treatment is biomass salvage
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
      lcaTotals.totalDiesel += moveInOutputs.residualDiesel;

      results.numberOfClusters = results.clusterNumbers.length;

      const lcaInputs: LcaInputs = {
        technology: params.teaModel,
        diesel: lcaTotals.totalDiesel / params.annualGeneration, // gal/MWh
        gasoline: lcaTotals.totalGasoline / params.annualGeneration, // gal/MWh
        jetfuel: lcaTotals.totalJetFuel / params.annualGeneration, // gal/MWh
        distance: (lcaTotals.totalTransportationDistance * KM_TO_MILES) / params.annualGeneration, // km/MWh
      };

      const lca = await runLca(lcaInputs);
      results.lcaResults = lca;

      const moistureContentPercentage = params.moistureContent / 100.0;

      const TONNE_TO_TON = 1.10231; // 1 metric ton = 1.10231 short tons
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

      const cashFlow: CashFlow = params.cashFlow;
      // TODO: check that this is the proper way to calc biomass fuel cost
      cashFlow.BiomassFuelCost =
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

      resolve(results);
    } catch (e: any) {
      console.log('ERROR!');
      console.log(e);
      reject(e.message);
    }
  });
};

const doesNeedMoveIn = (results: YearlyResult, params: RequestByDistanceParams): boolean => {
  return results.totalFeedstock > 0 && params.system === 'Ground-Based CTL';
};

const calculateMoveInDistance = async (
  osrm: OSRM,
  clusters: TreatedCluster[],
  results: YearlyResult,
  params: RequestByDistanceParams
) => {
  let totalMoveInDistance = 0;

  const maxClustersPerChunk = 2000;

  if (results.clusters.length > maxClustersPerChunk) {
    // want enough chunks so that we don't exceed max clusters per chunk
    const numChunks = Math.ceil(results.clusters.length / maxClustersPerChunk);

    console.log(
      `${results.clusters.length} is too many clusters, breaking into ${numChunks} chunks`
    );

    // assuming facility coordinates are biomass coordinates
    const sortedClusters = results.clusters.sort(
      (a, b) =>
        getDistance(
          { latitude: params.facilityLat, longitude: params.facilityLng },
          { latitude: a.center_lat, longitude: a.center_lng }
        ) -
        getDistance(
          { latitude: params.facilityLat, longitude: params.facilityLng },
          { latitude: b.center_lat, longitude: b.center_lng }
        )
    );

    // break up into numChunks chunks by taking clusters in order
    const groupedClusters = sortedClusters.reduce((resultArray, item, index) => {
      const chunkIndex = Math.floor(index / maxClustersPerChunk);

      if (!resultArray[chunkIndex]) {
        resultArray[chunkIndex] = []; // start a new chunk
      }

      resultArray[chunkIndex].push(item);

      return resultArray;
      // tslint:disable-next-line:align
    }, [] as ClusterResult[][]);

    // for each chunk, calculate the move in distance and add them up
    for (let i = 0; i < groupedClusters.length; i++) {
      const clustersInGroup = groupedClusters[i];

      console.log(
        `calculating move in distance on ${clustersInGroup.length} clusters in chunk ${i + 1}...`
      );

      const t0_chunk = performance.now();
      const chunkedMoveInTripResults = await getMoveInTrip(
        osrm,
        params.facilityLat,
        params.facilityLng,
        clustersInGroup
      );
      const t1_chunk = performance.now();
      console.log(
        `Running took ${t1_chunk - t0_chunk} milliseconds, move in distance: ${
          chunkedMoveInTripResults.distance
        }.`
      );

      totalMoveInDistance += chunkedMoveInTripResults.distance;
    }
  } else {
    // not that many clusters, so don't bother chunking
    console.log(`calculating move in distance on ${clusters.length} clusters...`);
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

    totalMoveInDistance = moveInTripResults.distance;
  }

  return totalMoveInDistance;
};

const getClusters = async (
  db: Knex,
  params: RequestByDistanceParams,
  year: number,
  minRadiusInMeters: number,
  maxRadiusInMeters: number
): Promise<TreatedCluster[]> => {
  return new Promise(async (res, rej) => {
    const clusters: TreatedCluster[] = await db
      .table('treatedclusters')
      .where({ treatmentid: params.treatmentid })
      .where({ year: 2016 }) // TODO: filter by actual year if we get data for multiple years
      .whereIn('land_use', ['private', 'USDA Forest Service'])
      .andWhereRaw(
        `ST_DistanceSphere(ST_MakePoint(${params.facilityLng},${params.facilityLat}), ST_MakePoint(center_lng,center_lat)) > ${minRadiusInMeters}`
      )
      .andWhereRaw(
        `ST_DistanceSphere(ST_MakePoint(${params.facilityLng},${params.facilityLat}), ST_MakePoint(center_lng,center_lat)) <= ${maxRadiusInMeters}`
      );
    res(clusters);
  });
};

const selectClusters = async (
  osrm: OSRM,
  params: RequestByDistanceParams,
  sortedClusters: TreatedCluster[],
  results: YearlyResult,
  lcaTotals: LCATotals,
  usedIds: string[],
  errorIds: string[]
) => {
  return new Promise<void>(async (res, rej) => {
    for (const cluster of sortedClusters) {
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

        // use frcs calculated available feedstock
        const clusterFeedstock = frcsResult.residual.yieldPerAcre * cluster.area; // green tons
        const clusterCoproduct =
          (frcsResult.total.yieldPerAcre - frcsResult.residual.yieldPerAcre) * cluster.area; // green tons
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
          params.dieselFuelPrice,
          params.wageTruckDriver,
          params.driverBenefits,
          params.oilCost
        );

        results.totalFeedstock += clusterFeedstock;
        results.totalHarvestCost += frcsResult.residual.costPerAcre * cluster.area;
        results.totalCoproduct += clusterCoproduct;
        results.totalCoproductCost +=
          (frcsResult.total.costPerAcre - frcsResult.residual.costPerAcre) * cluster.area;

        results.totalArea += cluster.area;
        results.totalTransportationCost += transportationCostTotal;
        lcaTotals.totalDiesel += frcsResult.residual.dieselPerAcre * cluster.area;
        lcaTotals.totalGasoline += frcsResult.residual.gasolinePerAcre * cluster.area;
        lcaTotals.totalJetFuel += frcsResult.residual.jetFuelPerAcre * cluster.area;
        lcaTotals.totalTransportationDistance += distance * 2 * numberOfTripsForTransportation;

        results.clusters.push({
          cluster_no: cluster.cluster_no,
          area: cluster.area,
          biomass: clusterFeedstock,
          distance: distance,
          combinedCost: frcsResult.total.costPerAcre * cluster.area,
          residueCost: frcsResult.residual.costPerAcre * cluster.area,
          transportationCost: transportationCostTotal,
          frcsResult: frcsResult,
          center_lat: cluster.center_lat,
          center_lng: cluster.center_lng,
          landing_lat: cluster.landing_lat,
          landing_lng: cluster.landing_lng,
          landing_distance: 0, // don't need for supply curves
          county: cluster.county_name,
          land_use: cluster.land_use,
          haz_class: cluster.haz_class,
          forest_type: cluster.forest_type,
          site_class: cluster.site_class,
        });
        results.clusterNumbers.push(cluster.cluster_no);
        usedIds.push(cluster.cluster_no);
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
