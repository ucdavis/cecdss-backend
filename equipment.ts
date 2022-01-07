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

export const getEquipmentPrice = (system: string, year: number) => {
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
  let equipmentPrice = 0;
  // chipper and bundler is always required for this project
  switch (system) {
    case SystemTypes.groundBasedMechWt:
      equipmentPrice = fbuncher + skidder + processor + loader + chipper + chainsaw;
      break;
    case SystemTypes.groundBasedCtl:
      equipmentPrice = harvester + forwarder + loader + chipper + bundler;
      break;
    case SystemTypes.groundBasedManualWt:
      equipmentPrice = skidder + processor + loader + chipper + chainsaw;
      break;
    case SystemTypes.groundBasedManualLog:
      equipmentPrice = skidder + loader + chipper + chainsaw;
      break;
    case SystemTypes.cableManualWtLog:
      equipmentPrice = yarder + loader + chipper + chainsaw;
      break;
    case SystemTypes.cableManualWt:
      equipmentPrice = yarder + processor + loader + chipper + chainsaw;
      break;
    case SystemTypes.cableManualLog:
      equipmentPrice = yarder + loader + chipper + chainsaw;
      break;
    case SystemTypes.cableCtl:
      equipmentPrice = harvester + yarder + loader + chipper;
      break;
    case SystemTypes.helicopterManualLog:
      equipmentPrice = loader + chipper + chainsaw;
      break;
    case SystemTypes.helicopterCtl:
      equipmentPrice = harvester + loader + chipper;
      break;
  }
  return equipmentPrice;
};
