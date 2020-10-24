import { getMoveInCosts } from '@ucdavis/frcs';
import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import {
  calculateEnergyRevenueRequired,
  gasificationPower,
  genericCombinedHeatPower,
  genericPowerOnly
} from '@ucdavis/tea';
import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/out/models/output.model';
import { getBoundsOfDistance, getDistance } from 'geolib';
import fetch from 'isomorphic-fetch';
import Knex from 'knex';
import OSRM from 'osrm';
import { performance } from 'perf_hooks';
import { LCAresults, LCARunParams } from './models/lcaModels';
import { TreatedCluster } from './models/treatedcluster';
import {
  ClusterResult,
  LCATotals,
  RequestParams,
  TreatedClustersInfo,
  YearlyResult,
  YearlyResultTest
} from './models/types';
import { runFrcsOnCluster } from './runFrcs';
import { getTransportationCost, KM_TO_MILES, TONS_PER_TRUCK } from './transportation';

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
    // console.log(`year: ${year}, usedIds: ${usedIds}`);
    try {
      const results: YearlyResult = {
        year,
        clusterNumbers: [],
        numberOfClusters: 0,
        totalBiomass: 0,
        totalArea: 0,
        totalResidueCost: 0,
        totalMoveInCost: 0,
        totalMoveInDistance: 0,
        totalTransportationCost: 0,
        radius,
        clusters: [],
        errorClusters: [],
        errorClusterNumbers: [],
        fuelCost: 0,
        energyRevenueRequired: 0,
        geoJson: []
      };

      const lcaTotals: LCATotals = {
        totalDiesel: 0,
        totalGasoline: 0,
        totalJetFuel: 0,
        totalTransportationDistance: 0
      };

      while (results.totalBiomass < biomassTarget) {
        if (
          results.radius > 40000 &&
          results.clusters.length > 3800 &&
          results.totalBiomass / biomassTarget < 0.1
        ) {
          console.log('radius large & not enough biomass');
          break;
        }

        results.radius += 4000;
        console.log(
          `year:${year} getting clusters from db, radius: ${results.radius}, totalBiomass: ${
            results.totalBiomass
          }, biomassTarget: ${biomassTarget}, ${results.totalBiomass < biomassTarget} ...`
        );
        const clusters: TreatedCluster[] = await getClusters(
          db,
          params,
          year,
          usedIds,
          errorIds,
          results.radius
        );
        console.log(`year:${year} clusters found: ${clusters.length}`);
        console.log(`year:${year} sorting clusters...`);
        // TODO: sort in query
        const sortedClusters = clusters.sort(
          (a, b) =>
            getDistance(
              { lat: params.lat, lng: params.lng },
              { lat: a.landing_lat, lng: a.landing_lng }
            ) -
            getDistance(
              { lat: params.lat, lng: params.lng },
              { lat: b.landing_lat, lng: b.landing_lng }
            )
        );
        console.log(`year:${year} selecting clusters...`);
        await selectClusters(
          osrm,
          params,
          biomassTarget,
          sortedClusters,
          results,
          lcaTotals,
          usedIds,
          errorIds
        );
      }

      console.log(`calculating move in distance on ${results.clusters.length} clusters...`);
      let moveInDistance = 0;
      if (
        results.totalBiomass > 0 &&
        results.clusters.length < 5000 &&
        params.treatmentid === 4 &&
        params.system === 'Ground-Based CTL'
      ) {
        const t0 = performance.now();
        moveInDistance = await getMoveInDistance(osrm, params.lat, params.lng, results.clusters);
        const t1 = performance.now();
        console.log(
          `Running took ${t1 - t0} milliseconds, move in distance: ${moveInDistance}.
                  calculating move in cost...`
        );
      } else {
        console.log(
          `skipping calculating move in distance, totalBiomass: ${results.totalBiomass}, # of clusters: ${results.clusters.length}`
        );
      }

      const moveInCosts = getMoveInCosts({
        System: params.system,
        MoveInDist: moveInDistance,
        DieselFuelPrice: params.dieselFuelPrice,
        ChipAll: params.treatmentid === 4 ? true : false // true if treatment is timberSalvage
      });

      console.log(`move in cost: ${moveInCosts.Residue}`);

      results.totalMoveInDistance = moveInDistance;
      results.totalMoveInCost = moveInCosts.Residue;

      results.numberOfClusters = results.clusterNumbers.length;
      // console.log(results);
      const lcaInputs: LCARunParams = {
        technology: params.teaModel,
        dieselPerKwhElectricity: lcaTotals.totalDiesel / params.annualGeneration,
        gasolinePerKwhElectricity: lcaTotals.totalGasoline / params.annualGeneration,
        jetFuelPerKwhElectricity: lcaTotals.totalJetFuel / params.annualGeneration,
        transportationDistance: lcaTotals.totalTransportationDistance / params.annualGeneration
      };
      console.log('running LCA...');
      const lca = await runLca(lcaInputs);
      // console.log(lca);
      results.lcaResults = lca;
      // $ / dry metric ton
      const fuelCost =
        (results.totalResidueCost + results.totalTransportationCost + results.totalMoveInCost) /
        results.totalBiomass;
      // return updated fuel cost so that tea results can be updated later
      results.fuelCost = fuelCost;

      const energyRevenueRequired = calculateEnergyRevenueRequired(
        params.teaModel,
        params.cashFlow
      );
      results.energyRevenueRequired = energyRevenueRequired;

      const geoJson = await getGeoJson(db, results.clusterNumbers, results.clusters);
      results.geoJson = geoJson;

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
  params: RequestParams,
  year: number,
  usedIds: string[],
  errorIds: string[],
  radius: number
): Promise<TreatedCluster[]> => {
  return new Promise(async (res, rej) => {
    const bounds = getBoundsOfDistance(
      { latitude: params.lat, longitude: params.lng },
      radius // expand by 1 km at a time
    );
    // if (radius < 5000) {
    // console.log('--------------------------------------');
    // console.log(
    //   await db
    //     .table('treatedclusters')
    //     .where({ treatmentid: params.treatmentid, year: year })
    //     .whereNotIn('cluster_no', [...usedIds, ...errorIds])
    //     .whereBetween('landing_lat', [bounds[0].latitude, bounds[1].latitude])
    //     .andWhereBetween('landing_lng', [bounds[0].longitude, bounds[1].longitude])
    //     .toSQL()
    //     .toNative()
    // );
    // console.log('--------------------------------------');
    // }
    const clusters: TreatedCluster[] = await db
      .table('treatedclusters')
      .where({ treatmentid: params.treatmentid, year: year })
      .whereNotIn('cluster_no', [...usedIds, ...errorIds])
      .whereBetween('center_lat', [bounds[0].latitude, bounds[1].latitude])
      .andWhereBetween('center_lng', [bounds[0].longitude, bounds[1].longitude]);
    res(clusters);
  });
};

