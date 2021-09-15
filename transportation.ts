import { ClusterResult, YearlyTripResults } from 'models/types';
import OSRM from 'osrm';

// 2020 Median Pay for Heavy and Tractor-trailer Truck Drivers according to BLS
// https://www.bls.gov/ooh/transportation-and-material-moving/heavy-and-tractor-trailer-truck-drivers.htm
const TRUCK_LABOR = 22.66;
const DRIVERS_PER_TRUCK = 1.67;
const MILES_PER_GALLON = 6;
const OIL_ETC_COST = 0.35; // $/mile
export const KM_TO_MILES = 0.621371;
export const FULL_TRUCK_PAYLOAD = 25; // FRCS assumption (in green tons)

export const getTransportationCostTotal = (
  feedstockAmount: number,
  distance: number,
  duration: number,
  dieselFuelPrice: number,
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
  /*

    2* cause you have to drive back

    1.67 cause a driver costs you 67% more than salary in benefits and overhead

    1/6 cause you get 6 MPG

    0.29 Depreciation, repair and maintenance of truck

  */

  const miles = distance * KM_TO_MILES * 2;

  const hours = duration * 2;

  const labor = DRIVERS_PER_TRUCK * TRUCK_LABOR * hours;

  const fuel = (1 / MILES_PER_GALLON) * dieselFuelPrice * miles;

  let cost = OIL_ETC_COST * miles + fuel + labor;

  cost = cost / payload + 1.11; // add $1.11 fixed cost to avoid unrealistic cost when distance is small

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
