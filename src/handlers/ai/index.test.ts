import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TelegramInlineKeyboardButton,
  TelegramReplyMarkup,
} from '../../types';

const mocks = vi.hoisted(() => ({
  appConfig: Object.assign(globalThis, {
    __APP_CONFIG__: {
      SHEET_ID: 'test-sheet',
      BOT_TOKEN: 'test-bot-token',
      MY_CHAT_ID: 'test-chat-id',
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_MODEL: 'test-gemini-model',
    },
  }),
  startAiResponse: vi.fn(),
  generateFinalAiReply: vi.fn(),
  executeGenericToolRequest: vi.fn(),
  executeFoodInsertWorkflow: vi.fn(),
  listRecentConversationTurns: vi.fn(
    (): Array<{
      loggedAt: string;
      userText: string;
      assistantText: string;
    }> => [],
  ),
}));

vi.mock('../../services/gemini', () => ({
  startAiResponse: mocks.startAiResponse,
  generateFinalAiReply: mocks.generateFinalAiReply,
}));

vi.mock('../../tools', async () => {
  const actual =
    await vi.importActual<typeof import('../../tools')>('../../tools');

  return {
    ...actual,
    executeGenericToolRequest: mocks.executeGenericToolRequest,
  };
});

vi.mock('../../services/food-workflow', () => ({
  executeFoodInsertWorkflow: mocks.executeFoodInsertWorkflow,
}));

vi.mock('../../tables/bot-log-table', () => ({
  botLogTable: {
    listRecentConversationTurns: mocks.listRecentConversationTurns,
  },
}));

import { handleAiText } from './index';

function getInlineKeyboard(
  replyMarkup: TelegramReplyMarkup | undefined,
): TelegramInlineKeyboardButton[][] | undefined {
  if (!replyMarkup || !('inlineKeyboard' in replyMarkup)) {
    return undefined;
  }

  return replyMarkup.inlineKeyboard;
}

