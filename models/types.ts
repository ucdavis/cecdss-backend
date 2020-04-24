import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { InputModCHP, InputModGP, InputModGPO } from '@ucdavis/tea/out/models/input.model';
import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/out/models/output.model';
import { LCAresults } from './lcaModels';

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
  lcaResults?: LCAresults;
  teaResults: OutputModGPO | OutputModCHP | OutputModGP;
  totalBiomass: number;
  totalArea: number;
  totalCombinedCost: number;
  totalResidueCost: number;
  totalTransportationCost: number;
  numberOfClusters: number;
  clusters: ClusterResult[];
  skippedClusters: ClusterResult[];
  errorClusters: ClusterErrorResult[];
}

export interface ClusterResult {
  cluster_no: number;
  biomass: number;
  combinedCost: number;
  area: number;
  distance: number;
  residueCost: number;
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
