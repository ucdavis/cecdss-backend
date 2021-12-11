import { runFrcs } from '@ucdavis/frcs';
import { getFrcsInputs, getFrcsInputsTest } from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';

export const runFrcsOnCluster = async (
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
  const frcsInputs = getFrcsInputs(
    cluster,
    system,
    dieselFuelPrice,
    moistureContent,
    wageFaller,
    wageOther,
    laborBenefits,
    ppiCurrent,
    residueRecovFracWT,
    residueRecovFracCTL
  );
  const clusterFrcsOutput = runFrcs(frcsInputs);
  return clusterFrcsOutput;
};

export const testRunFrcsOnCluster = async (
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
    removalsLLT,
  } = getFrcsInputsTest(
    cluster,
    system,
    distance,
    dieselFuelPrice,
    moistureContent,
    wageFaller,
    wageOther,
    laborBenefits,
    ppiCurrent,
    residueRecovFracWT,
    residueRecovFracCTL
  );
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
    frcsResult,
  };
};
