import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('../services/gemini', () => ({
  startAiResponse: mocks.startAiResponse,
  generateFinalAiReply: mocks.generateFinalAiReply,
}));

vi.mock('../tools', async () => {
  const actual = await vi.importActual<typeof import('../tools')>('../tools');

  return {
    ...actual,
    executeGenericToolRequest: mocks.executeGenericToolRequest,
  };
});

import { handleAiText } from './ai';

describe('handleAiText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(result.handlingMode).toBe('ai');
    expect(result.status).toBe('success');
    expect(result.reply).toContain('记录或查询');
    expect(result.resultCode).toBe('ai-direct-reply');
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
    const result = handleAiText('最近一条消息是什么？', timestamp);

    expect(mocks.executeGenericToolRequest).toHaveBeenCalledTimes(1);
    expect(mocks.generateFinalAiReply).toHaveBeenCalledWith({
      userText: '最近一条消息是什么？',
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
});
