import { runFrcs } from '@ucdavis/frcs';
import { getFrcsInputs, pixelAreaInAcres } from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';

export const runFrcsOnClusters = async (clusters: TreatedCluster[]) => {};

export const runFrcsOnCluster = async (cluster: TreatedCluster) => {
  const frcsInputs = getFrcsInputs(cluster);
  const clusterFrcsOutput = runFrcs(frcsInputs);
  return clusterFrcsOutput;
};
