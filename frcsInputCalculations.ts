import { FrcsInputs } from '@ucdavis/frcs/out/model';
import { TreatedCluster } from './models/treatedcluster';

export const METERS_TO_ACRES = 0.00024711;
export const PIXEL_AREA_TO_ACRES = 30 * 30 * METERS_TO_ACRES;

// these equations come from this sheet:
// https://ucdavis.app.box.com/file/566320916282

export const getFrcsInputs = (
  cluster: TreatedCluster,
  system: string,
  dieselFuelPrice: number,
  moistureContent: number,
  wageFaller: number,
  wageOther: number,
  laborBenefits: number,
  ppiCurrent: number,
  residueRecovFracWT: number,
  residueRecovFracCTL: number
) => {
  const boleWeightCT =
    calcBoleWeightCT(cluster) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  // residue here only refers to the residue defined in FRCS - tops and limbs of log trees
  const residueWeightCT =
    calcResidueWeightCT(cluster) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueFractionCT = residueWeightCT / boleWeightCT;
  const removalsCT = calcRemovalsCT(cluster);
  const volumeCT = calcVolumeCT(cluster);

  const boleWeightSLT =
    calcBoleWeightSLT(cluster) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueWeightSLT =
    calcResidueWeightSLT(cluster) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueFractionSLT = residueWeightSLT / boleWeightSLT;
  const removalsSLT = calcRemovalsSLT(cluster);
  const volumeSLT = calcVolumeSLT(cluster);

  const boleWeightLLT =
    calcBoleWeightLLT(cluster) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueWeightLLT =
    calcResidueWeightLLT(cluster) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueFractionLLT = residueWeightLLT / boleWeightLLT;
  const removalsLLT = calcRemovalsLLT(cluster, system);
  const volumeLLT = calcVolumeLLT(cluster, system);

  const frcsInputs: FrcsInputs = {
    system: system,
    isPartialCut: cluster.treatmentid === 1 ? false : true, // partial cut = false only on clear cut
    deliverToLandingDistance:
      system === 'Helicopter Manual WT' || system === 'Helicopter CTL'
        ? cluster.mean_yarding // if system is helicopter, use calculated mean_yarding
        : // otherwise convert straight line distance to distance along a slope // divide by 100 since slope is in %
          cluster.mean_yarding * Math.sqrt(1 + Math.pow(cluster.slope / 100, 2)),
    slope: !!cluster.slope ? cluster.slope : 0,
    elevation: !!cluster.center_elevation ? cluster.center_elevation : 0,
    includeLoadingCosts: true, // always true
    includeMoveInCosts: false, // always false, we calculate separately in getMoveInCosts function
    moveInDistance: 0,
    area: cluster.area,
    includeCostsCollectChipResidues: true, // always true
    woodDensityCT: !volumeCT || !boleWeightCT ? 0 : boleWeightCT / volumeCT,
    woodDensitySLT: !volumeSLT || !boleWeightSLT ? 0 : boleWeightSLT / volumeSLT,
    woodDensityLLT: !volumeLLT || !boleWeightLLT ? 0 : boleWeightLLT / volumeLLT,
    residueFractionCT: !residueFractionCT ? 0 : residueFractionCT,
    residueFractionSLT: !residueFractionSLT ? 0 : residueFractionSLT,
    residueFractionLLT: !residueFractionLLT ? 0 : residueFractionLLT,
    hardwoodFractionCT: 0.2, // constant
    hardwoodFractionSLT: 0, // constant
    hardwoodFractionLLT: 0, // constant
    treesPerAcreCT: removalsCT,
    treesPerAcreSLT: removalsSLT,
    treesPerAcreLLT: removalsLLT,
    volumeCT: !volumeCT || !removalsCT ? 0 : volumeCT / removalsCT,
    volumeSLT: !volumeSLT || !removalsSLT ? 0 : volumeSLT / removalsSLT,
    volumeLLT: !volumeLLT || !removalsLLT ? 0 : volumeLLT / removalsLLT,
    dieselFuelPrice: dieselFuelPrice,
    moistureContent: moistureContent,
    isBiomassSalvage: cluster.treatmentid === 10 ? true : false, // true if treatment is biomass Salvage
    wageFaller: wageFaller,
    wageOther: wageOther,
    laborBenefits: laborBenefits,
    ppiCurrent: ppiCurrent,
    residueRecovFracWT: residueRecovFracWT,
    residueRecovFracCTL: residueRecovFracCTL,
  };
  return frcsInputs;
};

