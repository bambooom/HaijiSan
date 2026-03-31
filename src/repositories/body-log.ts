import { SHEET_LAYOUTS } from '../constants/sheets';
import type { BodyLogEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

export class BodyLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.BODY_LOG;

  createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'body', timestamp);
  }

  append(entry: BodyLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  logWeight(timestamp: Date, weight: string): void {
    this.append({
      body_log_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      weight_kg: Number(weight),
      bmi: null,
      body_fat_pct: null,
      lean_body_mass_kg: null,
      source: 'manual',
      note: '',
    });
  }
}

export const bodyLogRepository = new BodyLogRepository();