describe('handleAiText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRecentConversationTurns.mockReturnValue([]);
  });

  it('returns direct Gemini replies as ai results', () => {
    mocks.startAiResponse.mockReturnValue({
      mode: 'reply',
      reply: '今天我可以帮你记录或查询。',
      modelContent: {
        role: 'model',
        parts: [{ text: '今天我可以帮你记录或查询。' }],
      },
    });

    const result = handleAiText(
      '你能做什么？',
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.listRecentConversationTurns).toHaveBeenCalledWith(4);
    expect(mocks.startAiResponse).toHaveBeenCalledWith(
      '你能做什么？',
      [],
      new Date('2026-04-08T10:00:00Z'),
    );
    expect(result.handlingMode).toBe('ai');
    expect(result.status).toBe('success');
    expect(result.reply).toContain('记录或查询');
    expect(result.resultCode).toBe('ai-direct-reply');
    expect(result.audit).toEqual({
      toolCallCount: 0,
      readCount: 0,
      insertCount: 0,
      updateCount: 0,
      readSheetNames: [],
      writeSheetNames: [],
      primaryAction: '',
      primaryTargetSheet: '',
      primarySelectorType: '',
      primarySelectorValue: '',
      changedFields: [],
    });
  });

  it('executes valid tool requests and asks Gemini for a final answer', () => {
    const firstTurn = {
      mode: 'tool' as const,
      request: {
        tool: 'readData' as const,
        sheet: 'BOT_LOG' as const,
        selector: {
          type: 'recent' as const,
          limit: 2,
        },
      },
      functionCall: {
        id: 'call-1',
        name: 'readData' as const,
        args: {
          sheet: 'BOT_LOG',
          selectorType: 'recent',
          limit: 2,
        },
      },
      modelContent: {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: 'call-1',
              name: 'readData',
              args: {
                sheet: 'BOT_LOG',
                selectorType: 'recent',
                limit: 2,
              },
            },
          },
        ],
      },
    };

    mocks.startAiResponse.mockReturnValue(firstTurn);
    mocks.executeGenericToolRequest.mockReturnValue({
      tool: 'readData',
      sheet: 'BOT_LOG',
      selector: {
        type: 'recent',
        limit: 2,
      },
      rows: [
        {
          rowNumber: 3,
          record: {
            raw_text: '今天吃了酸奶',
          },
        },
      ],
    });
    mocks.generateFinalAiReply.mockReturnValue('你最近记录里提到了酸奶。');

    const timestamp = new Date('2026-04-08T10:00:00Z');
    mocks.listRecentConversationTurns.mockReturnValue([
      {
        loggedAt: '2026-04-08 09:00:00',
        userText: '昨天早餐吃了酸奶',
        assistantText: '我记住了。',
      },
    ]);
    const result = handleAiText('最近一条消息是什么？', timestamp);

    expect(mocks.executeGenericToolRequest).toHaveBeenCalledTimes(1);
    expect(mocks.startAiResponse).toHaveBeenCalledWith(
      '最近一条消息是什么？',
      [
        {
          loggedAt: '2026-04-08 09:00:00',
          userText: '昨天早餐吃了酸奶',
          assistantText: '我记住了。',
        },
      ],
      timestamp,
    );
    expect(mocks.generateFinalAiReply).toHaveBeenCalledWith({
      userText: '最近一条消息是什么？',
      conversationHistory: [
        {
          loggedAt: '2026-04-08 09:00:00',
          userText: '昨天早餐吃了酸奶',
          assistantText: '我记住了。',
        },
      ],
      referenceTimestamp: timestamp,
      firstTurn,
      toolResult: {
        tool: 'readData',
        sheet: 'BOT_LOG',
        selector: {
          type: 'recent',
          limit: 2,
        },
        rows: [
          {
            rowNumber: 3,
            record: {
              raw_text: '今天吃了酸奶',
            },
          },
        ],
      },
    });
    expect(result.status).toBe('success');
    expect(result.tool).toBe('readData');
    expect(result.reply).toContain('酸奶');
    expect(result.resultCode).toBe('ai-tool-executed');
    expect(result.audit).toEqual({
      toolCallCount: 1,
      readCount: 1,
      insertCount: 0,
      updateCount: 0,
      readSheetNames: ['BOT_LOG'],
      writeSheetNames: [],
      primaryAction: 'readData',
      primaryTargetSheet: 'BOT_LOG',
      primarySelectorType: 'recent',
      primarySelectorValue: 'limit=2',
      changedFields: [],
    });
  });

  it('uses the expanded context window for follow-up style messages', () => {
    mocks.startAiResponse.mockReturnValue({
      mode: 'reply',
      reply: '好的，我们继续。',
      modelContent: {
        role: 'model',
        parts: [{ text: '好的，我们继续。' }],
      },
    });

    handleAiText('按刚才那个继续', new Date('2026-04-08T10:00:00Z'));

    expect(mocks.listRecentConversationTurns).toHaveBeenCalledWith(8);
  });

  it('rejects invalid tool requests before execution', () => {
    mocks.startAiResponse.mockReturnValue({
      mode: 'tool',
      request: {
        tool: 'insertData',
        sheet: 'BOT_LOG',
        record: {
          raw_text: 'test',
        },
      },
      functionCall: {
        id: 'call-1',
        name: 'insertData',
        args: {
          sheet: 'BOT_LOG',
          record: {
            raw_text: 'test',
          },
        },
      },
      modelContent: {
        role: 'model',
        parts: [],
      },
    });

    const result = handleAiText(
      '写一条 bot log',
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(result.status).toBe('failed');
    expect(result.resultCode).toBe('ai-invalid-tool-request');
    expect(result.reply).toContain('工具请求无效');
    expect(mocks.executeGenericToolRequest).not.toHaveBeenCalled();
    expect(mocks.generateFinalAiReply).not.toHaveBeenCalled();
  });

  it('falls back to deterministic tool formatting when the second Gemini call fails', () => {
    mocks.startAiResponse.mockReturnValue({
      mode: 'tool',
      request: {
        tool: 'readData',
        sheet: 'BOT_LOG',
        selector: {
          type: 'recent',
          limit: 1,
        },
      },
      functionCall: {
        name: 'readData',
        args: {
          sheet: 'BOT_LOG',
          selectorType: 'recent',
          limit: 1,
        },
      },
      modelContent: {
        role: 'model',
        parts: [],
      },
    });
    mocks.executeGenericToolRequest.mockReturnValue({
      tool: 'readData',
      sheet: 'BOT_LOG',
      selector: {
        type: 'recent',
        limit: 1,
      },
      rows: [
        {
          rowNumber: 7,
          record: {
            raw_text: 'test',
          },
        },
      ],
    });
    mocks.generateFinalAiReply.mockImplementation(() => {
      throw new Error('Gemini unavailable');
    });

    const result = handleAiText(
      '最近一条消息是什么？',
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(result.status).toBe('success');
    expect(result.resultCode).toBe('ai-tool-executed-final-reply-failed');
    expect(result.reply).toContain('BOT_LOG');
    expect(result.reply).toContain('第 7 行');
  });

  it('uses a human-readable fallback for write operations when the second Gemini call fails', () => {
    mocks.startAiResponse.mockReturnValue({
      mode: 'tool',
      request: {
        tool: 'insertData',
        sheet: 'SLEEP_LOG',
        record: {
          sleep_start_at: '2026-04-08 02:30:00',
          sleep_end_at: '2026-04-08 07:06:00',
          sleep_quality: 'poor',
          source: 'manual',
        },
      },
      functionCall: {
        name: 'insertData',
        args: {
          sheet: 'SLEEP_LOG',
          record: {
            sleep_start_at: '2026-04-08 02:30:00',
            sleep_end_at: '2026-04-08 07:06:00',
            sleep_quality: 'poor',
            source: 'manual',
          },
        },
      },
      modelContent: {
        role: 'model',
        parts: [],
      },
    });
    mocks.executeGenericToolRequest.mockReturnValue({
      tool: 'insertData',
      sheet: 'SLEEP_LOG',
      record: {
        sleep_start_at: '2026-04-08 02:30:00',
        sleep_end_at: '2026-04-08 07:06:00',
        sleep_quality: 'poor',
        source: 'manual',
        sleep_log_id: 'sleep_1',
        logged_at: '2026-04-08 10:00:00',
      },
    });
    mocks.generateFinalAiReply.mockImplementation(() => {
      throw new Error('Gemini unavailable');
    });

    const result = handleAiText(
      '今天的睡眠记录是 2:30-7:06，睡得不太好',
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(result.status).toBe('success');
    expect(result.resultCode).toBe('ai-tool-executed-final-reply-failed');
    expect(result.reply).toBe('已记录睡眠数据。');
    expect(result.reply).not.toContain('{');
  });

  it('routes FOOD_LOG inserts through the dedicated food workflow', () => {
    mocks.startAiResponse.mockReturnValue({
      mode: 'tool',
      request: {
        tool: 'insertFoodLog',
        sheet: 'FOOD_LOG',
        record: {
          occurred_at: '2026-04-08 12:30:00',
          meal_type: 'lunch',
          meal_text: '原味酸奶',
        },
        items: [
          {
            itemName: '原味酸奶',
            quantity: 1,
            unit: 'cup',
          },
        ],
      },
      functionCall: {
        name: 'insertFoodLog',
        args: {
          record: {
            occurred_at: '2026-04-08 12:30:00',
            meal_type: 'lunch',
            meal_text: '原味酸奶',
          },
          items: [
            {
              itemName: '原味酸奶',
              quantity: 1,
              unit: 'cup',
            },
          ],
        },
      },
      modelContent: {
        role: 'model',
        parts: [],
      },
    });
    mocks.executeFoodInsertWorkflow.mockReturnValue({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: {
        food_log_id: 'food_1',
        logged_at: '2026-04-08 10:00:00',
        occurred_at: '2026-04-08 12:30:00',
        meal_type: 'lunch',
        meal_text: '原味酸奶',
        calories_kcal: 96,
        linked_food_ref_ids: 'ref_yogurt',
      },
    });
    mocks.generateFinalAiReply.mockReturnValue('已记录午餐。');

    const result = handleAiText(
      '午餐吃了原味酸奶',
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.executeFoodInsertWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.executeGenericToolRequest).not.toHaveBeenCalled();
    expect(result.status).toBe('success');
    expect(result.reply).toBe('已记录午餐。');
  });

  it('returns a pending stock confirmation when FOOD_LOG stock side effects need review', () => {
    mocks.startAiResponse.mockReturnValue({
      mode: 'tool',
      request: {
        tool: 'insertFoodLog',
        sheet: 'FOOD_LOG',
        record: {
          occurred_at: '2026-04-08 12:30:00',
          meal_type: 'lunch',
          meal_text: '牛奶',
        },
        items: [
          {
            itemName: '牛奶',
            quantity: 250,
            unit: 'ml',
          },
        ],
      },
      functionCall: {
        name: 'insertFoodLog',
        args: {
          record: {
            occurred_at: '2026-04-08 12:30:00',
            meal_type: 'lunch',
            meal_text: '牛奶',
          },
          items: [
            {
              itemName: '牛奶',
              quantity: 250,
              unit: 'ml',
            },
          ],
        },
      },
      modelContent: {
        role: 'model',
        parts: [],
      },
    });
    mocks.executeFoodInsertWorkflow.mockReturnValue({
      insertResult: {
        tool: 'insertData',
        sheet: 'FOOD_LOG',
        record: {
          food_log_id: 'food_1',
          meal_text: '牛奶',
        },
      },
      pendingStockDeduction: {
        foodLogId: 'food_1',
        mealText: '牛奶',
        candidates: [
          {
            itemName: '牛奶',
            itemQuantity: 250,
            itemUnit: 'ml',
            stockItemId: 'stock_milk',
            stockItemName: '牛奶',
            stockQuantity: 0.3,
            stockUnit: 'l',
            reason: 'converted 250 ml to 0.3 l; requires confirmation',
          },
        ],
      },
    });

    const result = handleAiText(
      '午餐喝了 250ml 牛奶',
      new Date('2026-04-08T10:00:00Z'),
      'test-chat-id',
    );

    expect(mocks.generateFinalAiReply).not.toHaveBeenCalled();
    expect(result.confirmationState).toBe('pending');
    expect(result.resultCode).toBe('food-stock-pending');
    const inlineKeyboard = getInlineKeyboard(
      result.telegramResponse?.replyMarkup,
    );

    expect(inlineKeyboard?.[0]?.[0]?.text).toBe('确认扣减');
    expect(inlineKeyboard?.[0]?.[0]?.callbackData).toMatch(/^stock:confirm:/);
    expect(inlineKeyboard?.[0]?.[1]?.text).toBe('取消');
    expect(inlineKeyboard?.[0]?.[1]?.callbackData).toMatch(/^stock:cancel:/);
    expect(inlineKeyboard?.[0]?.[2]?.text).toBe('修正');
    expect(inlineKeyboard?.[0]?.[2]?.callbackData).toMatch(/^stock:edit:/);
  });
});
