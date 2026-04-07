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
    const toolCallCount = result.tool.trim() ? 1 : 0;

    this.append({
      logged_at: this.spreadsheet.getTimestamp(true, timestamp),
      raw_text: text,
      final_reply: result.reply,
      handling_mode: result.handlingMode,
      status: result.status,
      trace_id: result.traceId,
      tool_call_count: toolCallCount,
      read_count: 0,
      insert_count: 0,
      update_count: 0,
      read_sheet_names: '',
      write_sheet_names: '',
      primary_action: result.tool,
      primary_target_sheet: '',
      primary_selector_type: '',
      primary_selector_value: '',
      changed_fields: '',
      action_summary: result.note,
      result_code: result.resultCode,
      note: result.note,
    });
  }
}

export const botLogRepository = new BotLogRepository();
