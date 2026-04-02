import { SHEET_LAYOUTS } from '../constants/sheets';
import type { BotLogEntry, CommandHandlingResult } from '../types';
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
    result: CommandHandlingResult,
  ): void {
    this.append({
      logged_at: this.spreadsheet.getTimestamp(true, timestamp),
      raw_text: text,
      handling_mode: result.handlingMode,
      status: result.status,
      trace_id: result.traceId,
      intent: result.intent,
      tool: result.tool,
      confirmation_state: result.confirmationState,
      result_code: result.resultCode,
      note: result.note,
    });
  }
}

export const botLogRepository = new BotLogRepository();
