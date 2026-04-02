import { SHEET_LAYOUTS } from '../constants/sheets';
import type { StatusLogEntry } from '../types';
import type { SheetRow } from '../types';
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

  return '';
}

export class StatusLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.STATUS_LOG;

  private mapRow(row: SheetRow): StatusLogEntry {
    return {
      entry_id: asStringCell(row[0]),
      logged_at: asStringCell(row[1]),
      entry_type: row[2] as StatusLogEntry['entry_type'],
      value: row[3] === '' ? '' : (row[3] as StatusLogEntry['value']),
      unit: asStringCell(row[4]),
      note: asStringCell(row[5]),
      cycle_day: row[6] === '' ? null : Number(row[6]),
    };
  }

  private createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'status', timestamp);
  }

  append(entry: StatusLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  listByDate(date: Date): StatusLogEntry[] {
    const datePrefix = this.spreadsheet.getTimestamp(false, date).slice(0, 10);

    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter(
        (entry) =>
          entry.entry_id.trim() !== '' &&
          entry.logged_at.startsWith(datePrefix),
      )
      .sort((left, right) => left.logged_at.localeCompare(right.logged_at));
  }

  listRecent(limit: number = 7): StatusLogEntry[] {
    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter((entry) => entry.entry_id.trim() !== '')
      .sort((left, right) => right.logged_at.localeCompare(left.logged_at))
      .slice(0, limit);
  }

  logEntry(
    timestamp: Date,
    entry: {
      entryType: StatusLogEntry['entry_type'];
      value: string | number;
      unit?: string;
      note?: string;
      cycleDay?: number | null;
    },
  ): StatusLogEntry {
    const record: StatusLogEntry = {
      entry_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      entry_type: entry.entryType,
      value: entry.value,
      unit: entry.unit ?? '',
      note: entry.note ?? '',
      cycle_day: entry.cycleDay ?? null,
    };

    this.append(record);

    return record;
  }

  logBowel(timestamp: Date): void {
    this.logEntry(timestamp, {
      entryType: 'bowel',
      value: '4',
      note: '正常',
    });
  }

  logMenstruation(
    timestamp: Date,
    cycleDay: number | null = null,
    note = '',
  ): void {
    this.logEntry(timestamp, {
      entryType: 'menstruation',
      value: 'start',
      note,
      cycleDay,
    });
  }

  logSymptom(
    timestamp: Date,
    symptom: string,
    note = '',
    cycleDay: number | null = null,
  ): void {
    this.logEntry(timestamp, {
      entryType: 'symptom',
      value: symptom,
      note,
      cycleDay,
    });
  }
}

export const statusLogRepository = new StatusLogRepository();
