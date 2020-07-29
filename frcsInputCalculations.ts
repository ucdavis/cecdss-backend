import { InputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { TreatedCluster } from './models/treatedcluster';

export const metersToAcresConstant = 0.00024711;
export const pixelAreaInAcres = 30 * 30 * metersToAcresConstant;

// these equations come from this sheet:
// https://ucdavis.app.box.com/file/566320916282

export const getFrcsInputs = (
  cluster: TreatedCluster,
  system: string,
  distance: number,
  dieselFuelPrice: number,
  moistureContent: number
) => {
  cluster = fixClusterUnits(cluster, cluster.area / pixelAreaInAcres);
  const boleWeightCT = calcBoleWeightCT(cluster);
  // residue here only refers to the residue defined in FRCS - tops and limbs of log trees
  const residueWeightCT = calcResidueWeightCT(cluster);
  const residueFractionCT = residueWeightCT / boleWeightCT;
  const volumeCT = calcVolumeCT(cluster);
  const removalsCT = calcRemovalsCT(cluster);
  const totalRemovalsCT = calcTotalRemovalsCT(cluster);

  const boleWeightSLT = calcBoleWeightSLT(cluster);
  const residueWeightSLT = calcResidueWeightSLT(cluster);
  const residueFractionSLT = residueWeightSLT / boleWeightSLT;
  const volumeSLT = calcVolumeSLT(cluster);
  const removalsSLT = calcRemovalsSLT(cluster);
  const totalRemovalsSLT = calcTotalRemovalsSLT(cluster);

  const boleWeightLLT = calcBoleWeightLLT(cluster);
  const residueWeightLLT = calcResidueWeightLLT(cluster);
  const residueFractionLLT = residueWeightLLT / boleWeightLLT;
  const volumeLLT = calcVolumeLLT(cluster);
  const removalsLLT = calcRemovalsLLT(cluster);
  const totalRemovalsLLT = calcTotalRemovalsLLT(cluster);

  const frcsInputs: InputVarMod = {
    System: system,
    PartialCut: cluster.treatmentid === 1 ? false : true, // partial cut = false only on clear cut
    DeliverDist: cluster.mean_yarding,
    Slope: !!cluster.slope ? cluster.slope : 0,
    Elevation: !!cluster.center_elevation ? cluster.center_elevation : 0,
    CalcLoad: true, // always true
    CalcMoveIn: true, // always true
    Area: cluster.area,
    // TODO: algorithm to calculate this
    MoveInDist: distance,
    CalcResidues: true, // always true
    UserSpecWDCT: !volumeCT ? 0 : boleWeightCT / volumeCT,
    UserSpecWDSLT: !volumeSLT ? 0 : boleWeightSLT / volumeSLT,
    UserSpecWDLLT: !volumeLLT ? 0 : boleWeightLLT / volumeLLT,
    UserSpecRFCT: residueFractionCT,
    UserSpecRFSLT: residueFractionSLT,
    UserSpecRFLLT: residueFractionLLT,
    UserSpecHFCT: 0.2, // constant
    UserSpecHFSLT: 0, // constant
    UserSpecHFLLT: 0, // constant
    RemovalsCT: removalsCT,
    RemovalsSLT: removalsSLT,
    RemovalsLLT: removalsLLT,
    TreeVolCT: !volumeCT ? 0 : volumeCT / removalsCT,
    TreeVolSLT: !volumeSLT ? 0 : volumeSLT / removalsSLT,
    TreeVolLLT: !volumeLLT ? 0 : volumeLLT / removalsLLT,
    DieselFuelPrice: dieselFuelPrice,
    MoistureContent: moistureContent,
    ChipAll: cluster.treatmentid === 4 ? true : false // true if treatment is timberSalvage
  };
  return frcsInputs;
};

export const getFrcsInputsTest = (
  cluster: TreatedCluster,
  system: string,
  distance: number,
  dieselFuelPrice: number,
  moistureContent: number
) => {
  const fixedClusterUnits = fixClusterUnits(cluster, cluster.area / pixelAreaInAcres);
  const boleWeightCT = calcBoleWeightCT(fixedClusterUnits) / (1 - moistureContent / 100); // green short tons
  // residue here only refers to the residue defined in FRCS - tops and limbs of log trees
  const residueWeightCT = calcResidueWeightCT(fixedClusterUnits) / (1 - moistureContent / 100);
  const residueFractionCT = residueWeightCT / boleWeightCT;
  const volumeCT = calcVolumeCT(fixedClusterUnits);
  const removalsCT = calcRemovalsCT(fixedClusterUnits);

  const boleWeightSLT = calcBoleWeightSLT(fixedClusterUnits) / (1 - moistureContent / 100); // green short tons
  const residueWeightSLT = calcResidueWeightSLT(fixedClusterUnits) / (1 - moistureContent / 100);
  const residueFractionSLT = residueWeightSLT / boleWeightSLT;
  const volumeSLT = calcVolumeSLT(fixedClusterUnits);
  const removalsSLT = calcRemovalsSLT(fixedClusterUnits);

  const boleWeightLLT = calcBoleWeightLLT(fixedClusterUnits) / (1 - moistureContent / 100); // green short tons
  const residueWeightLLT = calcResidueWeightLLT(fixedClusterUnits) / (1 - moistureContent / 100);
  const residueFractionLLT = residueWeightLLT / boleWeightLLT;
  const volumeLLT = calcVolumeLLT(fixedClusterUnits);
  const removalsLLT = calcRemovalsLLT(fixedClusterUnits);

  const frcsInputs: InputVarMod = {
    System: system,
    PartialCut: fixedClusterUnits.treatmentid === 1 ? false : true, // partial cut = false only on clear cut
    DeliverDist: fixedClusterUnits.mean_yarding,
    Slope: !!fixedClusterUnits.slope ? fixedClusterUnits.slope : 0,
    Elevation: !!fixedClusterUnits.center_elevation ? fixedClusterUnits.center_elevation : 0,
    CalcLoad: true, // always true
    CalcMoveIn: true, // always true
    Area: fixedClusterUnits.area,
    // TODO: algorithm to calculate this
    MoveInDist: distance,
    CalcResidues: true, // always true
    UserSpecWDCT: !volumeCT ? 0 : boleWeightCT / volumeCT,
    UserSpecWDSLT: !volumeSLT ? 0 : boleWeightSLT / volumeSLT,
    UserSpecWDLLT: !volumeLLT ? 0 : boleWeightLLT / volumeLLT,
    UserSpecRFCT: residueFractionCT,
    UserSpecRFSLT: residueFractionSLT,
    UserSpecRFLLT: residueFractionLLT,
    UserSpecHFCT: 0.2, // constant
    UserSpecHFSLT: 0, // constant
    UserSpecHFLLT: 0, // constant
    RemovalsCT: removalsCT,
    RemovalsSLT: removalsSLT,
    RemovalsLLT: removalsLLT,
    TreeVolCT: !volumeCT ? 0 : volumeCT / removalsCT,
    TreeVolSLT: !volumeSLT ? 0 : volumeSLT / removalsSLT,
    TreeVolLLT: !volumeLLT ? 0 : volumeLLT / removalsLLT,
    DieselFuelPrice: dieselFuelPrice,
    MoistureContent: moistureContent,
    ChipAll: fixedClusterUnits.treatmentid === 4 ? true : false // true if treatment is timberSalvage
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
    removalsLLT
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
  return pixelAreaInAcres * (cluster.tpa_2 + cluster.tpa_7 + cluster.sng_2 + cluster.sng_7);
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
  return pixelAreaInAcres * (cluster.tpa_15 + cluster.sng_15);
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

const calcVolumeLLT = (cluster: TreatedCluster) => {
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

const calcRemovalsLLT = (cluster: TreatedCluster) => {
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
    pixelAreaInAcres *
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
      vol = cluster.tpa_2 * pixelAreaInAcres * (avgDBH * 1.7925);
      break;
    // otherwise use this equation https://ucdavis.app.box.com/file/566320916282
    case 7:
      avgDBH = 7.5;
      // trees/acre in cluster * pixel area * cubic feet per tree
      vol = cluster.tpa_7 * pixelAreaInAcres * (avgDBH * avgDBH * 0.216 - 3.675);
      break;
    case 15:
      avgDBH = 15;
      // trees/acre in cluster * pixel area * cubic feet per tree
      vol = cluster.tpa_15 * pixelAreaInAcres * (avgDBH * avgDBH * 0.216 - 3.675);
      break;
    case 25:
      avgDBH = 25;
      // trees/acre in cluster * pixel area * cubic feet per tree
      vol = cluster.tpa_25 * pixelAreaInAcres * (avgDBH * avgDBH * 0.216 - 3.675);
      break;
  }
  return vol;
};

// TODO: remove this when we are storing correct short tons / acre in db
export const pixelsToAcreConstant = 30 * 30 * 0.00024711; // ~0.22 acres, area of one pixel
export const fixClusterUnits = (pixelSummation: TreatedCluster, numberOfPixels: number) => {
  const pixelSum: TreatedCluster = {
    ...pixelSummation,
    bmcwn_2: pixelSummation.bmcwn_2 / pixelsToAcreConstant / numberOfPixels,
    bmcwn_7: pixelSummation.bmcwn_7 / pixelsToAcreConstant / numberOfPixels,
    bmcwn_15: pixelSummation.bmcwn_15 / pixelsToAcreConstant / numberOfPixels,
    bmcwn_25: pixelSummation.bmcwn_25 / pixelsToAcreConstant / numberOfPixels,
    bmcwn_35: pixelSummation.bmcwn_35 / pixelsToAcreConstant / numberOfPixels,
    bmcwn_40: pixelSummation.bmcwn_40 / pixelsToAcreConstant / numberOfPixels,

    bmfol_2: pixelSummation.bmfol_2 / pixelsToAcreConstant / numberOfPixels,
    bmfol_7: pixelSummation.bmfol_7 / pixelsToAcreConstant / numberOfPixels,
    bmfol_15: pixelSummation.bmfol_15 / pixelsToAcreConstant / numberOfPixels,
    bmfol_25: pixelSummation.bmfol_25 / pixelsToAcreConstant / numberOfPixels,
    bmfol_35: pixelSummation.bmfol_35 / pixelsToAcreConstant / numberOfPixels,
    bmfol_40: pixelSummation.bmfol_40 / pixelsToAcreConstant / numberOfPixels,

    bmstm_2: pixelSummation.bmstm_2 / pixelsToAcreConstant / numberOfPixels,
    bmstm_7: pixelSummation.bmstm_7 / pixelsToAcreConstant / numberOfPixels,
    bmstm_15: pixelSummation.bmstm_15 / pixelsToAcreConstant / numberOfPixels,
    bmstm_25: pixelSummation.bmstm_25 / pixelsToAcreConstant / numberOfPixels,
    bmstm_35: pixelSummation.bmstm_35 / pixelsToAcreConstant / numberOfPixels,
    bmstm_40: pixelSummation.bmstm_40 / pixelsToAcreConstant / numberOfPixels,

    // dead biomass
    dbmsm_2: pixelSummation.dbmsm_2 / pixelsToAcreConstant / numberOfPixels,
    dbmsm_7: pixelSummation.dbmsm_7 / pixelsToAcreConstant / numberOfPixels,
    dbmsm_15: pixelSummation.dbmsm_15 / pixelsToAcreConstant / numberOfPixels,
    dbmsm_25: pixelSummation.dbmsm_25 / pixelsToAcreConstant / numberOfPixels,
    dbmsm_35: pixelSummation.dbmsm_35 / pixelsToAcreConstant / numberOfPixels,
    dbmsm_40: pixelSummation.dbmsm_40 / pixelsToAcreConstant / numberOfPixels,

    dbmcn_2: pixelSummation.dbmcn_2 / pixelsToAcreConstant / numberOfPixels,
    dbmcn_7: pixelSummation.dbmcn_7 / pixelsToAcreConstant / numberOfPixels,
    dbmcn_15: pixelSummation.dbmcn_15 / pixelsToAcreConstant / numberOfPixels,
    dbmcn_25: pixelSummation.dbmcn_25 / pixelsToAcreConstant / numberOfPixels,
    dbmcn_35: pixelSummation.dbmcn_35 / pixelsToAcreConstant / numberOfPixels,
    dbmcn_40: pixelSummation.dbmcn_40 / pixelsToAcreConstant / numberOfPixels
  };
  return pixelSum;
};
