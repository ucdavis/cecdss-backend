import { FrcsOutputs } from '@ucdavis/frcs/out/model';
import { TreatedCluster } from './treatedcluster';

export interface ProcessedTreatedCluster extends TreatedCluster {
  feedstock: number;
  coproduct: number;
  frcsResult: FrcsOutputs;
  feedstockHarvestCost: number;
  coproductHarvestCost: number;
  transportationCost: number;
  diesel: number;
  gasoline: number;
  juetFuel: number;
  distance: number; // one-way transportation distance
  transportationDistance: number; // total transportation distance
}
