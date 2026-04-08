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
  handleIncomingText: vi.fn(),
  sendChatAction: vi.fn(),
  sendText: vi.fn(),
  appendMessageLog: vi.fn(),
  buildDailySummaryMessage: vi.fn(() => 'digest'),
  installDailyDigestTrigger: vi.fn(),
  disableDailyDigestTrigger: vi.fn(),
  cacheGet: vi.fn(),
  cachePut: vi.fn(),
  cacheRemove: vi.fn(),
  createTextOutput: vi.fn(() => ({ getContent: () => 'ok' })),
}));

vi.mock('./handlers', () => ({
  handleIncomingText: mocks.handleIncomingText,
}));

vi.mock('./services/telegram', () => ({
  sendChatAction: mocks.sendChatAction,
  sendText: mocks.sendText,
}));

vi.mock('./tables', () => ({
  botLogTable: {
    appendMessageLog: mocks.appendMessageLog,
  },
}));

vi.mock('./services/daily-summary', () => ({
  buildDailySummaryMessage: mocks.buildDailySummaryMessage,
}));

vi.mock('./services/digest-trigger', () => ({
  installDailyDigestTrigger: mocks.installDailyDigestTrigger,
  disableDailyDigestTrigger: mocks.disableDailyDigestTrigger,
}));

Object.assign(globalThis, {
  CacheService: {
    getScriptCache: () => ({
      get: mocks.cacheGet,
      put: mocks.cachePut,
      remove: mocks.cacheRemove,
    }),
  },
  ContentService: {
    createTextOutput: mocks.createTextOutput,
  },
});

import { doPost } from './index';

describe('doPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheGet.mockReturnValue(null);
    mocks.handleIncomingText.mockReturnValue({
      reply: '已记录。',
      handlingMode: 'ai',
      status: 'success',
      note: '',
      traceId: 'ai_1',
      intent: 'ai-tool',
      tool: 'insertData',
      confirmationState: 'none',
      resultCode: 'ai-tool-executed',
    });
  });

  it('processes a webhook update once and caches completion by update_id', () => {
    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 123,
          message: {
            message_id: 9,
            chat: { id: 'test-chat-id' },
            text: '今天睡得不太好',
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.cacheGet).toHaveBeenCalledWith('telegram_update:123');
    expect(mocks.cachePut).toHaveBeenNthCalledWith(
      1,
      'telegram_update:123',
      'processing',
      21600,
    );
    expect(mocks.handleIncomingText).toHaveBeenCalledTimes(1);
    expect(mocks.sendText).toHaveBeenCalledWith('test-chat-id', '已记录。');
    expect(mocks.appendMessageLog).toHaveBeenCalledTimes(1);
    expect(mocks.cachePut).toHaveBeenNthCalledWith(
      2,
      'telegram_update:123',
      'done',
      21600,
    );
  });

  it('ignores a duplicate webhook delivery when the update is already cached', () => {
    mocks.cacheGet.mockReturnValue('done');

    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 123,
          message: {
            message_id: 9,
            chat: { id: 'test-chat-id' },
            text: '今天睡得不太好',
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.handleIncomingText).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.appendMessageLog).not.toHaveBeenCalled();
  });

  it('clears the processing marker when business logic fails before completion', () => {
    mocks.handleIncomingText.mockImplementation(() => {
      throw new Error('boom');
    });

    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 456,
          message: {
            message_id: 10,
            chat: { id: 'test-chat-id' },
            text: '今天睡得不太好',
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.cacheRemove).toHaveBeenCalledWith('telegram_update:456');
    expect(mocks.sendText).toHaveBeenCalledWith(
      'test-chat-id',
      '🚨 逻辑故障：\nboom',
    );
  });
});
