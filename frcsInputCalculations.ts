import { InputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { TreatedCluster } from './models/treatedcluster';

export const metersToAcresConstant = 0.000247105;
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
  const weightCT = calcWeightCT(cluster);
  const volumeCT = calcVolumeCT(cluster);
  const removalsCT = calcRemovalsCT(cluster);
  const totalRemovalsCT = calcTotalRemovalsCT(cluster);

  const weightSLT = calcWeightSLT(cluster);
  const volumeSLT = calcVolumeSLT(cluster);
  const removalsSLT = calcRemovalsSLT(cluster);
  const totalRemovalsSLT = calcTotalRemovalsSLT(cluster);

  const weightLLT = calcWeightLLT(cluster);
  const volumeLLT = calcVolumeLLT(cluster);
  const removalsLLT = calcRemovalsLLT(cluster);
  const totalRemovalsLLT = calcTotalRemovalsLLT(cluster);

  const frcsInputs: InputVarMod = {
    System: system,
    PartialCut: cluster.treatmentid === 1 ? false : true, // partial cut = false only on clear cut
    DeliverDist: cluster.mean_yarding,
    Slope: !cluster.slope ? 0 : cluster.slope,
    Elevation: !cluster.center_elevation ? 0 : cluster.center_elevation,
    CalcLoad: true, // always true
    CalcMoveIn: true, // always true
    Area: cluster.area,
    // TODO: algorithm to calculate this
    MoveInDist: distance,
    CalcResidues: true, // always true
    UserSpecWDCT: !volumeCT ? 0 : weightCT / volumeCT,
    UserSpecWDSLT: !volumeSLT ? 0 : weightSLT / volumeSLT,
    UserSpecWDLLT: !volumeLLT ? 0 : weightLLT / volumeLLT,
    UserSpecRFCT: 0,
    UserSpecRFSLT: 0.25,
    UserSpecRFLLT: 0.38,
    UserSpecHFCT: 0.2,
    UserSpecHFSLT: 0,
    UserSpecHFLLT: 0,
    RemovalsCT: removalsCT,
    RemovalsSLT: removalsSLT,
    RemovalsLLT: removalsLLT,
    TreeVolCT: !volumeCT ? 0 : volumeCT / totalRemovalsCT,
    TreeVolSLT: !volumeSLT ? 0 : volumeSLT / totalRemovalsSLT,
    TreeVolLLT: !volumeLLT ? 0 : volumeLLT / totalRemovalsLLT,
    DieselFuelPrice: dieselFuelPrice,
    MoistureContent: moistureContent,
    ChipAll: cluster.treatmentid === 4 ? true : false // true if treatment is timberSalvage
  };
  if (frcsInputs.TreeVolSLT > 80) {
    throw new Error(`TreeVolSLT: ${frcsInputs.TreeVolSLT}`);
  }
  return frcsInputs;
};

// https://ucdavis.app.box.com/file/566320916282
const calcWeightCT = (cluster: TreatedCluster) => {
  return (
    2000 *
    (cluster.bmfol_2 +
      cluster.bmfol_7 +
      cluster.bmcwn_2 +
      cluster.bmcwn_7 +
      cluster.bmstm_2 +
      cluster.bmstm_7 +
      cluster.dbmcn_2 +
      cluster.dbmcn_7 +
      cluster.dbmsm_2 +
      cluster.dbmsm_7)
  );
};

const calcVolumeCT = (cluster: TreatedCluster) => {
  return cluster.vol_2 + cluster.vol_7;
};

const calcRemovalsCT = (cluster: TreatedCluster) => {
  return (
    (cluster.tpa_2 + cluster.tpa_7 + cluster.sng_2 + cluster.sng_7) /
    (cluster.area / pixelAreaInAcres)
  );
};

const calcTotalRemovalsCT = (cluster: TreatedCluster) => {
  return pixelAreaInAcres * (cluster.tpa_2 + cluster.tpa_7 + cluster.sng_2 + cluster.sng_7);
};

const calcWeightSLT = (cluster: TreatedCluster) => {
  return (
    2000 *
    (cluster.bmfol_15 + // U.S. tons
      cluster.bmcwn_15 +
      cluster.bmstm_15 +
      cluster.dbmcn_15 +
      cluster.dbmsm_15)
  );
};

const calcVolumeSLT = (cluster: TreatedCluster) => {
  return cluster.vol_15;
};

const calcRemovalsSLT = (cluster: TreatedCluster) => {
  return (cluster.tpa_15 + cluster.sng_15) / (cluster.area / pixelAreaInAcres);
};

const calcTotalRemovalsSLT = (cluster: TreatedCluster) => {
  return pixelAreaInAcres * (cluster.tpa_15 + cluster.sng_15);
};

const calcWeightLLT = (cluster: TreatedCluster) => {
  return (
    2000 *
    (cluster.bmfol_25 + // U.S. tons
      cluster.bmcwn_25 +
      cluster.bmstm_25 +
      cluster.dbmcn_25 +
      cluster.dbmsm_25 +
      cluster.bmfol_35 +
      cluster.bmcwn_35 +
      cluster.bmstm_35 +
      cluster.dbmcn_35 +
      cluster.dbmsm_35 +
      cluster.bmfol_40 +
      cluster.bmcwn_40 +
      cluster.bmstm_40 +
      cluster.dbmcn_40 +
      cluster.dbmsm_40)
  );
};

const calcVolumeLLT = (cluster: TreatedCluster) => {
  return cluster.vol_25 + cluster.vol_35 + cluster.vol_40;
};

const calcRemovalsLLT = (cluster: TreatedCluster) => {
  return (
    (cluster.tpa_25 +
      cluster.sng_25 +
      cluster.tpa_35 +
      cluster.sng_35 +
      cluster.tpa_40 +
      cluster.sng_40) /
    (cluster.area / pixelAreaInAcres)
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
