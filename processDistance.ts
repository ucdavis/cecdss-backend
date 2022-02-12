import { getMoveInOutputs } from '@ucdavis/frcs';
import { FrcsOutputs } from '@ucdavis/frcs/out/model';
import { lifeCycleAnalysis } from '@ucdavis/lca/function';
import { LcaInputs } from '@ucdavis/lca/model';
import { CashFlow, OutputModCHP, OutputModGP, OutputModGPO } from '@ucdavis/tea/output.model';
import {
  computeCarbonCredit,
  computeEnergyRevenueRequired,
  gasificationPower,
  genericCombinedHeatPower,
  genericPowerOnly,
} from '@ucdavis/tea/utility';
import { Knex } from 'knex';
import OSRM from 'osrm';
import { TreatedCluster } from './models/treatedcluster';
import { LCAresults, LCATotals, RequestByDistanceParams, YearlyResult } from './models/types';
import { runFrcsOnCluster } from './runFrcs';
import {
  calculateMoveInDistance,
  FULL_TRUCK_PAYLOAD,
  getTransportationCostTotal,
  KM_TO_MILES,
  TRUCK_OWNERSHIP_COST,
} from './transportation';

const unloadingTime = 0.25; // assume the self-unloading process takes 15 minutes (0.25 h)
const unloadingDieselUsageRate = 2; // assume fuel consumption rate is 2 gal/h
const unloadingDieselUsagePerTruck = unloadingDieselUsageRate * unloadingTime;

