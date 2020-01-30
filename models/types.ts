import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';

export interface RequestParams {
  lat: number;
  lng: number;
  radius: number;
}

export interface Results {
  totalBiomass: number;
  numberOfClusters: number;
  clusters: ClusterResult[];
}

export interface ClusterResult {
  cluster_no: number;
  totalBiomass: number;
  distance: number;
  frcsResult: OutputVarMod;
}
