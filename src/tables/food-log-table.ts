import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { FoodLogEntry } from '../types';
import { LogSheetTable } from './log-sheet-table';

export class FoodLogTable extends LogSheetTable<FoodLogEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.FOOD_LOG,
      eventTimeKey: 'occurred_at',
      idPrefix: 'food',
    });
  }
}

export const foodLogTable = new FoodLogTable();
