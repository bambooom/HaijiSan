import { SHEET_LAYOUTS } from '../config';
import type { FoodItemEntry, SheetRow } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class FoodItemsRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.FOOD_ITEMS;

  private mapRow(row: SheetRow): FoodItemEntry {
    return {
      parent_food_log_id: String(row[0] ?? ''),
      item_name: String(row[1] ?? ''),
      quantity: row[2] === '' ? null : Number(row[2]),
      unit: String(row[3] ?? ''),
      estimated_calories: row[4] === '' ? null : Number(row[4]),
      linked_food_ref_id: String(row[5] ?? ''),
      linked_stock_item_id: String(row[6] ?? ''),
      ai_confidence: row[7] === '' ? null : Number(row[7]),
      note: String(row[8] ?? ''),
    };
  }

  append(entry: FoodItemEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  appendMany(entries: FoodItemEntry[]): void {
    entries.forEach((entry) => this.append(entry));
  }

  listByFoodLogId(foodLogId: string): FoodItemEntry[] {
    const normalizedFoodLogId = foodLogId.trim();

    if (!normalizedFoodLogId) {
      return [];
    }

    return this.spreadsheet
      .getDataRows(this.layout.name)
      .filter(
        ({ values }) => String(values[0] ?? '').trim() === normalizedFoodLogId,
      )
      .map(({ values }) => this.mapRow(values));
  }
}

export const foodItemsRepository = new FoodItemsRepository();
