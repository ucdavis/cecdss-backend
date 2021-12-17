import { ClusterResult, YearlyTripResults } from 'models/types';
import OSRM from 'osrm';

const TRUCK_LABOR = 24.71; // Hourly mean wage for tractor-trailer truck drivers in California, May 2020
const BENEFITS_OVERHEAD = 67; // in percentage
const MILES_PER_GALLON = 6;
const OIL_ETC_COST = 0.35; // $/mile
export const KM_TO_MILES = 0.621371;
export const FULL_TRUCK_PAYLOAD = 25; // FRCS assumption (in green tons)

export const getTransportationCostTotal = (
  feedstockAmount: number,
  distance: number,
  duration: number,
  dieselFuelPrice: number
) => {
  let transportationCostFullPayloadPerGT = 0;
  if (feedstockAmount >= FULL_TRUCK_PAYLOAD) {
    transportationCostFullPayloadPerGT = getTransportationCostPerGT(
      distance,
      duration,
      dieselFuelPrice,
      FULL_TRUCK_PAYLOAD
    );
  }
  let transportationCostPartialPayloadPerGT = 0;
  const partialPayload = feedstockAmount % FULL_TRUCK_PAYLOAD;
  if (partialPayload > 0) {
    transportationCostPartialPayloadPerGT = getTransportationCostPerGT(
      distance,
      duration,
      dieselFuelPrice,
      partialPayload
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
  payload: number
) => {
  const miles = distance * KM_TO_MILES * 2; // 2* cause you have to drive back

  const hours = duration * 2;

  const labor = (1 + BENEFITS_OVERHEAD / 100) * TRUCK_LABOR * hours;

  const fuel = (1 / MILES_PER_GALLON) * dieselFuelPrice * miles;

  const oil = OIL_ETC_COST * miles;

  let cost = oil + fuel + labor;

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
        distance: (osrmDistance / 1000) * KM_TO_MILES,
      };

      resolve(results);
    });
  });
};
