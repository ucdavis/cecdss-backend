import { runFrcs } from '@ucdavis/frcs';
import { getFrcsInputs, pixelAreaInAcres } from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';

export const runFrcsOnClusters = async (clusters: TreatedCluster[]) => {};

export const runFrcsOnCluster = async (cluster: TreatedCluster) => {
  const frcsInputs = getFrcsInputs(cluster);

  console.log('TOTAL FRCS INPUT: -------');
  console.log(frcsInputs);
  const clusterFrcsOutput = runFrcs(frcsInputs);
  console.log('-----------');
  console.log('FRCS CLUSTER OUTPUT:');
  console.log(clusterFrcsOutput);
  return clusterFrcsOutput;
};
