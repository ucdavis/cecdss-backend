import { runFrcs } from '@ucdavis/frcs';
import { getFrcsInputs } from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';

export const runFrcsOnClusters = async (clusters: TreatedCluster[]) => {};

export const runFrcsOnCluster = async (
  cluster: TreatedCluster,
  system: string,
  distance: number
) => {
  const frcsInputs = getFrcsInputs(cluster, system, distance);
  const clusterFrcsOutput = runFrcs(frcsInputs);
  return clusterFrcsOutput;
};
