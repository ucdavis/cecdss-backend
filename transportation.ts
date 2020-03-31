const TRUCK_LABOR = 22.74;
const DRIVERS_PER_TRUCK = 1.67;
const MILES_PER_GALLON = 6;
// TODO: pull from user input
const FUEL_COST = 3.8; // use FRCS input
const OIL_ETC_COST = 0.35; // $/mile
const KM_TO_MILES = 0.621371;

const getTonsPerTruck = (material?: string) => {
  //   if (material === 'bale') return 17; // tons/truck  @ 26 *  0.65445 tons/bale

  //   if (material === 'bulk') return 19.9; // tons/truck @ 9.1 lb / ft 3

  return 18.5;
};

export const getTransportationCost = (distance: number, duration: number) => {
  //   const transportation = get(feature.properties.id);

  //   if (transportation.error) {
  //     return -1;
  //   }

  const tonsPerTruck = getTonsPerTruck();

  const miles = distance * KM_TO_MILES;

  const hours = duration;

  /*

      2* cause you have to drive back

      1.67 cause a driver costs you 67% more than salary in benefits and overhead

      1/6 cause you get 6 MPG

      0.29 Depreciation, repair and maintenance of truck

    */

  const labor = DRIVERS_PER_TRUCK * TRUCK_LABOR * hours;

  const fuel = (1 / MILES_PER_GALLON) * FUEL_COST * miles;

  let cost = OIL_ETC_COST * miles + fuel + labor;

  cost = cost / tonsPerTruck;

  return cost * 2;
};
