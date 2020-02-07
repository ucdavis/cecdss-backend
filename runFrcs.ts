import { runFrcs } from '@ucdavis/frcs';
import { getFrcsInputs } from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';

export const runFrcsOnClusters = async (clusters: TreatedCluster[]) => {};

export const runFrcsOnCluster = async (cluster: TreatedCluster, system: string) => {
  const frcsInputs = getFrcsInputs(cluster, system);
  console.log('frcsInputs: ');
  console.log(frcsInputs);
  const clusterFrcsOutput = runFrcs(frcsInputs);
  return clusterFrcsOutput;
};
