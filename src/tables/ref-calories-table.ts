import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { FoodReferenceEntry } from '../types';
import { SheetTable } from './sheet-table';

type FoodReferenceRow = {
  rowNumber: number;
  entry: FoodReferenceEntry;
};

export function normalizeFoodName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\[|\]|[()（）【】]/g, ' ')
    .replace(/[\s\u3000]+/g, ' ');
}

export class RefCaloriesTable extends SheetTable<FoodReferenceEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.REF_CALORIES,
      idPrefix: 'ref',
    });
  }

  findEntryRowByFoodName(foodName: string): FoodReferenceRow | null {
    const exactName = foodName.trim();

    if (!exactName) {
      return null;
    }

    const entryRows = this.listEntryRows();
    const exactMatch = entryRows.find(
      ({ entry }) => entry.food_name.trim() === exactName,
    );

    if (exactMatch) {
      return exactMatch;
    }

    const normalizedName = normalizeFoodName(foodName);

    return (
      entryRows.find(
        ({ entry }) => normalizeFoodName(entry.food_name) === normalizedName,
      ) ?? null
    );
  }

  findByFoodName(foodName: string): FoodReferenceEntry | null {
    return this.findEntryRowByFoodName(foodName)?.entry ?? null;
  }
}

export const refCaloriesTable = new RefCaloriesTable();
