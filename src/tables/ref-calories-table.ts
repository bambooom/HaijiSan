import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { FoodReferenceEntry } from '../types';
import { SheetTable } from './sheet-table';

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

  findByFoodName(foodName: string): FoodReferenceEntry | null {
    const exactName = foodName.trim();

    if (!exactName) {
      return null;
    }

    const entries = this.listEntries();
    const exactMatch = entries.find(
      (entry) => entry.food_name.trim() === exactName,
    );

    if (exactMatch) {
      return exactMatch;
    }

    const normalizedName = normalizeFoodName(foodName);

    return (
      entries.find(
        (entry) => normalizeFoodName(entry.food_name) === normalizedName,
      ) ?? null
    );
  }
}

export const refCaloriesTable = new RefCaloriesTable();
