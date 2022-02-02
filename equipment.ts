import { SystemTypes } from '@ucdavis/frcs/out/model';

// Purchase price as of Dec 02
const chainsawPirce = 700;
const fbuncherPrice = (150000 + 310000 + 310000) / 3;
const harvesterPrice = 400000;
const skidderPrice = 170000;
const forwarderPrice = 275000;
const yarderPrice = 245000;
const processorPrice = 350000;
const loaderPrice = 220000;
const chipperPrice = 250000;
const bundlerPrice = 450000;
const truckPrice = 100000;

// Machine life (years)
const chainsawLife = 1;
const fbuncherLife = 4;
const harvesterLife = 4;
const skidderLife = 4;
const forwarderLife = 4;
const yarderLife = 10;
const processorLife = 5;
const loaderLife = 5;
const chipperLife = 5;
const bundlerLife = 5;
const feedstockTruckLife = 5;
const moveinTruckLife = 30;

// weight ratio of CT to ST. row represents treatment and colume represents system
const weightRatioST = [
  [0.31, 0.31, 0, 0.3, 0, 0.31, 0, 0.3, 0, 0.3],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.65, 0.65, 0, 0.62, 0, 0.56, 0, 0.53, 0, 0.62],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.82, 0.82, 0, 0.78, 0, 0.83, 0, 0.79, 0, 0.78],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.41, 0.41, 0, 0.39, 0, 0.41, 0, 0.39, 0, 0.39],
  [0.06, 0.06, 0, 0.06, 0, 0.06, 0, 0.06, 0, 0.06],
  [0.11, 0.11, 0, 0.1, 0, 0.11, 0, 0.1, 0, 0.1],
  [1, 1, 0, 1, 0, 1, 0, 1, 0, 1],
];

// weight ratio of CT to AT. row represents treatment and colume represents system
const weightRatioAT = [
  [0.17, 0.17, 0.16, 0, 0.17, 0.17, 0.15, 0, 0.16, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.58, 0.58, 0.55, 0, 0.49, 0.49, 0.46, 0, 0.54, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.6, 0.6, 0.53, 0, 0.64, 0.64, 0.57, 0, 0.54, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.22, 0.22, 0.2, 0, 0.21, 0.21, 0.19, 0, 0.19, 0],
  [0.03, 0.03, 0.02, 0, 0.03, 0.03, 0.02, 0, 0.02, 0],
  [0.05, 0.05, 0.04, 0, 0.05, 0.05, 0.04, 0, 0.04, 0],
  [1, 1, 1, 0, 1, 1, 1, 0, 1, 0],
];

export const getEquipmentPrice = (treatment: number, system: string, year: number) => {
  const treatmentIdx = treatment - 1; // e.g., treatment no.1 corresponds to index 0
  // Purchase price as of Dec 02
  const chainsaw = year % chainsawLife === 0 ? chainsawPirce : 0;
  const fbuncher = year % fbuncherLife === 0 ? fbuncherPrice : 0;
  const harvester = year % harvesterLife === 0 ? harvesterPrice : 0;
  const skidder = year % skidderLife === 0 ? skidderPrice : 0;
  const forwarder = year % forwarderLife === 0 ? forwarderPrice : 0;
  const yarder = year % yarderLife === 0 ? yarderPrice : 0;
  const processor = year % processorLife === 0 ? processorPrice : 0;
  const loader = year % loaderLife === 0 ? loaderPrice : 0;
  const chipper = year % chipperLife === 0 ? chipperPrice : 0;
  const bundler = year % bundlerLife === 0 ? bundlerPrice : 0;
  const feedstockTruck = year % feedstockTruckLife === 0 ? truckPrice * 6 : 0; // 6 trucks for feedstock transport
  const moveinTruck = year % moveinTruckLife === 0 ? truckPrice : 0; // 1 truck for equipment move-in

  let equipmentPrice = 0;
  switch (system) {
    case SystemTypes.groundBasedMechWt:
      equipmentPrice =
        fbuncher * weightRatioST[treatmentIdx][0] +
        skidder * weightRatioAT[treatmentIdx][0] +
        chipper +
        feedstockTruck +
        moveinTruck;
      break;
    case SystemTypes.groundBasedManualWt:
      equipmentPrice =
        chainsaw * weightRatioST[treatmentIdx][1] +
        skidder * weightRatioAT[treatmentIdx][1] +
        chipper +
        feedstockTruck +
        moveinTruck;
      break;
    case SystemTypes.groundBasedManualLog:
      equipmentPrice =
        chainsaw * weightRatioAT[treatmentIdx][2] +
        skidder * weightRatioAT[treatmentIdx][2] +
        chipper +
        feedstockTruck +
        moveinTruck;
      break;
    case SystemTypes.groundBasedCtl:
      equipmentPrice =
        harvester * weightRatioST[treatmentIdx][3] +
        forwarder * weightRatioST[treatmentIdx][3] +
        chipper +
        feedstockTruck +
        moveinTruck +
        bundler +
        forwarder; // an additional forwarder used for residues
      break;
    case SystemTypes.cableManualWtLog:
      equipmentPrice =
        chainsaw + yarder * weightRatioAT[treatmentIdx][4] + chipper + feedstockTruck + moveinTruck;
      break;
    case SystemTypes.cableManualWt:
      equipmentPrice =
        chainsaw * weightRatioST[treatmentIdx][5] +
        yarder * weightRatioAT[treatmentIdx][5] +
        chipper +
        feedstockTruck +
        moveinTruck;
      break;
    case SystemTypes.cableManualLog:
      equipmentPrice =
        chainsaw * weightRatioAT[treatmentIdx][6] +
        yarder * weightRatioAT[treatmentIdx][6] +
        chipper +
        feedstockTruck +
        moveinTruck;
      break;
    case SystemTypes.cableCtl:
      equipmentPrice =
        harvester * weightRatioST[treatmentIdx][7] +
        yarder * weightRatioST[treatmentIdx][7] +
        chipper +
        feedstockTruck +
        moveinTruck;
      break;
    case SystemTypes.helicopterManualLog:
      equipmentPrice =
        chainsaw * weightRatioAT[treatmentIdx][8] + chipper + feedstockTruck + moveinTruck;
      break;
    case SystemTypes.helicopterCtl:
      equipmentPrice =
        harvester * weightRatioST[treatmentIdx][9] + chipper + feedstockTruck + moveinTruck;
      break;
  }
  return equipmentPrice;
};