export const processClustersByDistance = async (
  db: Knex,
  osrm: OSRM,
  minRadiusInMeters: number,
  maxRadiusInMeters: number,
  params: RequestByDistanceParams,
  year: number
): Promise<YearlyResult> => {
  return new Promise(async (resolve, reject) => {
    try {
      const results: YearlyResult = {
        year,
        clusterNumbers: [],
        numberOfClusters: 0,
        totalArea: 0,
        candidateTotalFeedstock: 0,
        totalFeedstock: 0,
        totalDryFeedstock: 0,
        totalHarvestCost: 0,
        totalCoproduct: 0,
        totalDryCoproduct: 0,
        totalCoproductCost: 0,
        totalMoveInCost: 0,
        totalMoveInDistance: 0,
        totalTransportationCost: 0,
        harvestCostPerDryTon: 0,
        transportationCostPerDryTon: 0,
        moveInCostPerDryTon: 0,
        feedstockCostPerTon: 0,
        tripGeometries: [],
        radius: 0,
        clusters: [],
        errorClusters: [],
        errorClusterNumbers: [],
        fuelCost: 0,
        geoJson: [],
        errorGeoJson: [],
        cashFlow: {},
        lcaResults: {
          lifeCycleEmissions: {
            CO2: 0,
            CH4: 0,
            N2O: 0,
            CO: 0,
            NOx: 0,
            PM10: 0,
            PM25: 0,
            SOx: 0,
            VOC: 0,
            CI: 0,
          },
          lifeCycleImpacts: {
            global_warming_air: 0,
            acidification_air: 0,
            hh_particulate_air: 0,
            eutrophication_air: 0,
            smog_air: 0,
          },
          lifeStageCO2: {
            harvest: 0,
            transport: 0,
            conversion: 0,
            construction: 0,
            equipment: 0,
          },
          lifeStageGWP: {
            harvest: 0,
            transport: 0,
            conversion: 0,
            construction: 0,
            equipment: 0,
          },
          inputs: {
            technology: '',
            harvestDiesel: 0,
            unloadDiesel: 0,
            gasoline: 0,
            jetfuel: 0,
            distance: 0,
            construction: 0,
            equipment: 0,
          },
        },
      };

      const lcaTotals: LCATotals = {
        totalHarvestDiesel: 0,
        totalUnloadDiesel: 0,
        totalGasoline: 0,
        totalJetFuel: 0,
        totalTransportationDistance: 0,
      };

      // get all clusters in a band between min/max radius
      console.log(
        `year:${year} getting clusters from db, radius between ${minRadiusInMeters} and ${maxRadiusInMeters}`
      );

      const clusters: TreatedCluster[] = await getClusters(
        db,
        params,
        year,
        minRadiusInMeters,
        maxRadiusInMeters
      );

      console.log(`year:${year} clusters found: ${clusters.length}`);

      console.log(`year:${year} selecting clusters...`);
      await selectClusters(osrm, params, clusters, results, lcaTotals, [], []);

      let moveInDistance = 0;

      if (results.totalFeedstock > 0) {
        console.log('move in distance required, calculating');
        moveInDistance = await calculateMoveInDistance(
          osrm,
          results,
          params.facilityLat,
          params.facilityLng
        );
      } else {
        console.log(
          `skipping updating move in distance, totalBiomass: ${results.totalFeedstock}, # of clusters: ${results.clusters.length}`
        );
      }

      const moveInOutputs = getMoveInOutputs({
        system: params.system,
        moveInDistance: (moveInDistance / 1000) * KM_TO_MILES,
        dieselFuelPrice: params.dieselFuelPrice,
        isBiomassSalvage: params.treatmentid === 10 ? true : false, // true if treatment is biomass salvage
        wageFaller: params.wageFaller,
        wageOther: params.wageOther,
        laborBenefits: params.laborBenefits,
        ppiCurrent: params.ppiCurrent,
        harvestChipTrees: true,
        includeCostsCollectChipResidues: true,
      });

      console.log(`move in cost: ${moveInOutputs.residualCost}`);

      results.totalMoveInDistance = moveInDistance;
      results.totalMoveInCost = moveInOutputs.residualCost;
      lcaTotals.totalHarvestDiesel += moveInOutputs.residualDiesel;

      results.numberOfClusters = results.clusterNumbers.length;

      /*** run LCA ***/
      const lcaInputs: LcaInputs = {
        technology: params.teaModel,
        harvestDiesel: lcaTotals.totalHarvestDiesel / params.annualGeneration, // gal/kWh
        unloadDiesel: lcaTotals.totalUnloadDiesel / params.annualGeneration, // gal/kWh
        gasoline: lcaTotals.totalGasoline / params.annualGeneration, // gal/kWh
        jetfuel: lcaTotals.totalJetFuel / params.annualGeneration, // gal/kWh
        distance: (lcaTotals.totalTransportationDistance * KM_TO_MILES) / params.annualGeneration, // miles/kWh
        construction: 0,
        equipment: 0,
      };

      const lca = await runLca(lcaInputs);
      results.lcaResults = lca;

      const moistureContentPercentage = params.moistureContent / 100.0;
      const TONNE_TO_TON = 1.10231; // 1 metric ton = 1.10231 short tons

      // unloading ($ / dry metric ton)
      const unloadingCostPerDryTon =
        (((1 + params.laborBenefits / 100) * params.wageTruckDriver + TRUCK_OWNERSHIP_COST) *
          unloadingTime) /
        ((FULL_TRUCK_PAYLOAD * (1 - moistureContentPercentage)) / TONNE_TO_TON);

      // calculate dry values ($ / dry metric ton)
      results.totalDryFeedstock =
        (results.totalFeedstock * (1 - moistureContentPercentage)) / TONNE_TO_TON;
      results.totalDryCoproduct =
        (results.totalCoproduct * (1 - moistureContentPercentage)) / TONNE_TO_TON;

      results.harvestCostPerDryTon = results.totalHarvestCost / results.totalDryFeedstock;
      results.transportationCostPerDryTon =
        results.totalTransportationCost / results.totalDryFeedstock + unloadingCostPerDryTon;
      results.moveInCostPerDryTon = results.totalMoveInCost / results.totalDryFeedstock;
      results.feedstockCostPerTon =
        results.harvestCostPerDryTon +
        results.transportationCostPerDryTon +
        results.moveInCostPerDryTon;

      const cashFlow: CashFlow = params.cashFlow;
      // TODO: check that this is the proper way to calc biomass fuel cost
      cashFlow.BiomassFuelCost =
        results.totalHarvestCost + results.totalTransportationCost + results.totalMoveInCost;
      const carbonIntensity = (lca.lifeCycleEmissions.CI * 1000) / 3.6; // convert from kg/kWh to g/MJ
      cashFlow.LcfsCreditRevenue = computeCarbonCredit(
        params.year,
        params.firstYear,
        params.carbonCreditPrice,
        carbonIntensity,
        params.energyEconomyRatio,
        params.generalInflation,
        params.annualGeneration
      ); // update LCFS credit revenue
      const energyRevenueRequired = computeEnergyRevenueRequired(
        params.teaModel,
        params.cashFlow,
        params.includeCarbonCredit
      );
      cashFlow.EnergyRevenueRequired = energyRevenueRequired;
      results.cashFlow = cashFlow;

      resolve(results);
    } catch (e: any) {
      console.log('ERROR!');
      console.log(e);
      reject(e.message);
    }
  });
};

