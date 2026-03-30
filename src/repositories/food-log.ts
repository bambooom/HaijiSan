import { SHEET_LAYOUTS } from '../config';
import type { FoodLogEntry, ParseStatus } from '../types';
import {
  spreadsheetService,
  type SheetRow,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class FoodLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.FOOD_LOG;

  private readonly fields = this.layout.fields;

  private mapRow(row: SheetRow): FoodLogEntry {
    return {
      food_log_id: String(row[0] ?? ''),
      logged_at: String(row[1] ?? ''),
      meal_type: String(row[2] ?? '') as FoodLogEntry['meal_type'],
      meal_text: String(row[3] ?? ''),
      estimated_calories: row[4] === '' ? null : Number(row[4]),
      parse_status: String(row[5] ?? '') as ParseStatus,
      note: String(row[6] ?? ''),
    };
  }

  createEntryId(timestamp: Date): string {
    return `food_${this.spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
  }

  append(entry: FoodLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.fields, entry);
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
      logged_at: this.spreadsheet.getTimestamp(false, timestamp),
      meal_type: mealType,
      meal_text: mealText,
      estimated_calories: estimatedCalories,
      parse_status: parseStatus,
      note,
    };
  }

  findById(foodLogId: string): FoodLogEntry | null {
    const normalizedFoodLogId = foodLogId.trim();

    if (!normalizedFoodLogId) {
      return null;
    }

    const matchedRow = this.spreadsheet
      .getDataRows(this.layout.name)
      .find(({ values }) => {
        return String(values[0] ?? '').trim() === normalizedFoodLogId;
      });

    return matchedRow ? this.mapRow(matchedRow.values) : null;
  }

  markParseStatus(
    foodLogId: string,
    parseStatus: ParseStatus,
    updates: {
      estimatedCalories?: number | null;
      note?: string;
    } = {},
  ): boolean {
    const normalizedFoodLogId = foodLogId.trim();

    if (!normalizedFoodLogId) {
      return false;
    }

    const matchedRow = this.spreadsheet
      .getDataRows(this.layout.name)
      .find(({ values }) => {
        return String(values[0] ?? '').trim() === normalizedFoodLogId;
      });

    if (!matchedRow) {
      return false;
    }

    const nextUpdates: Partial<FoodLogEntry> = {
      parse_status: parseStatus,
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'estimatedCalories')) {
      nextUpdates.estimated_calories = updates.estimatedCalories;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'note')) {
      nextUpdates.note = updates.note;
    }

    this.spreadsheet.updateRecordAtRow(
      this.layout.name,
      this.fields,
      matchedRow.rowNumber,
      nextUpdates,
    );

    return true;
  }
}

export const foodLogRepository = new FoodLogRepository();
