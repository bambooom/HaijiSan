import { SHEET_LAYOUTS } from '../config';
import type { JournalFoodItemEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class JournalFoodItemsRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.JOURNAL_FOOD_ITEMS;

  append(entry: JournalFoodItemEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  appendMany(entries: JournalFoodItemEntry[]): void {
    entries.forEach((entry) => this.append(entry));
  }
}

export const journalFoodItemsRepository = new JournalFoodItemsRepository();