const getClusters = async (
  db: Knex,
  params: RequestByDistanceParams,
  year: number,
  minRadiusInMeters: number,
  maxRadiusInMeters: number
): Promise<TreatedCluster[]> => {
  return new Promise(async (res, rej) => {
    const clusters: TreatedCluster[] = await db
      .table('treatedclusters')
      .where({ treatmentid: params.treatmentid })
      .where({ year: 2016 }) // TODO: filter by actual year if we get data for multiple years
      .whereIn('land_use', ['private', 'USDA Forest Service'])
      .andWhereRaw(
        `ST_DistanceSphere(ST_MakePoint(${params.facilityLng},${params.facilityLat}), ST_MakePoint(center_lng,center_lat)) > ${minRadiusInMeters}`
      )
      .andWhereRaw(
        `ST_DistanceSphere(ST_MakePoint(${params.facilityLng},${params.facilityLat}), ST_MakePoint(center_lng,center_lat)) <= ${maxRadiusInMeters}`
      );
    res(clusters);
  });
};

const selectClusters = async (
  osrm: OSRM,
  params: RequestByDistanceParams,
  sortedClusters: TreatedCluster[],
  results: YearlyResult,
  lcaTotals: LCATotals,
  usedIds: string[],
  errorIds: string[]
) => {
  return new Promise<void>(async (res, rej) => {
    for (const cluster of sortedClusters) {
      try {
        const frcsResult: FrcsOutputs = await runFrcsOnCluster(
          cluster,
          params.system,
          params.dieselFuelPrice,
          params.moistureContent,
          params.wageFaller,
          params.wageOther,
          params.laborBenefits,
          params.ppiCurrent,
          params.residueRecovFracWT,
          params.residueRecovFracCTL
        );

        // use frcs calculated available feedstock
        const clusterFeedstock = frcsResult.residual.yieldPerAcre * cluster.area; // green tons
        const clusterCoproduct =
          (frcsResult.total.yieldPerAcre - frcsResult.residual.yieldPerAcre) * cluster.area; // green tons
        if (clusterFeedstock < 1) {
          throw new Error(`Cluster biomass was: ${clusterFeedstock}, which is too low to use`);
        }

        const routeOptions: OSRM.RouteOptions = {
          coordinates: [
            [params.facilityLng, params.facilityLat],
            [cluster.landing_lng, cluster.landing_lat],
          ],
          annotations: ['duration', 'distance'],
        };

        // currently distance is the osrm generated distance between each landing site and the facility location
        const route: any = await getRouteDistanceAndDuration(osrm, routeOptions);
        // number of trips is how many truckloads it takes to transport biomass
        const numberOfTripsForTransportation = Math.ceil(clusterFeedstock / FULL_TRUCK_PAYLOAD);
        // multiply the osrm road distance by number of trips, transportation eq doubles it for round trip
        const distance = route.distance / 1000; // m to km
        const duration = route.duration / 3600; // seconds to hours
        const transportationCostTotal = getTransportationCostTotal(
          clusterFeedstock,
          distance,
          duration,
          params.dieselFuelPrice,
          params.wageTruckDriver,
          params.driverBenefits,
          params.oilCost
        );

        results.totalFeedstock += clusterFeedstock;
        results.totalHarvestCost += frcsResult.residual.costPerAcre * cluster.area;
        results.totalCoproduct += clusterCoproduct;
        results.totalCoproductCost +=
          (frcsResult.total.costPerAcre - frcsResult.residual.costPerAcre) * cluster.area;

        results.totalArea += cluster.area;
        results.totalTransportationCost += transportationCostTotal;
        lcaTotals.totalHarvestDiesel += frcsResult.residual.dieselPerAcre * cluster.area;
        lcaTotals.totalUnloadDiesel +=
          unloadingDieselUsagePerTruck * numberOfTripsForTransportation;
        lcaTotals.totalGasoline += frcsResult.residual.gasolinePerAcre * cluster.area;
        lcaTotals.totalJetFuel += frcsResult.residual.jetFuelPerAcre * cluster.area;
        lcaTotals.totalTransportationDistance += distance * 2 * numberOfTripsForTransportation;

        results.clusters.push({
          cluster_no: cluster.cluster_no,
          area: cluster.area,
          biomass: clusterFeedstock,
          distance: distance,
          combinedCost: frcsResult.total.costPerAcre * cluster.area,
          residueCost: frcsResult.residual.costPerAcre * cluster.area,
          transportationCost: transportationCostTotal,
          frcsResult: frcsResult,
          center_lat: cluster.center_lat,
          center_lng: cluster.center_lng,
          landing_lat: cluster.landing_lat,
          landing_lng: cluster.landing_lng,
          landing_distance: 0, // don't need for supply curves
          county: cluster.county_name,
          land_use: cluster.land_use,
          haz_class: cluster.haz_class,
          forest_type: cluster.forest_type,
          site_class: cluster.site_class,
        });
        results.clusterNumbers.push(cluster.cluster_no);
        usedIds.push(cluster.cluster_no);
      } catch (err: any) {
        // swallow errors frcs throws and push the error message instead
        results.errorClusters.push({
          cluster_no: cluster.cluster_no,
          area: cluster.area,
          biomass: 0,
          error: err.message,
          slope: cluster.slope,
        });
        results.errorClusterNumbers.push(cluster.cluster_no);
        errorIds.push(cluster.cluster_no);
      }
    }
    res();
  });
};

