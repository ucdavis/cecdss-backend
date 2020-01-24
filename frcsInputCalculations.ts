import { InputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { TreatedCluster } from './models/treatedcluster';

export const metersToAcresConstant = 0.000247105;
export const pixelAreaInAcres = 30 * 30 * metersToAcresConstant;

// these equations come from this sheet:
// https://ucdavis.app.box.com/file/566320916282

export const getFrcsInputs = (cluster: TreatedCluster) => {
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
    System: 'Ground-Based Mech WT',
    PartialCut: true,
    DeliverDist: cluster.total_yarding,
    Slope: cluster.slope,
    Elevation: cluster.center_elevation,
    CalcLoad: true,
    CalcMoveIn: true,
    Area: cluster.area,
    MoveInDist: 2,
    CalcResidues: true,
    UserSpecWDCT: weightCT / volumeCT,
    UserSpecWDSLT: weightSLT / volumeSLT,
    UserSpecWDLLT: weightLLT / volumeLLT,
    UserSpecRFCT: 0,
    UserSpecRFSLT: 0.25,
    UserSpecRFLLT: 0.38,
    UserSpecHFCT: 0.2,
    UserSpecHFSLT: 0,
    UserSpecHFLLT: 0,
    RemovalsCT: removalsCT,
    RemovalsSLT: removalsSLT,
    RemovalsLLT: removalsLLT,
    TreeVolCT: volumeCT / totalRemovalsCT,
    TreeVolSLT: volumeSLT / totalRemovalsSLT,
    TreeVolLLT: volumeLLT / totalRemovalsLLT,
    DieselFuelPrice: 3.882
  };
  return frcsInputs;
};

const calcWeightCT = (cluster: TreatedCluster) => {
  return (
    2000 *
    (cluster.bmfol_0 + // U.S. tons
      cluster.bmfol_2 +
      cluster.bmfol_7 +
      cluster.bmcwn_0 +
      cluster.bmcwn_2 +
      cluster.bmcwn_7 +
      cluster.bmstm_0 +
      cluster.bmstm_2 +
      cluster.bmstm_7)
  ); // TODO: add dbmcn and dbmsm
};

const calcVolumeCT = (cluster: TreatedCluster) => {
  return calculateVolume(cluster, 0) + calculateVolume(cluster, 2) + calculateVolume(cluster, 7);
};

const calcRemovalsCT = (cluster: TreatedCluster) => {
  return (cluster.tpa_0 + cluster.tpa_2 + cluster.tpa_7) / (cluster.area / pixelAreaInAcres); // TODO: add snags
};

const calcTotalRemovalsCT = (cluster: TreatedCluster) => {
  return pixelAreaInAcres * (cluster.tpa_0 + cluster.tpa_2 + cluster.tpa_7); // TODO: add snags
};

const calcWeightSLT = (cluster: TreatedCluster) => {
  return (
    2000 *
    (cluster.bmfol_15 + // U.S. tons
      cluster.bmcwn_15 +
      cluster.bmstm_15)
  ); // TODO: add dbmcn and dbmsm
};

const calcVolumeSLT = (cluster: TreatedCluster) => {
  return calculateVolume(cluster, 15);
};

const calcRemovalsSLT = (cluster: TreatedCluster) => {
  return cluster.tpa_15 / (cluster.area / pixelAreaInAcres); // TODO: add snags
};

const calcTotalRemovalsSLT = (cluster: TreatedCluster) => {
  return pixelAreaInAcres * cluster.tpa_15; // TODO: add snags
};

const calcWeightLLT = (cluster: TreatedCluster) => {
  return (
    2000 *
    (cluster.bmfol_25 + // U.S. tons
      cluster.bmcwn_25 +
      cluster.bmstm_25)
  ); // TODO: add dbmcn and dbmsm
};

const calcVolumeLLT = (cluster: TreatedCluster) => {
  return calculateVolume(cluster, 25);
};

const calcRemovalsLLT = (cluster: TreatedCluster) => {
  return cluster.tpa_25 / (cluster.area / pixelAreaInAcres); // TODO: add snags
};

const calcTotalRemovalsLLT = (cluster: TreatedCluster) => {
  return pixelAreaInAcres * cluster.tpa_25; // TODO: add snags
};

const calculateVolume = (cluster: TreatedCluster, i: number) => {
  let vol = 0;
  let avgDBH = 0;
  switch (i) {
    // for dbh < 5, use equation from here: https://ucdavis.app.box.com/file/602500273957
    case 0:
      avgDBH = 0.5;
      vol = cluster.tpa_0 * pixelAreaInAcres * (avgDBH * 1.7925);
      break;
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
