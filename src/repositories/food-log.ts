import { SHEET_LAYOUTS } from '../constants/sheets';
import type { FoodLogEntry, ParseStatus, SheetRow } from '../types';
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
      estimated_calories: row[4] === '' ? null : Number(row[4]),
      parse_status: row[5] as ParseStatus,
      note: formatSheetCellAsString(this.spreadsheet, row[6] ?? null),
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
