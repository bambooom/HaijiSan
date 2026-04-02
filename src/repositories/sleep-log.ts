import { SHEET_LAYOUTS } from '../constants/sheets';
import type { HealthDataSource, SleepLogEntry, SleepQuality } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

export class SleepLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.SLEEP_LOG;

  createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'sleep', timestamp);
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
    source: HealthDataSource = 'manual',
  ): void {
    this.append({
      sleep_log_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      sleep_start_at: formatLoggedAt(this.spreadsheet, sleepStartAt),
      sleep_end_at: formatLoggedAt(this.spreadsheet, sleepEndAt),
      sleep_hours: sleepHours,
      sleep_quality: sleepQuality,
      source,
      note,
    });
  }
}

export const sleepLogRepository = new SleepLogRepository();
