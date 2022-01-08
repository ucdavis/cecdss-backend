import { FrcsOutputs } from '@ucdavis/frcs/out/model';
import {
  InputModCHP,
  InputModGP,
  InputModGPO,
  InputModTransimission,
} from '@ucdavis/tea/input.model';
import {
  CashFlow,
  CashFlowCHP,
  CashFlowGP,
  OutputModCHP,
  OutputModGP,
  OutputModGPO,
} from '@ucdavis/tea/output.model';
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
  firstYear: number;
  year: number;
  clusterIds: string[];
  errorIds: string[];
  radius: number;
  teaModel: string;
  annualGeneration: number; // used for LCA, kWh
  moistureContent: number; // for frcs
  cashFlow: CashFlow | CashFlowCHP | CashFlowGP;
  costOfEquity: number;
  generalInflation: number;
  carbonCreditPrice: number;
  energyEconomyRatio: number;
  includeCarbonCredit: boolean;
  wageFaller: number;
  wageOther: number;
  laborBenefits: number;
  ppiCurrent: number;
  residueRecovFracWT: number;
  residueRecovFracCTL: number;
  expansionFactor: number;
  wageTruckDriver: number;
  driverBenefits: number;
  oilCost: number;
  capitalCost: number; // combine capital cost = facility capital + transmission cost + unloading cost
}

export interface RequestByDistanceParams {
  facilityLat: number;
  facilityLng: number;
  system: string;
  treatmentid: number;
  dieselFuelPrice: number; // $/gal
  firstYear: number;
  year: number;
  minRadiusInMeters: number;
  maxRadiusInMeters: number;
  teaModel: string;
  annualGeneration: number; // used for LCA, kWh
  moistureContent: number; // for frcs
  cashFlow: CashFlow | CashFlowCHP | CashFlowGP;
  costOfEquity: number;
  generalInflation: number;
  carbonCreditPrice: number;
  energyEconomyRatio: number;
  includeCarbonCredit: boolean;
  wageFaller: number;
  wageOther: number;
  laborBenefits: number;
  ppiCurrent: number;
  residueRecovFracWT: number;
  residueRecovFracCTL: number;
  wageTruckDriver: number;
  driverBenefits: number;
  oilCost: number;
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
  candidateTotalFeedstock: number;
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
  feedstockCostPerTon: number;
  numberOfClusters: number;
  clusterNumbers: string[];
  clusters: ClusterResult[];
  errorClusters: ClusterErrorResult[];
  errorClusterNumbers: string[];
  radius: number;
  fuelCost: number;
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
  frcsResult: FrcsOutputs;
  center_lat: number;
  center_lng: number;
  landing_lat: number;
  landing_lng: number;
  landing_distance: number;
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
