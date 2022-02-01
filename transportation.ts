import { getDistance } from 'geolib';
import { ClusterResult, YearlyResult, YearlyTripResults } from 'models/types';
import OSRM from 'osrm';
import { performance } from 'perf_hooks';

const MILES_PER_GALLON = 6;
export const KM_TO_MILES = 0.621371;
export const FULL_TRUCK_PAYLOAD = 25; // FRCS assumption (in green tons)
export const TRUCK_OWNERSHIP_COST = 13.1; // $/h

export const getTransportationCostTotal = (
  feedstockAmount: number,
  distance: number,
  duration: number,
  dieselFuelPrice: number,
  wageTruckDriver: number,
  driverBenefits: number,
  oilCost: number
) => {
  let transportationCostFullPayloadPerGT = 0;
  if (feedstockAmount >= FULL_TRUCK_PAYLOAD) {
    transportationCostFullPayloadPerGT = getTransportationCostPerGT(
      distance,
      duration,
      dieselFuelPrice,
      FULL_TRUCK_PAYLOAD,
      wageTruckDriver,
      driverBenefits,
      oilCost
    );
  }
  let transportationCostPartialPayloadPerGT = 0;
  const partialPayload = feedstockAmount % FULL_TRUCK_PAYLOAD;
  if (partialPayload > 0) {
    transportationCostPartialPayloadPerGT = getTransportationCostPerGT(
      distance,
      duration,
      dieselFuelPrice,
      partialPayload,
      wageTruckDriver,
      driverBenefits,
      oilCost
    );
  }
  const transportationCostTotal =
    (feedstockAmount - partialPayload) * transportationCostFullPayloadPerGT +
    partialPayload * transportationCostPartialPayloadPerGT;

  return transportationCostTotal;
};

export const getTransportationCostPerGT = (
  distance: number,
  duration: number,
  dieselFuelPrice: number,
  payload: number,
  wageTruckDriver: number,
  driverBenefits: number,
  oilCost: number
) => {
  const miles = distance * KM_TO_MILES * 2; // 2* cause you have to drive back

  const hours = duration * 2;

  const labor = (1 + driverBenefits / 100) * wageTruckDriver * hours;

  const fuel = (1 / MILES_PER_GALLON) * dieselFuelPrice * miles;

  const oil = oilCost * miles;

  const truckOwnership = TRUCK_OWNERSHIP_COST * hours;

  let cost = oil + fuel + labor + truckOwnership;

  cost = cost / payload;

  return cost;
};

export const getMoveInTrip = (
  osrm: OSRM,
  facilityLat: number,
  facilityLng: number,
  clusters: ClusterResult[]
): Promise<YearlyTripResults> => {
  const clusterCoordinates = clusters.map((cluster) => [cluster.center_lng, cluster.center_lat]);
  const options: OSRM.TripOptions = {
    roundtrip: true,
    generate_hints: false,
    geometries: 'geojson',
    // overview: 'false',
    source: 'first',
    coordinates: [
      [facilityLng, facilityLat], // start at facility
      ...clusterCoordinates,
    ],
  };

  return new Promise((resolve, reject) => {
    if (clusters.length === 0) {
      resolve({ distance: 0, trips: [] });
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

      const results: YearlyTripResults = {
        trips: result.trips,
        distance: osrmDistance, // in meters
      };

      resolve(results);
    });
  });
};

export const calculateMoveInDistance = async (
  osrm: OSRM,
  results: YearlyResult,
  facilityLat: number,
  facilityLng: number
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
          { latitude: facilityLat, longitude: facilityLng },
          { latitude: a.center_lat, longitude: a.center_lng }
        ) -
        getDistance(
          { latitude: facilityLat, longitude: facilityLng },
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
        facilityLat,
        facilityLng,
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
    console.log(`calculating move in distance on ${results.clusters.length} clusters...`);
    const t0 = performance.now();
    const moveInTripResults = await getMoveInTrip(osrm, facilityLat, facilityLng, results.clusters);
    const t1 = performance.now();
    console.log(
      `Running took ${t1 - t0} milliseconds, move in distance: ${moveInTripResults.distance}.`
    );

    totalMoveInDistance = moveInTripResults.distance;
  }

  return totalMoveInDistance;
};
