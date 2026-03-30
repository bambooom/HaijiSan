import { SHEET_LAYOUTS } from '../config';
import type { SleepLogEntry } from '../types';
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
}

export const sleepLogRepository = new SleepLogRepository();
