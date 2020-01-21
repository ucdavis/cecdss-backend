import { runFrcs } from '@ucdavis/frcs';
import { InputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import {
  calcRemovalsCT,
  calcRemovalsLLT,
  calcRemovalsSLT,
  calcTreeVolCT,
  calcTreeVolLLT,
  calcTreeVolSLT
} from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';
const metersToAcresConstant = 0.00024711;

const pixelAreaInAcres = 30 * 30 * metersToAcresConstant;
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
  }
  return vol;
};

export const runFrcsOnClusters = async (clusters: TreatedCluster[]) => {};

export const runFrcsOnCluster = async (cluster: TreatedCluster) => {
  // cluster.tpa_x is # of trees per acre in cluster
  // multiply by pixel area to get total # of trees in cluster
  // divide by total area to get total # of trees per acre in cluster
  cluster = {
    ...cluster,
    tpa_0: (cluster.tpa_0 * pixelAreaInAcres) / cluster.area,
    tpa_2: (cluster.tpa_2 * pixelAreaInAcres) / cluster.area,
    tpa_7: (cluster.tpa_7 * pixelAreaInAcres) / cluster.area,
    tpa_15: (cluster.tpa_15 * pixelAreaInAcres) / cluster.area,
    tpa_25: (cluster.tpa_25 * pixelAreaInAcres) / cluster.area,
    tpa_35: (cluster.tpa_35 * pixelAreaInAcres) / cluster.area,
    tpa_40: (cluster.tpa_40 * pixelAreaInAcres) / cluster.area
  };

  const removalsCT = calcRemovalsCT(cluster); // # of chip trees/acre in cluster
  const removalsSLT = calcRemovalsSLT(cluster); //  # of small log trees/acre in cluster
  const removalsLLT = calcRemovalsLLT(cluster); // # of large log trees/acre in cluster

  // get weight in pounds
  const chipTreeWeight =
    2000 *
    (cluster.bmfol_0 +
    cluster.bmfol_2 +
    cluster.bmfol_7 + // U.S. tons
      cluster.bmcwn_0 +
      cluster.bmcwn_2 +
      cluster.bmcwn_7 +
      cluster.bmstm_0 +
      cluster.bmstm_2 +
      cluster.bmstm_7);
  // get volume in cubic feet
  const chipTreeVolume =
    calculateVolume(cluster, 0) + calculateVolume(cluster, 2) + calculateVolume(cluster, 7);
  console.log('weight: ' + chipTreeWeight + ' volume: ' + chipTreeVolume);
  const chipTreeDensity = chipTreeWeight / chipTreeVolume;
  const userSpecWDSLT = 58.6235;
  const userSpecWDLLT = 62.1225;
  //   const userSpecWDLLT = 80;

  const totalFrcsInptus: InputVarMod = {
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
    UserSpecWDCT: chipTreeDensity,
    UserSpecWDSLT: userSpecWDSLT,
    UserSpecWDLLT: userSpecWDLLT,
    UserSpecRFCT: 0,
    UserSpecRFSLT: 0.25,
    UserSpecRFLLT: 0.38,
    UserSpecHFCT: 0.2,
    UserSpecHFSLT: 0,
    UserSpecHFLLT: 0,
    RemovalsCT: removalsCT,
    RemovalsLLT: removalsLLT,
    RemovalsSLT: removalsSLT,
    // * 2000 to get into pounds, divide by userSpecWDCT(density) to get cubic feet
    TreeVolCT: (2000 * calcTreeVolCT(cluster)) / (removalsCT * cluster.area) / chipTreeDensity,
    TreeVolSLT: (2000 * calcTreeVolSLT(cluster)) / (removalsSLT * cluster.area) / userSpecWDSLT,
    TreeVolLLT: (2000 * calcTreeVolLLT(cluster)) / (removalsLLT * cluster.area) / userSpecWDLLT,
    DieselFuelPrice: 3.882
  };
  console.log('TOTAL FRCS INPUT: -------');
  console.log(totalFrcsInptus);
  const clusterFrcsOutput = runFrcs(totalFrcsInptus);
  console.log('-----------');
  console.log('FRCS CLUSTER OUTPUT:');
  console.log(clusterFrcsOutput);
  return clusterFrcsOutput;
};
