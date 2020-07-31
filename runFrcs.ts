import { runFrcs } from '@ucdavis/frcs';
import { getFrcsInputs, getFrcsInputsTest } from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';

export const runFrcsOnClusters = async (clusters: TreatedCluster[]) => {};

export const runFrcsOnCluster = async (
  cluster: TreatedCluster,
  system: string,
  distance: number,
  dieselFuelPrice: number,
  moistureContent: number
) => {
  const frcsInputs = getFrcsInputs(cluster, system, distance, dieselFuelPrice, moistureContent);
  const clusterFrcsOutput = runFrcs(frcsInputs);
  return clusterFrcsOutput;
};

export const testRunFrcsOnCluster = async (
  cluster: TreatedCluster,
  system: string,
  distance: number,
  dieselFuelPrice: number,
  moistureContent: number
) => {
  const {
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
  } = getFrcsInputsTest(cluster, system, distance, dieselFuelPrice, moistureContent);
  console.log(JSON.stringify(frcsInputs));
  const frcsResult = runFrcs(frcsInputs);
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
    frcsResult
  };
};
