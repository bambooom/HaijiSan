import { SHEET_LAYOUTS } from '../config';
import type { FoodReference, FoodReferenceEntry, SheetRow } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

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
      servingSize: row[3] === '' ? null : Number(row[3]),
      unit: String(row[4] ?? ''),
      calories: row[5] === '' ? 0 : Number(row[5]),
    };
  }

  append(entry: FoodReferenceEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  listAll(): FoodReference[] {
    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter((item) => item.id.trim() !== '' && item.name.trim() !== '');
  }

  searchByKeyword(keyword: string): FoodReference[] {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
      return [];
    }

    return this.spreadsheet
      .getDataRows(this.layout.name)
      .filter(({ values }) => {
        const name = String(values[1] ?? '')
          .trim()
          .toLowerCase();
        const brand = String(values[2] ?? '')
          .trim()
          .toLowerCase();

        return (
          name.includes(normalizedKeyword) || brand.includes(normalizedKeyword)
        );
      })
      .map(({ values }) => this.mapRow(values));
  }
}

export const refCaloriesRepository = new RefCaloriesRepository();