export const getFrcsInputsTest = (
  cluster: TreatedCluster,
  system: string,
  distance: number,
  dieselFuelPrice: number,
  moistureContent: number,
  wageFaller: number,
  wageOther: number,
  laborBenefits: number,
  ppiCurrent: number,
  residueRecovFracWT: number,
  residueRecovFracCTL: number
) => {
  const fixedClusterUnits = cluster;
  const boleWeightCT =
    calcBoleWeightCT(fixedClusterUnits) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  // residue here only refers to the residue defined in FRCS - tops and limbs of log trees
  const residueWeightCT =
    calcResidueWeightCT(fixedClusterUnits) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueFractionCT = residueWeightCT / boleWeightCT;
  const volumeCT = calcVolumeCT(fixedClusterUnits);
  const removalsCT = calcRemovalsCT(fixedClusterUnits);

  const boleWeightSLT =
    calcBoleWeightSLT(fixedClusterUnits) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueWeightSLT =
    calcResidueWeightSLT(fixedClusterUnits) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueFractionSLT = residueWeightSLT / boleWeightSLT;
  const volumeSLT = calcVolumeSLT(fixedClusterUnits);
  const removalsSLT = calcRemovalsSLT(fixedClusterUnits);

  const boleWeightLLT =
    calcBoleWeightLLT(fixedClusterUnits) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueWeightLLT =
    calcResidueWeightLLT(fixedClusterUnits) / // dry short tons
    (1 - moistureContent / 100); // convert to green short tons
  const residueFractionLLT = residueWeightLLT / boleWeightLLT;
  const volumeLLT = calcVolumeLLT(fixedClusterUnits, system);
  const removalsLLT = calcRemovalsLLT(fixedClusterUnits, system);

  const frcsInputs: FrcsInputs = {
    system: system,
    isPartialCut: fixedClusterUnits.treatmentid === 1 ? false : true, // partial cut = false only on clear cut
    deliverToLandingDistance:
      system === 'Helicopter Manual WT' || system === 'Helicopter CTL'
        ? fixedClusterUnits.mean_yarding // if system is helicopter, use calculated mean_yarding
        : fixedClusterUnits.mean_yarding * // otherwise convert straight line distance to distance along a slope
          Math.sqrt(1 + Math.pow(fixedClusterUnits.slope / 100, 2)), // divide by 100 since slope is in %
    slope: !!fixedClusterUnits.slope ? fixedClusterUnits.slope : 0,
    elevation: !!fixedClusterUnits.center_elevation ? fixedClusterUnits.center_elevation : 0,
    includeLoadingCosts: true, // always true
    includeMoveInCosts: false, // always false, we calculate separately in getMoveInCosts function
    moveInDistance: 0,
    area: fixedClusterUnits.area,
    includeCostsCollectChipResidues: true, // always true
    woodDensityCT: !volumeCT || !boleWeightCT ? 0 : boleWeightCT / volumeCT,
    woodDensitySLT: !volumeSLT || !boleWeightSLT ? 0 : boleWeightSLT / volumeSLT,
    woodDensityLLT: !volumeLLT || !boleWeightLLT ? 0 : boleWeightLLT / volumeLLT,
    residueFractionCT: !residueFractionCT ? 0 : residueFractionCT,
    residueFractionSLT: !residueFractionSLT ? 0 : residueFractionSLT,
    residueFractionLLT: !residueFractionLLT ? 0 : residueFractionLLT,
    hardwoodFractionCT: 0.2, // constant
    hardwoodFractionSLT: 0, // constant
    hardwoodFractionLLT: 0, // constant
    treesPerAcreCT: removalsCT,
    treesPerAcreSLT: removalsSLT,
    treesPerAcreLLT: removalsLLT,
    volumeCT: !volumeCT || !removalsCT ? 0 : volumeCT / removalsCT,
    volumeSLT: !volumeSLT || !removalsSLT ? 0 : volumeSLT / removalsSLT,
    volumeLLT: !volumeLLT || !removalsLLT ? 0 : volumeLLT / removalsLLT,
    dieselFuelPrice: dieselFuelPrice,
    moistureContent: moistureContent,
    isBiomassSalvage: fixedClusterUnits.treatmentid === 10 ? true : false, // true if treatment is biomass salvage
    wageFaller: wageFaller,
    wageOther: wageOther,
    laborBenefits: laborBenefits,
    ppiCurrent: ppiCurrent,
    residueRecovFracWT: residueRecovFracWT,
    residueRecovFracCTL: residueRecovFracCTL,
  };
  return {
    frcsInputs,
    boleWeightCT,
    residueWeightCT,
    residueFractionCT,
    volumeCT,
    removalsCT,
    boleWeightSLT,
    residueWeightSLT,
    residueFractionSLT,
    volumeSLT,
    removalsSLT,
    boleWeightLLT,
    residueWeightLLT,
    residueFractionLLT,
    volumeLLT,
    removalsLLT,
  };
};

