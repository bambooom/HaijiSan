import { SHEET_LAYOUTS } from '../config';
import type { AllLogEntry, HandlingMode, HandlingStatus } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class AllLogsRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.ALL_LOGS;

  append(entry: AllLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  /**
   * Records a parsed inbound message in the shared log sheet.
   */
  appendMessageLog(
    timestamp: Date,
    text: string,
    handlingMode: HandlingMode = 'command',
    status: HandlingStatus = 'success',
    note = '',
  ): void {
    this.append({
      logged_at: this.spreadsheet.getTimestamp(true, timestamp),
      raw_text: text,
      handling_mode: handlingMode,
      status,
      note,
    });
  }
}

export const allLogsRepository = new AllLogsRepository();
