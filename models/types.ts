import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';

export interface RequestParams {
  lat: number;
  lng: number;
  radius: number;
  system: string;
}

export interface ClusterRequestParams {
  clusterId: number;
  system: string;
}

export interface Results {
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