// https://ucdavis.app.box.com/file/566320916282
const calcBoleWeightCT = (cluster: TreatedCluster) => {
  return 2000 * (cluster.bmstm_2 + cluster.bmstm_7 + cluster.dbmsm_2 + cluster.dbmsm_7);
};

const calcResidueWeightCT = (cluster: TreatedCluster) => {
  return 2000 * (cluster.bmcwn_2 + cluster.bmcwn_7 + cluster.dbmcn_2 + cluster.dbmcn_7);
};

const calcVolumeCT = (cluster: TreatedCluster) => {
  // vol variables are in cubic feet / acre
  return cluster.vol_2 + cluster.vol_7 + cluster.vmsg_2 + cluster.vmsg_7;
  // return calculateVolume(cluster, 2) + calculateVolume(cluster, 7);
};

const calcRemovalsCT = (cluster: TreatedCluster) => {
  // tpa and sng variables are in trees / acre
  return cluster.tpa_2 + cluster.tpa_7 + cluster.sng_2 + cluster.sng_7;
};

const calcTotalRemovalsCT = (cluster: TreatedCluster) => {
  return PIXEL_AREA_TO_ACRES * (cluster.tpa_2 + cluster.tpa_7 + cluster.sng_2 + cluster.sng_7);
};

const calcBoleWeightSLT = (cluster: TreatedCluster) => {
  return (
    2000 * (cluster.bmstm_15 + cluster.dbmsm_15) // U.S. tons
  );
};

const calcResidueWeightSLT = (cluster: TreatedCluster) => {
  return 2000 * (cluster.bmcwn_15 + cluster.dbmcn_15);
};

const calcVolumeSLT = (cluster: TreatedCluster) => {
  return cluster.vol_15 + cluster.vmsg_15;
  // return calculateVolume(cluster, 15);
};

const calcRemovalsSLT = (cluster: TreatedCluster) => {
  return cluster.tpa_15 + cluster.sng_15;
};

const calcTotalRemovalsSLT = (cluster: TreatedCluster) => {
  return PIXEL_AREA_TO_ACRES * (cluster.tpa_15 + cluster.sng_15);
};

const calcBoleWeightLLT = (cluster: TreatedCluster) => {
  return (
    2000 *
    (cluster.bmstm_25 +
      cluster.dbmsm_25 +
      cluster.bmstm_35 +
      cluster.dbmsm_35 +
      cluster.bmstm_40 +
      cluster.dbmsm_40) // U.S. tons
  );
};

const calcResidueWeightLLT = (cluster: TreatedCluster) => {
  return (
    2000 *
    (cluster.bmcwn_25 +
      cluster.bmcwn_35 +
      cluster.bmcwn_40 +
      cluster.dbmcn_25 +
      cluster.dbmcn_35 +
      cluster.dbmcn_40)
  );
};

const calcVolumeLLT = (cluster: TreatedCluster, system: string) => {
  return (
    cluster.vol_25 +
    cluster.vol_35 +
    cluster.vol_40 +
    cluster.vmsg_25 +
    cluster.vmsg_35 +
    cluster.vmsg_40
  );
  // return calculateVolume(cluster, 25);
};

const calcRemovalsLLT = (cluster: TreatedCluster, system: string) => {
  return (
    cluster.tpa_25 +
    cluster.sng_25 +
    cluster.tpa_35 +
    cluster.sng_35 +
    cluster.tpa_40 +
    cluster.sng_40
  );
};

const calcTotalRemovalsLLT = (cluster: TreatedCluster) => {
  return (
    PIXEL_AREA_TO_ACRES *
    (cluster.tpa_25 +
      cluster.sng_25 +
      cluster.tpa_35 +
      cluster.sng_35 +
      cluster.tpa_40 +
      cluster.sng_40)
  );
};

