import { SHEET_LAYOUTS } from '../constants/sheets';
import type { FoodReference, FoodReferenceEntry, SheetRow } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

export class RefCaloriesRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.REF_CALORIES;

  createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'ref', timestamp);
  }

  private mapRow(row: SheetRow): FoodReference {
    return {
      id: String(row[0] ?? ''),
      name: String(row[1] ?? ''),
      brand: String(row[2] ?? ''),
      servingSize: row[3] === '' ? null : Number(row[3]),
      unit: String(row[4] ?? ''),
      calories: row[5] === '' ? 0 : Number(row[5]),
      protein: row[6] === '' ? null : Number(row[6]),
      fat: row[7] === '' ? null : Number(row[7]),
      carbs: row[8] === '' ? null : Number(row[8]),
    };
  }

  findByIds(ids: string[]): FoodReference[] {
    const normalizedIds = new Set(ids.map((id) => id.trim()).filter(Boolean));

    if (normalizedIds.size === 0) {
      return [];
    }

    return this.spreadsheet
      .getDataRows(this.layout.name)
      .filter(({ values }) => normalizedIds.has(String(values[0] ?? '').trim()))
      .map(({ values }) => this.mapRow(values));
  }

  append(entry: FoodReferenceEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  logReference(
    timestamp: Date,
    entry: {
      foodName: string;
      brand?: string;
      servingSize?: number | null;
      servingUnit?: string;
      caloriesKcal?: number | null;
      proteinG?: number | null;
      fatG?: number | null;
      carbsG?: number | null;
      source?: FoodReferenceEntry['source'];
      note?: string;
    },
  ): FoodReferenceEntry {
    const record: FoodReferenceEntry = {
      food_ref_id: this.createEntryId(timestamp),
      food_name: entry.foodName,
      brand: entry.brand ?? '',
      serving_size: entry.servingSize ?? null,
      serving_unit: entry.servingUnit ?? '',
      calories_kcal: entry.caloriesKcal ?? null,
      protein_g: entry.proteinG ?? null,
      fat_g: entry.fatG ?? null,
      carbs_g: entry.carbsG ?? null,
      source: entry.source ?? 'manual_entry',
      updated_at: formatLoggedAt(this.spreadsheet, timestamp),
      note: entry.note ?? '',
    };

    this.append(record);

    return record;
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
