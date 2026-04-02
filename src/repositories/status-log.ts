import { SHEET_LAYOUTS } from '../constants/sheets';
import type { StatusLogEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

export class StatusLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.STATUS_LOG;

  private createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'status', timestamp);
  }

  append(entry: StatusLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
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
