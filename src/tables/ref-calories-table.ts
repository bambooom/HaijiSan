import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { FoodReferenceEntry } from '../types';
import { SheetTable } from './sheet-table';

export class RefCaloriesTable extends SheetTable<FoodReferenceEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.REF_CALORIES,
      idPrefix: 'ref',
    });
  }
}

export const refCaloriesTable = new RefCaloriesTable();
