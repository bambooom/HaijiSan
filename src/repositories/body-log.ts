import { SHEET_LAYOUTS } from '../config';
import type { BodyLogEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class BodyLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.BODY_LOG;

  createEntryId(timestamp: Date): string {
    return `body_${this.spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
  }

  append(entry: BodyLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  logWeight(timestamp: Date, weight: string): void {
    this.append({
      body_log_id: this.createEntryId(timestamp),
      logged_at: this.spreadsheet.getTimestamp(false, timestamp),
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