export const runLca = async (inputs: LcaInputs) => {
  const lcaOutputs = await lifeCycleAnalysis(inputs);
  const results: LCAresults = {
    lifeCycleEmissions: lcaOutputs.lifeCycleEmissions,
    lifeCycleImpacts: lcaOutputs.lifeCycleImpacts,
    lifeStageCO2: lcaOutputs.lifeStageCO2,
    lifeStageGWP: lcaOutputs.lifeStageGWP,
    inputs: inputs,
  };
  // convert US units to SI units: gallon to liter, mile to km
  const GALLON_TO_LITER = 3.78541;
  results.inputs.harvestDiesel *= GALLON_TO_LITER; // L/kWh
  results.inputs.unloadDiesel *= GALLON_TO_LITER; // L/kWh
  results.inputs.gasoline *= GALLON_TO_LITER; // L/kWh
  results.inputs.jetfuel *= GALLON_TO_LITER; // L/kWh
  results.inputs.distance /= KM_TO_MILES; // km/kWh

  return results;
};

const getRouteDistanceAndDuration = (osrm: OSRM, routeOptions: OSRM.RouteOptions) => {
  return new Promise((resolve, reject) => {
    osrm.route(routeOptions, async (err, result) => {
      if (err) {
        reject(err);
      }
      const distance = result.routes[0].distance;
      const duration = result.routes[0].duration;
      resolve({ distance, duration });
    });
  });
};

export const getTeaOutputs = async (type: string, inputs: any) => {
  let result: OutputModGPO | OutputModCHP | OutputModGP;
  if (type === 'GPO') {
    result = genericPowerOnly(inputs);
  } else if (type === 'CHP') {
    result = genericCombinedHeatPower(inputs);
  } else {
    // type === 'GP' checked before this is called
    result = gasificationPower(inputs);
  }
  return result;
};
