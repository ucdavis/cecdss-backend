import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { InputModGPO } from '@ucdavis/tea/out/models/input.model';
import { OutputModGPO } from '@ucdavis/tea/out/models/output.model';
import { LCAresults } from './lcaModels';

export interface RequestParams {
  lat: number;
  lng: number;
  radius: number;
  system: string;
  teaInputs: InputModGPO;
}

export interface ClusterRequestParams {
  clusterId: number;
  system: string;
}

export interface Results {
  teaResults: OutputModGPO;
  lcaResults?: LCAresults;
  totalBiomass: number;
  totalArea: number;
  totalCost: number;
  numberOfClusters: number;
  clusters: ClusterResult[];
  skippedClusters: ClusterResult[];
  errorClusters: ClusterErrorResult[];
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
  lat: number;
  lng: number;
}

export interface ClusterErrorResult {
  cluster_no: number;
  biomass: number;
  area: number;
  error: string;
}