const calculateVolume = (cluster: TreatedCluster, i: number) => {
  let vol = 0;
  let avgDBH = 0;
  switch (i) {
    // for dbh < 5, use equation from here: https://ucdavis.app.box.com/file/602500273957
    case 2:
      avgDBH = 3;
      vol = cluster.tpa_2 * PIXEL_AREA_TO_ACRES * (avgDBH * 1.7925);
      break;
    // otherwise use this equation https://ucdavis.app.box.com/file/566320916282
    case 7:
      avgDBH = 7.5;
      // trees/acre in cluster * pixel area * cubic feet per tree
      vol = cluster.tpa_7 * PIXEL_AREA_TO_ACRES * (avgDBH * avgDBH * 0.216 - 3.675);
      break;
    case 15:
      avgDBH = 15;
      // trees/acre in cluster * pixel area * cubic feet per tree
      vol = cluster.tpa_15 * PIXEL_AREA_TO_ACRES * (avgDBH * avgDBH * 0.216 - 3.675);
      break;
    case 25:
      avgDBH = 25;
      // trees/acre in cluster * pixel area * cubic feet per tree
      vol = cluster.tpa_25 * PIXEL_AREA_TO_ACRES * (avgDBH * avgDBH * 0.216 - 3.675);
      break;
  }
  return vol;
};

// TODO: remove this when we are storing correct short tons / acre in db
export const PIXELS_TO_ACRES = 30 * 30 * 0.00024711; // ~0.22 acres, area of one pixel
export const fixClusterUnits = (pixelSummation: TreatedCluster, numberOfPixels: number) => {
  const pixelSum: TreatedCluster = {
    ...pixelSummation,
    bmcwn_2: pixelSummation.bmcwn_2 / PIXELS_TO_ACRES / numberOfPixels,
    bmcwn_7: pixelSummation.bmcwn_7 / PIXELS_TO_ACRES / numberOfPixels,
    bmcwn_15: pixelSummation.bmcwn_15 / PIXELS_TO_ACRES / numberOfPixels,
    bmcwn_25: pixelSummation.bmcwn_25 / PIXELS_TO_ACRES / numberOfPixels,
    bmcwn_35: pixelSummation.bmcwn_35 / PIXELS_TO_ACRES / numberOfPixels,
    bmcwn_40: pixelSummation.bmcwn_40 / PIXELS_TO_ACRES / numberOfPixels,

    bmfol_2: pixelSummation.bmfol_2 / PIXELS_TO_ACRES / numberOfPixels,
    bmfol_7: pixelSummation.bmfol_7 / PIXELS_TO_ACRES / numberOfPixels,
    bmfol_15: pixelSummation.bmfol_15 / PIXELS_TO_ACRES / numberOfPixels,
    bmfol_25: pixelSummation.bmfol_25 / PIXELS_TO_ACRES / numberOfPixels,
    bmfol_35: pixelSummation.bmfol_35 / PIXELS_TO_ACRES / numberOfPixels,
    bmfol_40: pixelSummation.bmfol_40 / PIXELS_TO_ACRES / numberOfPixels,

    bmstm_2: pixelSummation.bmstm_2 / PIXELS_TO_ACRES / numberOfPixels,
    bmstm_7: pixelSummation.bmstm_7 / PIXELS_TO_ACRES / numberOfPixels,
    bmstm_15: pixelSummation.bmstm_15 / PIXELS_TO_ACRES / numberOfPixels,
    bmstm_25: pixelSummation.bmstm_25 / PIXELS_TO_ACRES / numberOfPixels,
    bmstm_35: pixelSummation.bmstm_35 / PIXELS_TO_ACRES / numberOfPixels,
    bmstm_40: pixelSummation.bmstm_40 / PIXELS_TO_ACRES / numberOfPixels,

    // dead biomass
    dbmsm_2: pixelSummation.dbmsm_2 / PIXELS_TO_ACRES / numberOfPixels,
    dbmsm_7: pixelSummation.dbmsm_7 / PIXELS_TO_ACRES / numberOfPixels,
    dbmsm_15: pixelSummation.dbmsm_15 / PIXELS_TO_ACRES / numberOfPixels,
    dbmsm_25: pixelSummation.dbmsm_25 / PIXELS_TO_ACRES / numberOfPixels,
    dbmsm_35: pixelSummation.dbmsm_35 / PIXELS_TO_ACRES / numberOfPixels,
    dbmsm_40: pixelSummation.dbmsm_40 / PIXELS_TO_ACRES / numberOfPixels,

    dbmcn_2: pixelSummation.dbmcn_2 / PIXELS_TO_ACRES / numberOfPixels,
    dbmcn_7: pixelSummation.dbmcn_7 / PIXELS_TO_ACRES / numberOfPixels,
    dbmcn_15: pixelSummation.dbmcn_15 / PIXELS_TO_ACRES / numberOfPixels,
    dbmcn_25: pixelSummation.dbmcn_25 / PIXELS_TO_ACRES / numberOfPixels,
    dbmcn_35: pixelSummation.dbmcn_35 / PIXELS_TO_ACRES / numberOfPixels,
    dbmcn_40: pixelSummation.dbmcn_40 / PIXELS_TO_ACRES / numberOfPixels,
  };
  return pixelSum;
};