const selectClusters = async (
  osrm: OSRM,
  params: RequestParams,
  biomassTarget: number,
  sortedClusters: TreatedCluster[],
  results: YearlyResult,
  lcaTotals: LCATotals,
  usedIds: string[],
  errorIds: string[]
) => {
  return new Promise(async (res, rej) => {
    for (const cluster of sortedClusters) {
      if (results.totalBiomass >= biomassTarget) {
        // results.skippedClusters.push(cluster); // keeping for testing for now
        break;
      } else {
        try {
          const frcsResult: OutputVarMod = await runFrcsOnCluster(
            cluster,
            params.system,
            params.dieselFuelPrice,
            params.moistureContent
          );

          // use frcs calculated available feedstock
          const clusterBiomass = frcsResult.Residue.WeightPerAcre * cluster.area; // green tons
          if (clusterBiomass < 1) {
            throw new Error(`Cluster biomass was: ${clusterBiomass}, which is too low to use`);
          }

          const routeOptions: OSRM.RouteOptions = {
            coordinates: [
              [params.lng, params.lat],
              [cluster.landing_lng, cluster.landing_lat]
            ],
            annotations: ['duration', 'distance']
          };

          // currently distance is the osrm generated distance between each landing site and the facility location
          const route: any = await getRouteDistanceAndDuration(osrm, routeOptions);
          // number of trips is how many truckloads it takes to transport biomass
          const numberOfTripsForTransportation = clusterBiomass / TONS_PER_TRUCK;
          // multiply the osrm road distance by number of trips, transportation eq doubles it for round trip
          let distance = route.distance;
          distance = distance / 1000; // m to km
          const duration = route.duration / 3600; // seconds to hours
          const transportationCostPerGT = getTransportationCost(
            distance,
            duration,
            params.dieselFuelPrice
          );
          const transportationCostTotal = transportationCostPerGT * clusterBiomass;
          const costPerKM =
            transportationCostTotal / (distance * 2 * numberOfTripsForTransportation);

          results.totalBiomass += clusterBiomass;
          results.totalArea += cluster.area;
          // results.totalCombinedCost += frcsResult.Total.CostPerAcre * cluster.area;
          results.totalTransportationCost += transportationCostTotal;
          results.totalResidueCost += frcsResult.Residue.CostPerAcre * cluster.area;
          lcaTotals.totalDiesel += frcsResult.Residue.DieselPerAcre * cluster.area;
          lcaTotals.totalGasoline += frcsResult.Residue.GasolinePerAcre * cluster.area;
          lcaTotals.totalJetFuel += frcsResult.Residue.JetFuelPerAcre * cluster.area;
          lcaTotals.totalTransportationDistance += distance;

          results.clusters.push({
            cluster_no: cluster.cluster_no,
            area: cluster.area,
            biomass: clusterBiomass,
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
            site_class: cluster.sit_raster
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
            slope: cluster.slope
          });
          results.errorClusterNumbers.push(cluster.cluster_no);
          errorIds.push(cluster.cluster_no);
        }
      }
    }
    res();
  });
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

const getMoveInDistance = (
  osrm: OSRM,
  facilityLat: number,
  facilityLng: number,
  clusters: ClusterResult[]
): Promise<number> => {
  const clusterCoordinates = clusters.map(cluster => [cluster.center_lng, cluster.center_lat]);
  //   console.log(JSON.stringify(clusterCoordinates));
  const options: OSRM.TripOptions = {
    roundtrip: true,
    generate_hints: false,
    // overview: 'false',
    source: 'first',
    coordinates: [
      [facilityLng, facilityLat], // start at facility
      ...clusterCoordinates
    ]
  };

  return new Promise((resolve, reject) => {
    if (clusters.length === 0) {
      resolve(0);
    }
    osrm.trip(options, async (err, result) => {
      if (err) {
        console.log('rejecting move in...');
        console.log(err);
        reject(err);
      }
      const osrmDistance = result.trips.reduce((dist, trip) => dist + trip.distance, 0);
      // const osrmDuration = result.trips.reduce((dur, trip) => dur + trip.duration, 0);
      console.log('resolving move in...');
      resolve((osrmDistance / 1000) * KM_TO_MILES);
    });
  });
};

export const runLca = async (inputs: LCARunParams) => {
  const results: LCAresults = await fetch(
    `https://lifecycle-analysis.azurewebsites.net/lcarun?technology=\
         ${inputs.technology}&diesel=${inputs.dieselPerKwhElectricity}\
         &gasoline=${inputs.gasolinePerKwhElectricity}\
         &jetfuel=${inputs.jetFuelPerKwhElectricity}\
         &distance=${inputs.transportationDistance}`,
    {
      mode: 'cors',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(res => res.json());
  return results;
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
    const clusterGeoJsonClusterNumbers = clusterGeoJson.map(g => g.cluster_no);
    const clustersCopy = [...clusters];
    const clustersCopy2 = clustersCopy
      .filter(onlyUnique)
      .filter(x => clusterGeoJsonClusterNumbers.indexOf(x.cluster_no) > -1);
    clustersCopy.sort((a, b) => {
      return Number(a.cluster_no) - Number(b.cluster_no);
    });
    console.log(
      `clusterNumbers: ${clusterNumbers.length}, clusters: ${clusters.length}, clusterGeoJson: ${clusterGeoJson.length}, clusterGeoJsonNumbers: ${clusterGeoJsonClusterNumbers.length} clusterCopy:${clustersCopy2.length}`
    );
    const features = clusterGeoJson.map((treatedClusterInfo, index) => {
      // if (treatedClusterInfo.cluster_no !== clustersCopy[index].cluster_no) {
      //   console.log(
      //     `ERROR! cluster: ${clustersCopy[index].cluster_no}!==treatedClusterInfo: ${treatedClusterInfo.cluster_no}`
      //   );
      // }
      const i =
        treatedClusterInfo.cluster_no === clustersCopy[index].cluster_no
          ? index
          : clustersCopy.findIndex(a => a.cluster_no === treatedClusterInfo.cluster_no);
      return {
        ...treatedClusterInfo.geography,
        properties: {
          cluster_no: treatedClusterInfo.cluster_no,
          lat: clusters[i].center_lat,
          lng: clusters[i].center_lng,
          area: clusters[i].area,
          distance: clusters[i].distance,
          biomass: clusters[i].biomass,
          combinedCost: clusters[i].combinedCost,
          residueCost: clusters[i].residueCost,
          transportationCost: clusters[i].transportationCost
        }
      };
    });
    res(features);
    // const featureCollection = {
    //   type: 'FeatureCollection',
    //   features: [...features]
    // };
    // res(featureCollection);
  });
};

function onlyUnique(value: any, index: any, self: any) {
  return self.indexOf(value) === index;
}
