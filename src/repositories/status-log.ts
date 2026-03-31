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

  logBowel(timestamp: Date): void {
    this.append({
      entry_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      entry_type: 'bowel',
      value: '4',
      unit: '',
      note: '正常',
      cycle_day: null,
    });
  }

  logMenstruation(
    timestamp: Date,
    cycleDay: number | null = null,
    note = '',
  ): void {
    this.append({
      entry_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      entry_type: 'menstruation',
      value: 'start',
      unit: '',
      note,
      cycle_day: cycleDay,
    });
  }

  logSymptom(
    timestamp: Date,
    symptom: string,
    note = '',
    cycleDay: number | null = null,
  ): void {
    this.append({
      entry_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      entry_type: 'symptom',
      value: symptom,
      unit: '',
      note,
      cycle_day: cycleDay,
    });
  }
}

export const statusLogRepository = new StatusLogRepository();
