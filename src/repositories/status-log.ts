import { SHEET_LAYOUTS } from '../config';
import type { StatusLogEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class StatusLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.STATUS_LOG;

  private createEntryId(timestamp: Date): string {
    return `status_${this.spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
  }

  append(entry: StatusLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  logBowel(timestamp: Date): void {
    this.append({
      entry_id: this.createEntryId(timestamp),
      logged_at: this.spreadsheet.getTimestamp(false, timestamp),
      entry_type: 'bowel',
      value: '4',
      unit: '',
      note: '正常',
      cycle_day: null,
    });
  }
}

export const statusLogRepository = new StatusLogRepository();
