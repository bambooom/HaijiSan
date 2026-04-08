import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(globalThis, {
    __APP_CONFIG__: {
      SHEET_ID: 'test-sheet',
      BOT_TOKEN: 'test-bot-token',
      MY_CHAT_ID: 'test-chat-id',
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_MODEL: 'test-gemini-model',
    },
  });
});

import { spreadsheetService } from '../services/spreadsheet';
import { botLogTable } from './bot-log-table';

describe('botLogTable.appendMessageLog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('persists structured audit fields from the handling result', () => {
    const insertSpy = vi
      .spyOn(botLogTable, 'insert')
      .mockImplementation(() => {});
    vi.spyOn(spreadsheetService, 'getTimestamp').mockReturnValue(
      '2026-04-08 12:00:00.123',
    );

    botLogTable.appendMessageLog(
      new Date('2026-04-08T12:00:00Z'),
      '最近吃了什么？',
      {
        reply: '你最近记录里提到了酸奶。',
        handlingMode: 'ai',
        status: 'success',
        note: 'readData FOOD_LOG',
        traceId: 'ai_1',
        intent: 'ai-tool',
        tool: 'readData',
        confirmationState: 'none',
        resultCode: 'ai-tool-executed',
        audit: {
          toolCallCount: 1,
          readCount: 1,
          insertCount: 0,
          updateCount: 0,
          readSheetNames: ['FOOD_LOG'],
          writeSheetNames: [],
          primaryAction: 'readData',
          primaryTargetSheet: 'FOOD_LOG',
          primarySelectorType: 'recent',
          primarySelectorValue: 'limit=3',
          changedFields: [],
        },
      },
    );

    expect(insertSpy).toHaveBeenCalledWith({
      logged_at: '2026-04-08 12:00:00.123',
      raw_text: '最近吃了什么？',
      final_reply: '你最近记录里提到了酸奶。',
      handling_mode: 'ai',
      status: 'success',
      trace_id: 'ai_1',
      tool_call_count: 1,
      read_count: 1,
      insert_count: 0,
      update_count: 0,
      read_sheet_names: 'FOOD_LOG',
      write_sheet_names: '',
      primary_action: 'readData',
      primary_target_sheet: 'FOOD_LOG',
      primary_selector_type: 'recent',
      primary_selector_value: 'limit=3',
      changed_fields: '',
      action_summary: 'readData FOOD_LOG',
      result_code: 'ai-tool-executed',
      note: 'readData FOOD_LOG',
    });
  });
});
