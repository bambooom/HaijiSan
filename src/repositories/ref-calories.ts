import { SHEET_LAYOUTS } from '../config';
import type { FoodReferenceEntry } from '../types';
import {
  spreadsheetService,
  type SheetRow,
  type SpreadsheetService,
} from '../services/spreadsheet';

export type FoodReference = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  calories: number;
};

export class RefCaloriesRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.REF_CALORIES;

  private mapRow(row: SheetRow): FoodReference {
    return {
      id: String(row[0] ?? ''),
      name: String(row[1] ?? ''),
      brand: String(row[2] ?? ''),
      unit: String(row[4] ?? ''),
      calories: row[5] === '' ? 0 : Number(row[5]),
    };
  }

  append(entry: FoodReferenceEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  findById(foodRefId: string): FoodReference | null {
    const normalizedFoodRefId = foodRefId.trim();

    if (!normalizedFoodRefId) {
      return null;
    }

    const result = this.spreadsheet
      .getDataRows(this.layout.name)
      .find(({ values }) => {
        return String(values[0] ?? '').trim() === normalizedFoodRefId;
      });

    return result ? this.mapRow(result.values) : null;
  }

  /**
   * Finds a food reference by fuzzy name match.
   */
  findByKeyword(keyword: string): FoodReference | null {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
      return null;
    }

    const result = this.spreadsheet
      .getDataRows(this.layout.name)
      .find(({ values }) => {
        const name = String(values[1] ?? '')
          .trim()
          .toLowerCase();
        return name.includes(normalizedKeyword);
      });

    if (!result) {
      return null;
    }

    return this.mapRow(result.values);
  }
}

export const refCaloriesRepository = new RefCaloriesRepository();
