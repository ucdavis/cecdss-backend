import { getMoveInCosts } from '@ucdavis/frcs';
import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { gasificationPower, genericCombinedHeatPower, genericPowerOnly } from '@ucdavis/tea';
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
  teaOutput: OutputModGPO | OutputModCHP | OutputModGP,
  biomassTarget: number,
  year: number,
  usedIds: number[],
  errorIds: number[],
  result?: YearlyResultTest
): Promise<YearlyResult> => {
  return new Promise(async (resolve, reject) => {
    // console.log(`year: ${year}, usedIds: ${usedIds}`);
    try {
      const results: YearlyResult = {
        year,
        clusterNumbers: [],
        numberOfClusters: 0,
        totalBiomass: 0,
        biomassTarget,
        totalArea: 0,
        totalResidueCost: 0,
        totalMoveInCost: 0,
        totalMoveInDistance: 0,
        totalTransportationCost: 0,
        radius,
        clusters: [],
        errorClusters: [],
        errorClusterNumbers: [],
        teaResults: teaOutput,
        fuelCost: 0
      };

      const lcaTotals: LCATotals = {
        totalDiesel: 0,
        totalGasoline: 0,
        totalJetFuel: 0,
        totalTransportationDistance: 0
      };

      while (results.totalBiomass < biomassTarget) {
        if (results.radius > 20000 && results.totalBiomass / biomassTarget < 0.3) {
          console.log('radius large & not enough biomass');
          break;
        }

        results.radius += 1000;
        console.log(
          `getting clusters from db, radius: ${results.radius}, totalBiomass: ${
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
        console.log(`clusters found: ${clusters.length}`);
        console.log('sorting clusters...');
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
        console.log('selecting clusters...');
        await selectClusters(osrm, params, biomassTarget, sortedClusters, results, lcaTotals);
      }

      console.log(`calculating move in distance on ${results.clusters.length} clusters...`);
      let moveInDistance = 0;
      if (results.totalBiomass > 0 && results.clusters.length < 5000) {
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
        dieselPerKwhElectricity:
          lcaTotals.totalDiesel / params.teaInputs.ElectricalFuelBaseYear.NetElectricalCapacity,
        gasolinePerKwhElectricity:
          lcaTotals.totalGasoline / params.teaInputs.ElectricalFuelBaseYear.NetElectricalCapacity,
        jetFuelPerKwhElectricity:
          lcaTotals.totalJetFuel / params.teaInputs.ElectricalFuelBaseYear.NetElectricalCapacity,
        transportationDistance:
          lcaTotals.totalTransportationDistance /
          params.teaInputs.ElectricalFuelBaseYear.NetElectricalCapacity
      };
      console.log('running LCA...');
      const lca = await runLca(lcaInputs);
      // console.log(lca);
      results.lcaResults = lca;
      // $ / dry metric ton
      const fuelCost =
        (results.totalResidueCost + results.totalTransportationCost + results.totalMoveInCost) /
        results.totalBiomass;
      results.fuelCost = fuelCost;
      const updatedTeaInputs = { ...params.teaInputs }; // copy original tea inputs
      updatedTeaInputs.ExpensesBaseYear.BiomassFuelCost = fuelCost;
      // but update using fuel cost calculated from frcs results

      //   console.log('updating tea outputs...');
      const updatedTeaOutputs: any = await getTeaOutputs(params.teaModel, updatedTeaInputs);
      results.teaResults = updatedTeaOutputs;

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
  usedIds: number[],
  errorIds: number[],
  radius: number
): Promise<TreatedCluster[]> => {
  return new Promise(async (res, rej) => {
    const bounds = getBoundsOfDistance(
      { latitude: params.lat, longitude: params.lng },
      radius // expand by 1 km at a time
    );
    const clusters: TreatedCluster[] = await db
      .table('treatedclusters')
      .where({ treatmentid: params.treatmentid, year: year })
      .whereNotIn('cluster_no', [...usedIds, ...errorIds])
      .whereBetween('landing_lat', [bounds[0].latitude, bounds[1].latitude])
      .andWhereBetween('landing_lng', [bounds[0].longitude, bounds[1].longitude]);
    res(clusters);
  });
};

const selectClusters = async (
  osrm: OSRM,
  params: RequestParams,
  biomassTarget: number,
  sortedClusters: TreatedCluster[],
  results: YearlyResult,
  lcaTotals: LCATotals
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
            params.teaInputs.ElectricalFuelBaseYear.MoistureContent
          );

          // use frcs calculated available feedstock
          const clusterBiomass = frcsResult.Residue.WeightPerAcre * cluster.area; // green tons
          //   if (clusterBiomass < 1) {
          //     throw new Error(`Cluster biomass was: ${clusterBiomass}, which is too low to use`);
          //   }

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
          // multiply the osrm road distance by number of trips, and then by 2 because it's a round trip
          let distance = route.distance * numberOfTripsForTransportation * 2;
          distance = distance / 1000; // m to km
          const duration = route.duration / 3600; // seconds to hours
          const transportationCostPerGT = getTransportationCost(
            distance,
            duration,
            params.dieselFuelPrice
          );
          const transportationCostTotal = transportationCostPerGT * clusterBiomass;

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
            lat: cluster.center_lat,
            lng: cluster.center_lng
          });
          results.clusterNumbers.push(cluster.cluster_no);
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
  const clusterCoordinates = clusters.map(cluster => [cluster.lng, cluster.lat]);
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
