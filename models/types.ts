import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import {
  InputModCHP,
  InputModGP,
  InputModGPO,
  InputModTransimission
} from '@ucdavis/tea/out/models/input.model';
import {
  CashFlow,
  CashFlowCHP,
  CashFlowGP,
  OutputModCHP,
  OutputModGP,
  OutputModGPO
} from '@ucdavis/tea/out/models/output.model';
import OSRM from 'osrm';
import { LCAresults } from './lcaModels';

export interface RequestParams {
  facilityLat: number;
  facilityLng: number;
  lat: number;
  lng: number;
  system: string;
  treatmentid: number;
  dieselFuelPrice: number; // $/gal
  biomassTarget: number;
  year: number;
  clusterIds: string[];
  errorIds: string[];
  radius: number;
  teaModel: string;
  annualGeneration: number; // used for LCA, kWh
  moistureContent: number; // for frcs
  cashFlow: CashFlow | CashFlowCHP | CashFlowGP;
  costOfEquity: number;
}

export interface RequestByDistanceParams {
  facilityLat: number;
  facilityLng: number;
  system: string;
  treatmentid: number;
  dieselFuelPrice: number; // $/gal
  year: number;
  minRadiusInMeters: number;
  maxRadiusInMeters: number;
  teaModel: string;
  annualGeneration: number; // used for LCA, kWh
  moistureContent: number; // for frcs
  cashFlow: CashFlow | CashFlowCHP | CashFlowGP;
  costOfEquity: number;
}

export interface RequestByRoutesParams {
  facilityLat: number;
  facilityLng: number;
  clusters: ClusterResult[];
}

export interface RequestParamsTest extends RequestParams {
  year: number;
  cluster_no: number;
}

export interface RequestParamsTestYears extends RequestParamsAllYears {
  years: number[];
}

export interface RequestParamsAllYears {
  facilityLat: number;
  facilityLng: number;
  transmission: InputModTransimission;
  teaModel: string;
  teaInputs: InputModGPO | InputModCHP | InputModGP; // | InputModHydrogen;
  includeUnloadingCost: boolean;
  unloadingCost: number; // default to 10,000
}

export interface AllYearsResults {
  biomassTarget: number; // from tea output
  annualGeneration: number;
  teaResults?: OutputModGPO | OutputModCHP | OutputModGP;
  teaInputs?: any;
  transmissionResults?: any;
  nearestSubstation: string;
  distanceToNearestSubstation: number; // km
}

export interface AllYearsResultsPost {
  biomassTarget: number; // from tea output
  annualGeneration: number;
  teaResults?: OutputModGPO | OutputModCHP | OutputModGP;
  teaInputs?: any;
  transmissionResults?: any;
  nearestSubstation: string;
  distanceToNearestSubstation: number; // km
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

export interface YearlyTripResults {
  trips: OSRM.Route[];
  distance: number;
}

export interface YearlyResult {
  tripGeometries: Geometry[];
  year: number;
  lcaResults?: LCAresults;
  totalArea: number;
  totalFeedstock: number; // total biomass from frcs residue output
  totalDryFeedstock: number; // feedstock multipled by (1-moistureContent)
  totalHarvestCost: number; // cost of harvesting residue biomass from frcs
  totalCoproduct: number; // Frcs.Total - Frcs.Residue weight
  totalDryCoproduct: number;
  totalCoproductCost: number;
  totalMoveInCost: number; // move in cost from separate frcs function
  totalMoveInDistance: number;
  totalTransportationCost: number; // transportation cost per gt * cluster biomass (distance from osrm)
  harvestCostPerDryTon: number;
  transportationCostPerDryTon: number;
  moveInCostPerDryTon: number;
  totalCostPerDryTon: number;
  numberOfClusters: number;
  clusterNumbers: string[];
  clusters: ClusterResult[];
  errorClusters: ClusterErrorResult[];
  errorClusterNumbers: string[];
  radius: number;
  fuelCost: number;
  energyRevenueRequired: number;
  energyRevenueRequiredPW: number;
  cashFlow: any;
  geoJson: any;
  errorGeoJson: any;
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
  cluster_no: string;
  biomass: number;
  combinedCost: number;
  area: number;
  distance: number;
  residueCost: number;
  transportationCost: number;
  frcsResult: OutputVarMod;
  center_lat: number;
  center_lng: number;
  landing_lat: number;
  landing_lng: number;
  county: string;
  land_use: string;
  site_class: number;
  forest_type: string;
  haz_class: number;
}

export interface ClusterErrorResult {
  cluster_no: string;
  biomass: number;
  area: number;
  error: string;
  slope: number;
}

export interface Bounds {
  latitude: number;
  longitude: number;
}

export interface Geometry {
  coodinates: number[][];
  type: string;
}

export interface LCATotals {
  totalDiesel: number;
  totalGasoline: number;
  totalJetFuel: number;
  totalTransportationDistance: number;
}

export interface TreatedClustersInfo {
  cluster_no: string;
  geography: JSON;
}
