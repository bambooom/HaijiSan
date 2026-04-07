import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { BotLogEntry, CommandHandlingResult } from '../types';
import { SheetTable } from './sheet-table';

export class BotLogTable extends SheetTable<BotLogEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.BOT_LOG,
    });
  }

  appendMessageLog(
    timestamp: Date,
    text: string,
    result: CommandHandlingResult,
  ): void {
    const toolCallCount = result.tool.trim() ? 1 : 0;

    this.insert({
      logged_at: this['spreadsheet'].getTimestamp(true, timestamp),
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

export const botLogTable = new BotLogTable();
