import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import {
  InputModCHP,
  InputModGP,
  InputModGPO,
  InputModHydrogen
} from '@ucdavis/tea/out/models/input.model';
import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/out/models/output.model';

export interface RequestParams {
  lat: number;
  lng: number;
  radius: number;
  system: string;
  teaModel: string;
  teaInputs: InputModGPO | InputModCHP | InputModGP; // | InputModHydrogen;
}

export interface ClusterRequestParams {
  clusterId: number;
  system: string;
}

export interface Results {
  teaResults: OutputModGPO | OutputModCHP; // | OutputModGP;
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
