import { SHEET_LAYOUTS } from '../config';
import type { SleepLogEntry, SleepQuality } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class SleepLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.SLEEP_LOG;

  createEntryId(timestamp: Date): string {
    return `sleep_${this.spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
  }

  append(entry: SleepLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  logSleep(
    timestamp: Date,
    sleepStartAt: Date,
    sleepEndAt: Date,
    sleepHours: number,
    sleepQuality: SleepQuality,
    note = '',
  ): void {
    this.append({
      sleep_log_id: this.createEntryId(timestamp),
      logged_at: this.spreadsheet.getTimestamp(false, timestamp),
      sleep_start_at: this.spreadsheet.getTimestamp(false, sleepStartAt),
      sleep_end_at: this.spreadsheet.getTimestamp(false, sleepEndAt),
      sleep_hours: sleepHours,
      sleep_quality: sleepQuality,
      source: 'manual',
      note,
    });
  }
}

export const sleepLogRepository = new SleepLogRepository();
