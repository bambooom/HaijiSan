import { SHEET_LAYOUTS } from '../constants/sheets';
import type { BotLogEntry, HandlingMode, HandlingStatus } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class BotLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.BOT_LOG;

  append(entry: BotLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

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

export const botLogRepository = new BotLogRepository();
