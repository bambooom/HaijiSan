import { SHEET_LAYOUTS } from '../config';
import type { FoodLogEntry, ParseStatus } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class FoodLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.FOOD_LOG;

  createEntryId(timestamp: Date): string {
    return `food_${this.spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
  }

  append(entry: FoodLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
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
}

export const foodLogRepository = new FoodLogRepository();
