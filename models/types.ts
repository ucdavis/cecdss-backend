import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { InputModCHP, InputModGP, InputModGPO } from '@ucdavis/tea/out/models/input.model';
import { OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/out/models/output.model';
import { LCAresults } from './lcaModels';

export interface RequestParams {
  lat: number;
  lng: number;
  system: string;
  treatmentid: number;
  dieselFuelPrice: number; // $/gal
  teaModel: string;
  teaInputs: InputModGPO | InputModCHP | InputModGP; // | InputModHydrogen;
}

export interface RequestParamsTest extends RequestParams {
  year: number;
  cluster_no: number;
}

export interface Treatment {
  id: number;
  name: string;
  land_use: string;
}

export interface ClusterRequestParams {
  clusterId: number;
  system: string;
}

export interface Results {
  clusterIds: number[];
  errorIds: number[];
  years: YearlyResult[];
  radius: number;
}

export interface YearlyResult {
  year: number;
  lcaResults?: LCAresults;
  teaResults?: OutputModGPO | OutputModCHP | OutputModGP;
  biomassTarget: number; // from tea output
  totalBiomass: number; // total biomass from frcs residue output
  totalArea: number;
  totalResidueCost: number; // cost of harvesting residue biomass from frcs
  totalMoveInCost: number; // move in cost from separate frcs function
  totalMoveInDistance: number;
  totalTransportationCost: number; // transportation cost per gt * cluster biomass (distance from osrm)
  numberOfClusters: number;
  clusterNumbers: number[];
  clusters: ClusterResult[];
  errorClusters: ClusterErrorResult[];
  errorClusterNumbers: number[];
  radius: number;
}

export interface YearlyResultTest {
  treatmentid: number;
  system: string;
  teaModel: string;
  year: number;
  biomassTarget: number;
  totalBiomass: number;
  totalArea: number;
  totalResidueCost: number;
  totalMoveInCost: number;
  totalMoveInDistance: number;
  totalTransportationCost: number;
  numberOfClusters: number;
  radius: number;
  data: any;
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
  slope: number;
}

export interface Bounds {
  latitude: number;
  longitude: number;
}

export interface LCATotals {
  totalDiesel: number;
  totalGasoline: number;
  totalJetFuel: number;
  totalTransportationDistance: number;
}
