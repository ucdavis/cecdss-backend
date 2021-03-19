import { ClusterResult, YearlyTripResults } from 'models/types';
import OSRM from 'osrm';

const TRUCK_LABOR = 23.29; // changed from 22.74 according to BLS 2019
const DRIVERS_PER_TRUCK = 1.67;
const MILES_PER_GALLON = 6;
const OIL_ETC_COST = 0.35; // $/mile
export const KM_TO_MILES = 0.621371;
export const TONS_PER_TRUCK = 25; // frcs assumption
// 17.33 in metric tons, multiply by constant to get into short tons

export const getTransportationCost = (distance: number, duration: number, fuelCost: number) => {
  const miles = distance * KM_TO_MILES;

  const hours = duration;

  /*

      2* cause you have to drive back

      1.67 cause a driver costs you 67% more than salary in benefits and overhead

      1/6 cause you get 6 MPG

      0.29 Depreciation, repair and maintenance of truck

    */

  const labor = DRIVERS_PER_TRUCK * TRUCK_LABOR * hours;

  const fuel = (1 / MILES_PER_GALLON) * fuelCost * miles;

  let cost = OIL_ETC_COST * miles + fuel + labor;

  cost = cost / TONS_PER_TRUCK;

  return cost * 2;
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
