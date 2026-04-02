import { SHEET_LAYOUTS } from '../constants/sheets';
import type { FoodLogEntry, ParseStatus } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

export class FoodLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.FOOD_LOG;

  private readonly fields = this.layout.fields;

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
      .filter(({ values }) => String(values[1] ?? '').startsWith(datePrefix))
      .map(({ values }) => ({
        food_log_id: String(values[0] ?? ''),
        logged_at: String(values[1] ?? ''),
        meal_type: values[2] as FoodLogEntry['meal_type'],
        meal_text: String(values[3] ?? ''),
        estimated_calories: values[4] === '' ? null : Number(values[4]),
        parse_status: values[5] as ParseStatus,
        note: String(values[6] ?? ''),
      }))
      .filter((entry) => entry.food_log_id.trim() !== '');
  }

  createMealEntry(
    timestamp: Date,
    mealType: FoodLogEntry['meal_type'],
    mealText: string,
    estimatedCalories: number | null = null,
    parseStatus: ParseStatus = 'pending',
    note = '',
  ): FoodLogEntry {
    return {
      food_log_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      meal_type: mealType,
      meal_text: mealText,
      estimated_calories: estimatedCalories,
      parse_status: parseStatus,
      note,
    };
  }
}

export const foodLogRepository = new FoodLogRepository();
