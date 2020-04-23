import {
  ElectricalFuelBaseYearMod,
  ElectricalFuelBaseYearModCHP,
  ElectricalFuelBaseYearModGP
} from '@ucdavis/tea/out/models/output.model';

// TODO: export these from TEA
export class ElectricalFuelBaseYearModGPOClass implements ElectricalFuelBaseYearMod {
  AnnualHours = 0;
  FuelConsumptionRate = 0;
  AnnualGeneration = 0;
  CapitalCostNEC = 0;
  AnnualFuelConsumption = 0;
  AnnualAshDisposal = 0;
}

export class ElectricalFuelBaseYearModGPClass implements ElectricalFuelBaseYearModGP {
  ParasiticLoad = 0;
  AnnualHours = 0;
  AnnualNetElectricityGeneration = 0;
  OverallNetSystemEfficiency = 0;
  NitrogenGas = 0;
  CleanGasMolecularMass = 0;
  CleanGasDensity = 0;
  CleanGasHigherHeatingValue = 0;
  CleanGasLowerHeatingValue = 0;
  TotalFuelPowerInput = 0;
  CleanGasPowerInput = 0;
  DualFuelPowerInput = 0;
  CleanGasFlowRateVolume = 0;
  CleanGasFlowRateMass = 0;
  AnnualCleanGasConsumption = 0;
  DualFuelFlowRate = 0;
  AnnualDualFuelConsumption = 0;
  BiomassFeedRate = 0;
  AnnualBiomassConsumptionDryMass = 0;
  AnnualBiomassConsumptionWetMass = 0;
  CharProductionRate = 0;
  AnnualCharProduction = 0;
}

export class ElectricalFuelBaseYearModCHPClass implements ElectricalFuelBaseYearModCHP {
  AnnualHours = 0;
  FuelConsumptionRate = 0;
  AnnualGeneration = 0;
  CapitalCostNEC = 0;
  AnnualFuelConsumption = 0;
  AnnualAshDisposal = 0;
  ParasiticLoad = 0;
  FuelPower = 0;
  GrossStationElectricalEfficiency = 0;
}
