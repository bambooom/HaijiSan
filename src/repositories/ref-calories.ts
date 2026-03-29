import { SHEET_LAYOUTS } from '../config';
import type { FoodReferenceEntry } from '../types';
import {
  spreadsheetService,
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

  append(entry: FoodReferenceEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  /**
   * Finds a food reference by fuzzy name match.
   */
  findByKeyword(keyword: string): FoodReference | null {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
      return null;
    }

    const result = this.spreadsheet.getRows(this.layout.name).find((row) => {
      const name = String(row[1] ?? '')
        .trim()
        .toLowerCase();
      return name.includes(normalizedKeyword);
    });

    if (!result) {
      return null;
    }

    return {
      id: String(result[0] ?? ''),
      name: String(result[1] ?? ''),
      brand: String(result[2] ?? ''),
      unit: String(result[4] ?? ''),
      calories: Number(result[5]),
    };
  }
}

export const refCaloriesRepository = new RefCaloriesRepository();
