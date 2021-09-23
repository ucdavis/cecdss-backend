import { getMoveInCosts } from '@ucdavis/frcs';
import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { runLCA } from '@ucdavis/lca';
import { RunParams } from '@ucdavis/lca/out/lca.model';
import {
  calculateEnergyRevenueRequired,
  calculateEnergyRevenueRequiredPW,
  gasificationPower,
  genericCombinedHeatPower,
  genericPowerOnly,
} from '@ucdavis/tea';
import {
  CashFlow,
  OutputModCHP,
  OutputModGP,
  OutputModGPO,
} from '@ucdavis/tea/out/models/output.model';
import geocluster from 'geocluster';
import Knex from 'knex';
import OSRM from 'osrm';
import { performance } from 'perf_hooks';
import { LCAresults } from './models/lcaModels';
import { TreatedCluster } from './models/treatedcluster';
import { LCATotals, RequestByDistanceParams, YearlyResult } from './models/types';
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
        totalCostPerDryTon: 0,
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

      let totalMoveInDistance = 0;

      if (results.clusters.length > 500) {
        console.log('lots of clusters, breaking into chunks');

        const clusterCoordinates = results.clusters.map((c) => [c.center_lng, c.center_lat]);

        const maxClustersPerChunk = 4000;

        let chunkedClusters: any[] = [];
        let bias = 1.5; // multiply stdev with this factor, the smaller the more clusters
        chunkedClusters = geocluster(clusterCoordinates, bias);

        // we want to make sure there are no clusters with more than maxClustersPerChunk
        while (Math.max(...chunkedClusters.map((cc) => cc.elements.length)) > maxClustersPerChunk) {
          console.log(`clusters too large with bias ${bias}, retrying with smaller bias`);
          bias = bias * 0.8; // make the stdev smaller to get more clusters
          chunkedClusters = geocluster(clusterCoordinates, bias);
        }

        console.log('number of chunks:', chunkedClusters.length);
        console.log('clusters in chunk1:' + chunkedClusters[0].elements.length);

        for (let i = 0; i < chunkedClusters.length; i++) {
          const chunk = chunkedClusters[i];

          const clustersInChunk = chunk.elements.map(
            (latlng: number[]) =>
              ({
                center_lng: latlng[0],
                center_lat: latlng[1],
              } as TreatedCluster)
          );

          console.log(
            `calculating move in distance on ${clustersInChunk.length} clusters in chunk ${
              i + 1
            }...`
          );
          const t0_chunk = performance.now();
          const chunkedMoveInTripResults = await getMoveInTrip(
            osrm,
            params.facilityLat,
            params.facilityLng,
            clustersInChunk
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

      // we only update the move in distance if it is applicable for this type of treatment & system
      let moveInDistance = 0;
      if (
        results.totalFeedstock > 0 &&
        results.clusters.length < 5000 &&
        params.system === 'Ground-Based CTL'
      ) {
        console.log('updating move in distance of');
        moveInDistance = totalMoveInDistance;
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

      results.numberOfClusters = results.clusterNumbers.length;
      console.log(lcaTotals);

      const lcaInputs: RunParams = {
        technology: params.teaModel,
        diesel: lcaTotals.totalDiesel / params.annualGeneration, // gal/MWh
        gasoline: lcaTotals.totalGasoline / params.annualGeneration, // gal/MWh
        jetfuel: lcaTotals.totalJetFuel / params.annualGeneration, // gal/MWh
        distance: (lcaTotals.totalTransportationDistance * KM_TO_MILES) / params.annualGeneration, // km/MWh
      };
      console.log('running LCA...');
      console.log('lcaInputs:');
      console.log(lcaInputs);
      console.log('lcaTotals:');
      console.log(lcaTotals);
      console.log(
        `annualGeneration: ${params.annualGeneration}, radius: ${results.radius}, # of clusters: ${results.numberOfClusters}`
      );
      const lca = await runLca(lcaInputs);
      results.lcaResults = lca;

      const moistureContentPercentage = params.moistureContent / 100.0;

      // calculate dry values ($ / dry metric ton)
      results.totalDryFeedstock = results.totalFeedstock * (1 - moistureContentPercentage);
      results.totalDryCoproduct = results.totalCoproduct * (1 - moistureContentPercentage);

      results.harvestCostPerDryTon = results.totalHarvestCost / results.totalDryFeedstock;
      results.transportationCostPerDryTon =
        results.totalTransportationCost / results.totalDryFeedstock;
      results.moveInCostPerDryTon = results.totalMoveInCost / results.totalDryFeedstock;
      results.totalCostPerDryTon =
        results.harvestCostPerDryTon +
        results.transportationCostPerDryTon +
        results.moveInCostPerDryTon;

      const cashFlow: CashFlow = params.cashFlow;
      // TODO: check that this is the proper way to calc biomass fuel cost
      cashFlow.BiomassFuelCost = results.totalHarvestCost + results.totalTransportationCost + results.totalMoveInCost;
      const energyRevenueRequired = calculateEnergyRevenueRequired(
        params.teaModel,
        params.cashFlow
      );
      results.energyRevenueRequired = energyRevenueRequired;
      cashFlow.EnergyRevenueRequired = energyRevenueRequired;
      const energyRevenueRequiredPresent = calculateEnergyRevenueRequiredPW(
        params.year - 2016 + 1, // currently, the first year is 2016
        params.costOfEquity,
        energyRevenueRequired
      );
      console.log(`energyRevenueRequiredPW: ${energyRevenueRequiredPresent}`);
      results.energyRevenueRequiredPW = energyRevenueRequiredPresent;

      results.cashFlow = cashFlow;

      // TODO: probably don't need geo info about cluster usage for distance processing

      // const geoJson = await getGeoJson(db, results.clusterNumbers, results.clusters);
      // results.geoJson = geoJson;
      // const errorGeoJson = await getErrorGeoJson(
      //   db,
      //   results.errorClusterNumbers,
      //   results.errorClusters
      // );
      // results.errorGeoJson = errorGeoJson;

      resolve(results);
    } catch (e) {
      console.log('ERROR!');
      console.log(e);
      reject(e.message);
    }
  });
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
        const frcsResult: OutputVarMod = await runFrcsOnCluster(
          cluster,
          params.system,
          params.dieselFuelPrice,
          params.moistureContent
        );

        // use frcs calculated available feedstock
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

        results.totalFeedstock += clusterFeedstock;
        results.totalHarvestCost += frcsResult.Residue.CostPerAcre * cluster.area;
        results.totalCoproduct += clusterCoproduct;
        results.totalCoproductCost +=
          (frcsResult.Total.CostPerAcre - frcsResult.Residue.CostPerAcre) * cluster.area;

        results.totalArea += cluster.area;
        results.totalTransportationCost += transportationCostTotal;
        lcaTotals.totalDiesel += frcsResult.Residue.DieselPerAcre * cluster.area;
        lcaTotals.totalGasoline += frcsResult.Residue.GasolinePerAcre * cluster.area;
        lcaTotals.totalJetFuel += frcsResult.Residue.JetFuelPerAcre * cluster.area;
        lcaTotals.totalTransportationDistance += distance * 2 * numberOfTripsForTransportation;

        results.clusters.push({
          cluster_no: cluster.cluster_no,
          area: cluster.area,
          biomass: clusterFeedstock,
          distance: distance,
          combinedCost: frcsResult.Total.CostPerAcre * cluster.area,
          residueCost: frcsResult.Residue.CostPerAcre * cluster.area,
          transportationCost: transportationCostTotal,
          frcsResult: frcsResult,
          center_lat: cluster.center_lat,
          center_lng: cluster.center_lng,
          landing_lat: cluster.landing_lat,
          landing_lng: cluster.landing_lng,
          county: cluster.county,
          land_use: cluster.land_use,
          haz_class: cluster.haz_class,
          forest_type: cluster.forest_type,
          site_class: cluster.site_class,
        });
        results.clusterNumbers.push(cluster.cluster_no);
        usedIds.push(cluster.cluster_no);
      } catch (err) {
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

export const runLca = async (inputs: RunParams) => {
  const results: LCAresults = await runLCA(inputs);
  results.inputs = inputs;
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
