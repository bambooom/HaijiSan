import { SHEET_LAYOUTS } from '../constants/sheets';
import type { FoodLogEntry, SheetRow } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import {
  createTimestampedEntryId,
  formatLoggedAt,
  formatSheetCellAsString,
} from '../shared/records';
import { matchesRecordDate } from '../shared/date-reference';

export class FoodLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.FOOD_LOG;

  private readonly fields = this.layout.fields;

  private mapRow(row: SheetRow): FoodLogEntry {
    return {
      food_log_id: formatSheetCellAsString(this.spreadsheet, row[0] ?? null),
      logged_at: formatSheetCellAsString(this.spreadsheet, row[1] ?? null),
      meal_type: row[2] as FoodLogEntry['meal_type'],
      meal_text: formatSheetCellAsString(this.spreadsheet, row[3] ?? null),
      calories_kcal: row[4] === '' ? null : Number(row[4]),
      protein_g: row[5] === '' ? null : Number(row[5]),
      fat_g: row[6] === '' ? null : Number(row[6]),
      carbs_g: row[7] === '' ? null : Number(row[7]),
      vegetable_g: row[8] === '' ? null : Number(row[8]),
      linked_food_ref_ids: formatSheetCellAsString(
        this.spreadsheet,
        row[9] ?? null,
      ),
      linked_stock_item_ids: formatSheetCellAsString(
        this.spreadsheet,
        row[10] ?? null,
      ),
      note: formatSheetCellAsString(this.spreadsheet, row[11] ?? null),
    };
  }

  createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'food', timestamp);
  }

  append(entry: FoodLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.fields, entry);
  }

  listByDate(date: Date): FoodLogEntry[] {
    const datePrefix = this.spreadsheet.getTimestamp(false, date).slice(0, 10);

    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter((entry) =>
        matchesRecordDate(entry.logged_at, entry.note, datePrefix),
      )
      .filter((entry) => entry.food_log_id.trim() !== '');
  }

  listRecent(referenceDate: Date, limit: number = 5): FoodLogEntry[] {
    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter((entry) => entry.food_log_id.trim() !== '')
      .filter(
        (entry) =>
          new Date(entry.logged_at).getTime() <= referenceDate.getTime(),
      )
      .sort((left, right) => right.logged_at.localeCompare(left.logged_at))
      .slice(0, limit);
  }

  createMealEntry(
    timestamp: Date,
    mealType: FoodLogEntry['meal_type'],
    mealText: string,
    caloriesKcal: number | null = null,
    proteinG: number | null = null,
    fatG: number | null = null,
    carbsG: number | null = null,
    vegetableG: number | null = null,
    linkedFoodRefIds = '',
    linkedStockItemIds = '',
    note = '',
  ): FoodLogEntry {
    return {
      food_log_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      meal_type: mealType,
      meal_text: mealText,
      calories_kcal: caloriesKcal,
      protein_g: proteinG,
      fat_g: fatG,
      carbs_g: carbsG,
      vegetable_g: vegetableG,
      linked_food_ref_ids: linkedFoodRefIds,
      linked_stock_item_ids: linkedStockItemIds,
      note,
    };
  }
}

export const foodLogRepository = new FoodLogRepository();
