import { SHEET_LAYOUTS } from '../config';
import type { FoodItemEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class FoodItemsRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.FOOD_ITEMS;

  append(entry: FoodItemEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  appendMany(entries: FoodItemEntry[]): void {
    entries.forEach((entry) => this.append(entry));
  }
}

export const foodItemsRepository = new FoodItemsRepository();
