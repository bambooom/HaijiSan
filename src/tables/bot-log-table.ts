import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type {
  BotLogEntry,
  CommandHandlingResult,
  ConversationTurn,
} from '../types';
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
    const audit = result.audit ?? {
      toolCallCount: result.tool.trim() ? 1 : 0,
      readCount: 0,
      insertCount: 0,
      updateCount: 0,
      readSheetNames: [],
      writeSheetNames: [],
      primaryAction: result.tool,
      primaryTargetSheet: '',
      primarySelectorType: '',
      primarySelectorValue: '',
      changedFields: [],
    };

    this.insert({
      logged_at: this['spreadsheet'].getTimestamp(true, timestamp),
      raw_text: text,
      final_reply: result.reply,
      handling_mode: result.handlingMode,
      status: result.status,
      trace_id: result.traceId,
      tool_call_count: audit.toolCallCount,
      read_count: audit.readCount,
      insert_count: audit.insertCount,
      update_count: audit.updateCount,
      read_sheet_names: audit.readSheetNames.join(','),
      write_sheet_names: audit.writeSheetNames.join(','),
      primary_action: audit.primaryAction,
      primary_target_sheet: audit.primaryTargetSheet,
      primary_selector_type: audit.primarySelectorType,
      primary_selector_value: audit.primarySelectorValue,
      changed_fields: audit.changedFields.join(','),
      action_summary: result.note,
      result_code: result.resultCode,
      note: result.note,
    });
  }

  listRecentConversationTurns(limit: number): ConversationTurn[] {
    if (limit <= 0) {
      return [];
    }

    return this.listEntries()
      .filter((entry) => entry.raw_text.trim() || entry.final_reply.trim())
      .slice(-limit)
      .map((entry) => ({
        loggedAt: entry.logged_at,
        userText: entry.raw_text,
        assistantText: entry.final_reply,
      }));
  }
}

export const botLogTable = new BotLogTable();
