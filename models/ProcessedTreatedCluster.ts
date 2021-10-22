import { OutputVarMod } from '@ucdavis/frcs/out/systems/frcs.model';
import { TreatedCluster } from './treatedcluster';

export interface ProcessedTreatedCluster extends TreatedCluster {
  feedstock: number;
  coproduct: number;
  frcsResult: OutputVarMod;
  feedstockHarvestCost: number;
  coproductHarvestCost: number;
  transportationCost: number;
  diesel: number;
  gasoline: number;
  juetFuel: number;
  distance: number; // one-way transportation distance
  transportationDistance: number; // total transportation distance
}
