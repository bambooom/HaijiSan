import { SHEET_LAYOUTS } from '../config';
import type { StatusBodyEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class StatusBodyRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.STATUS_BODY;

  private createEntryId(timestamp: Date): string {
    return `body_${this.spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
  }

  append(entry: StatusBodyEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  /**
   * Records a body weight entry.
   */
  logWeight(timestamp: Date, weight: string): void {
    this.append({
      entry_id: this.createEntryId(timestamp),
      logged_at: this.spreadsheet.getTimestamp(false, timestamp),
      entry_type: 'weight',
      value: Number(weight),
      unit: 'kg',
      note: '',
      cycle_day: null,
      sleep_start_at: '',
      sleep_end_at: '',
      sleep_hours: null,
    });
  }

  /**
   * Records a metabolism entry using the current sheet layout.
   */
  logMetabolism(timestamp: Date): void {
    this.append({
      entry_id: this.createEntryId(timestamp),
      logged_at: this.spreadsheet.getTimestamp(false, timestamp),
      entry_type: 'bowel',
      value: '4',
      unit: '',
      note: '正常',
      cycle_day: null,
      sleep_start_at: '',
      sleep_end_at: '',
      sleep_hours: null,
    });
  }
}

export const statusBodyRepository = new StatusBodyRepository();
