import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { OutputModGPO } from '@ucdavis/tea/out/models/output.model';
import { GenericPowerOnlyInputMod } from './TechnoeconomicInputs';

export interface RequestParams {
  lat: number;
  lng: number;
  radius: number;
  system: string;
  teaInputs: GenericPowerOnlyInputMod;
}

export interface ClusterRequestParams {
  clusterId: number;
  system: string;
}

export interface Results {
  teaResults: OutputModGPO;
  totalBiomass: number;
  totalArea: number;
  totalCost: number;
  numberOfClusters: number;
  clusters: ClusterResult[];
  skippedClusters: ClusterResult[];
}

export interface ClusterResult {
  cluster_no: number;
  biomass: number;
  totalCost: number;
  area: number;
  distance: number;
  harvestCost: number;
  transportationCost: number;
  frcsResult: OutputVarMod;
}
