import { SHEET_LAYOUTS } from '../constants/sheets';
import type { SheetRow } from '../types';
import type { HealthDataSource, SleepLogEntry, SleepQuality } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

function asStringCell(value: SheetRow[number]): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return '';
}

export class SleepLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.SLEEP_LOG;

  private mapRow(row: SheetRow): SleepLogEntry {
    return {
      sleep_log_id: asStringCell(row[0]),
      logged_at: asStringCell(row[1]),
      sleep_start_at: asStringCell(row[2]),
      sleep_end_at: asStringCell(row[3]),
      sleep_hours: row[4] === '' ? null : Number(row[4]),
      sleep_quality: row[5] as SleepLogEntry['sleep_quality'],
      source: row[6] as SleepLogEntry['source'],
      note: asStringCell(row[7]),
    };
  }

  createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'sleep', timestamp);
  }

  append(entry: SleepLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  listByDate(date: Date): SleepLogEntry[] {
    const datePrefix = this.spreadsheet.getTimestamp(false, date).slice(0, 10);

    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter(
        (entry) =>
          entry.sleep_log_id.trim() !== '' &&
          entry.logged_at.startsWith(datePrefix),
      )
      .sort((left, right) => left.logged_at.localeCompare(right.logged_at));
  }

  listRecent(limit: number = 7): SleepLogEntry[] {
    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter((entry) => entry.sleep_log_id.trim() !== '')
      .sort((left, right) => right.logged_at.localeCompare(left.logged_at))
      .slice(0, limit);
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
