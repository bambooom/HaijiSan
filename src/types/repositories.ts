import type { StockEntry } from './records';

export type FoodReference = {
  id: string;
  name: string;
  brand: string;
  servingSize: number | null;
  unit: string;
  calories: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};

export type StockListItem = {
  name: string;
  amount: string;
};

export type StockAdjustResult =
  | {
      ok: true;
      entry: StockEntry;
      quantity: number;
      operation: 'create' | 'adjust' | 'set';
    }
  | {
      ok: false;
      reason:
        | 'invalid-name'
        | 'invalid-quantity'
        | 'not-found'
        | 'negative-stock';
      quantity?: number;
      currentQuantity?: number;
    };
