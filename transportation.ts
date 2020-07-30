const TRUCK_LABOR = 23.29; // changed from 22.74 according to BLS 2019
const DRIVERS_PER_TRUCK = 1.67;
const MILES_PER_GALLON = 6;
const OIL_ETC_COST = 0.35; // $/mile
const KM_TO_MILES = 0.621371;
const TONS_PER_TRUCK = 17.33 * 1.10231; // changed from 18.5 due to updated 2020 data from GREET model
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
