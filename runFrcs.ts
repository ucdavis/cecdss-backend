import { getFrcsOutputs } from '@ucdavis/frcs';
import { getFrcsInputs, getFrcsInputsTest } from './frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';
import { FrcsOutputs } from '@ucdavis/frcs/out/model';

export const sanitizeFrcsOutput = (frcsOutput: FrcsOutputs): FrcsOutputs => {
  const sanitizeObject = (obj: any): any => {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          result[key] = sanitizeObject(obj[key]);
        } else if (typeof obj[key] === 'number' && isNaN(obj[key])) {
          result[key] = 0;
        } else {
          result[key] = obj[key];
        }
      }
    }
    return result;
  };

  return {
    total: sanitizeObject(frcsOutput.total),
    residual: sanitizeObject(frcsOutput.residual)
  };
};

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
  const clusterFrcsOutput = getFrcsOutputs(frcsInputs);
  const sanitizedOutput = sanitizeFrcsOutput(clusterFrcsOutput);
  return sanitizedOutput;

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
  const frcsResult = getFrcsOutputs(frcsInputs);
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
