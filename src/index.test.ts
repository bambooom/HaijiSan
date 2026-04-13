import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandHandlingResult } from './types';
import type { ShortcutRequestPayload } from './services/shortcuts';

const mocks = vi.hoisted(() => ({
  appConfig: Object.assign(globalThis, {
    __APP_CONFIG__: {
      SHEET_ID: 'test-sheet',
      BOT_TOKEN: 'test-bot-token',
      MY_CHAT_ID: 'test-chat-id',
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_MODEL: 'test-gemini-model',
      X_HAIJI_SECRET: 'shortcut-secret',
    },
  }),
  handleIncomingText: vi.fn(),
  handleIncomingImageMessage: vi.fn(),
  enqueueImageOcrJob: vi.fn(),
  handleConfirmationCallback: vi.fn(),
  handleConfirmationReply: vi.fn(),
  attachConfirmationPreviewMessage: vi.fn(),
  sendChatAction: vi.fn(),
  sendText: vi.fn(),
  appendMessageLog: vi.fn(),
  cacheGet: vi.fn(),
  cachePut: vi.fn(),
  cacheRemove: vi.fn(),
  buildDailySummaryMessage: vi.fn(() => 'digest'),
  buildDailySummaryHtmlMessage: vi.fn(() => '<b>digest</b>'),
  installDailyDigestTrigger: vi.fn(),
  disableDailyDigestTrigger: vi.fn(),
  createHtmlOutput: vi.fn(() => ({ getContent: () => 'ok' })),
  parseShortcutPayload: vi.fn<
    (contents: string | undefined) => ShortcutRequestPayload | null
  >(() => null),
  buildShortcutRawLogText: vi.fn(
    () => '[ios_shortcut] weight=1; bmi=1; bfp=1; lbm=1; sleep=1',
  ),
  hasValidShortcutSecret: vi.fn(() => false),
  ingestShortcutPayload:
    vi.fn<
      (
        payload: ShortcutRequestPayload,
        timestamp?: Date,
      ) => CommandHandlingResult
    >(),
}));

vi.mock('./handlers', () => ({
  handleIncomingText: mocks.handleIncomingText,
  handleIncomingImageMessage: mocks.handleIncomingImageMessage,
}));

vi.mock('./services/ocr/queue', () => ({
  enqueueImageOcrJob: mocks.enqueueImageOcrJob,
  processPendingImageOcrJobs: vi.fn(),
}));

vi.mock('./services/confirmation', () => ({
  handleConfirmationCallback: mocks.handleConfirmationCallback,
  handleConfirmationReply: mocks.handleConfirmationReply,
  attachConfirmationPreviewMessage: mocks.attachConfirmationPreviewMessage,
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

vi.mock('./services/daily/summary', () => ({
  buildDailySummaryMessage: mocks.buildDailySummaryMessage,
  buildDailySummaryHtmlMessage: mocks.buildDailySummaryHtmlMessage,
}));

vi.mock('./services/daily/trigger', () => ({
  installDailyDigestTrigger: mocks.installDailyDigestTrigger,
  disableDailyDigestTrigger: mocks.disableDailyDigestTrigger,
}));

vi.mock('./services/shortcuts', () => ({
  parseShortcutPayload: mocks.parseShortcutPayload,
  buildShortcutRawLogText: mocks.buildShortcutRawLogText,
  hasValidShortcutSecret: mocks.hasValidShortcutSecret,
  ingestShortcutPayload: mocks.ingestShortcutPayload,
}));

Object.assign(globalThis, {
  HtmlService: {
    createHtmlOutput: mocks.createHtmlOutput,
  },
  CacheService: {
    getScriptCache: () => ({
      get: mocks.cacheGet,
      put: mocks.cachePut,
      remove: mocks.cacheRemove,
    }),
  },
});

import { doPost } from './index';

function getAppendMessageLogResult(callIndex: number): {
  note?: string;
  resultCode?: string;
  status?: string;
  reply?: string;
} {
  const call = mocks.appendMessageLog.mock.calls[callIndex] as [
    Date,
    string,
    {
      note?: string;
      resultCode?: string;
      status?: string;
      reply?: string;
    },
  ];

  return call[2];
}

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
    mocks.handleIncomingImageMessage.mockReturnValue({
      reply: '请确认这条营养参考：',
      handlingMode: 'ai',
      status: 'success',
      note: 'REF_CALORIES; awaiting confirmation',
      traceId: 'image_1',
      intent: 'image-ocr',
      tool: 'insertData',
      confirmationState: 'pending',
      resultCode: 'image-ocr-pending',
      telegramResponse: {
        pendingConfirmationId: 'pending_1',
        replyMarkup: {
          inlineKeyboard: [
            [
              { text: '确认', callbackData: 'ocr:confirm:pending_1' },
              { text: '取消', callbackData: 'ocr:cancel:pending_1' },
              { text: '修正', callbackData: 'ocr:edit:pending_1' },
            ],
          ],
        },
      },
    });
    mocks.enqueueImageOcrJob.mockReturnValue({
      reply: '正在识别，请稍后。',
      handlingMode: 'rule',
      status: 'success',
      note: 'image OCR queued; placeholder_message_id=321',
      traceId: 'image_queue_1',
      intent: 'image-ocr-queued',
      tool: '',
      confirmationState: 'none',
      resultCode: 'image-ocr-queued',
    });
    mocks.sendText.mockReturnValue(321);
    mocks.handleConfirmationCallback.mockReturnValue(null);
    mocks.handleConfirmationReply.mockReturnValue(null);
    mocks.parseShortcutPayload.mockReturnValue(null);
    mocks.buildShortcutRawLogText.mockReturnValue(
      '[ios_shortcut] weight=1; bmi=1; bfp=1; lbm=1; sleep=1',
    );
    mocks.hasValidShortcutSecret.mockReturnValue(false);
    mocks.ingestShortcutPayload.mockReturnValue({
      reply: 'iOS Shortcuts 数据已处理：新增 2 条，跳过 0 条。',
      handlingMode: 'rule',
      status: 'success',
      note: 'source=ios_shortcut; body_inserted=1; body_skipped=0; sleep_inserted=1; sleep_skipped=0',
      traceId: '',
      intent: 'ios-shortcut-ingest',
      tool: 'insertData',
      confirmationState: 'none',
      resultCode: 'ios-shortcut-ingested',
    });
  });

  it('processes a webhook update once and marks it done by update_id', () => {
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
    } as unknown as GoogleAppsScript.Events.DoPost);

    expect(mocks.handleIncomingText).toHaveBeenCalledTimes(1);
    expect(mocks.sendText).toHaveBeenCalledWith('test-chat-id', '已记录。', {
      replyMarkup: undefined,
    });
    expect(mocks.appendMessageLog).toHaveBeenCalledTimes(1);
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '今天睡得不太好',
      expect.objectContaining({
        note: 'update_id=123; message_id=9',
      }),
    );
    expect(mocks.cachePut).toHaveBeenNthCalledWith(
      1,
      'telegram_update:123',
      'processing',
      90,
    );
    expect(mocks.cachePut).toHaveBeenNthCalledWith(
      2,
      'telegram_update:123',
      'done',
      21600,
    );
  });

  it('ignores repeated webhook deliveries after a successful text update', () => {
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
    } as unknown as GoogleAppsScript.Events.DoPost);

    mocks.cacheGet.mockImplementation((key: string) => {
      if (key === 'telegram_update:123') {
        return 'done';
      }

      return null;
    });

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

    expect(mocks.handleIncomingText).toHaveBeenCalledTimes(1);
    expect(mocks.sendText).toHaveBeenCalledTimes(1);
    expect(mocks.appendMessageLog).toHaveBeenCalledTimes(2);
    expect(mocks.appendMessageLog).toHaveBeenLastCalledWith(
      expect.any(Date),
      '今天睡得不太好',
      expect.objectContaining({
        status: 'ignored',
        resultCode: 'webhook-duplicate-update',
      }),
    );
    expect(getAppendMessageLogResult(1).note).toContain(
      'update_id=123; message_id=9',
    );
    expect(mocks.cachePut).toHaveBeenLastCalledWith(
      'telegram_update:123:duplicate_logged',
      '1',
      21600,
    );
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

    expect(mocks.sendText).toHaveBeenCalledWith(
      'test-chat-id',
      '🚨 逻辑故障：\nboom',
    );
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '今天睡得不太好',
      expect.objectContaining({
        status: 'failed',
        resultCode: 'webhook-error',
        note: 'boom; update_id=456; message_id=10',
      }),
    );
    expect(mocks.cacheRemove).toHaveBeenCalledWith('telegram_update:456');
  });

  it('routes photo messages into the queue and marks the update done', () => {
    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 789,
          message: {
            message_id: 11,
            chat: { id: 'test-chat-id' },
            caption: '早餐营养标签',
            photo: [{ file_id: 'small' }, { file_id: 'large' }],
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.enqueueImageOcrJob).toHaveBeenCalledWith(
      'test-chat-id',
      'large',
      '早餐营养标签',
      '[image] 早餐营养标签',
      321,
      expect.any(Date),
    );
    expect(mocks.handleIncomingImageMessage).not.toHaveBeenCalled();
    expect(mocks.handleIncomingText).not.toHaveBeenCalled();
    expect(mocks.sendText).toHaveBeenCalledWith(
      'test-chat-id',
      '正在识别，请稍后。',
      {
        replyMarkup: undefined,
      },
    );
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '[image] 早餐营养标签',
      expect.objectContaining({
        reply: '正在识别，请稍后。',
      }),
    );
    expect(getAppendMessageLogResult(0).note).toContain(
      'update_id=789; message_id=11',
    );
    expect(mocks.cachePut).toHaveBeenNthCalledWith(
      1,
      'telegram_update:789',
      'processing',
      90,
    );
    expect(mocks.cachePut).toHaveBeenNthCalledWith(
      2,
      'telegram_update:789',
      'done',
      21600,
    );
  });

  it('ignores repeated image webhook deliveries without sending another placeholder', () => {
    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 793,
          message: {
            message_id: 13,
            chat: { id: 'test-chat-id' },
            caption: '早餐营养标签',
            photo: [{ file_id: 'small' }, { file_id: 'large' }],
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    mocks.cacheGet.mockImplementation((key: string) => {
      if (key === 'telegram_update:793') {
        return 'done';
      }

      return null;
    });

    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 793,
          message: {
            message_id: 13,
            chat: { id: 'test-chat-id' },
            caption: '早餐营养标签',
            photo: [{ file_id: 'small' }, { file_id: 'large' }],
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.sendText).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueImageOcrJob).toHaveBeenCalledTimes(1);
    expect(mocks.appendMessageLog).toHaveBeenCalledTimes(2);
    expect(mocks.appendMessageLog).toHaveBeenLastCalledWith(
      expect.any(Date),
      '[image] 早餐营养标签',
      expect.objectContaining({
        status: 'ignored',
        resultCode: 'webhook-duplicate-update',
      }),
    );
    expect(getAppendMessageLogResult(1).note).toContain(
      'update_id=793; message_id=13',
    );
  });

  it('logs only the first duplicate retry for the same update id', () => {
    mocks.cacheGet.mockImplementation((key: string) => {
      if (key === 'telegram_update:794') {
        return 'done';
      }

      if (key === 'telegram_update:794:duplicate_logged') {
        return '1';
      }

      return null;
    });

    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 794,
          message: {
            message_id: 14,
            chat: { id: 'test-chat-id' },
            caption: '第二张营养标签',
            photo: [{ file_id: 'small' }, { file_id: 'large' }],
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.enqueueImageOcrJob).not.toHaveBeenCalled();
    expect(mocks.appendMessageLog).not.toHaveBeenCalled();
  });

  it('continues processing when typing status fails to send', () => {
    mocks.sendChatAction.mockImplementation(() => {
      throw new Error('typing down');
    });

    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 792,
          message: {
            message_id: 12,
            chat: { id: 'test-chat-id' },
            text: '今天睡得不太好',
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.handleIncomingText).toHaveBeenCalledWith(
      '今天睡得不太好',
      expect.any(Date),
      'test-chat-id',
    );
    expect(mocks.sendText).toHaveBeenLastCalledWith(
      'test-chat-id',
      '已记录。',
      {
        replyMarkup: undefined,
      },
    );
    expect(mocks.appendMessageLog).toHaveBeenNthCalledWith(
      1,
      expect.any(Date),
      '今天睡得不太好',
      expect.objectContaining({
        status: 'ignored',
        resultCode: 'webhook-typing-failed',
      }),
    );
    expect(getAppendMessageLogResult(0).note).toContain(
      'update_id=792; message_id=12',
    );
    expect(mocks.appendMessageLog).toHaveBeenNthCalledWith(
      2,
      expect.any(Date),
      '今天睡得不太好',
      expect.objectContaining({
        status: 'success',
        resultCode: 'ai-tool-executed',
      }),
    );
  });

  it('routes callback queries into the OCR confirmation handler', () => {
    mocks.handleConfirmationCallback.mockReturnValue({
      reply: '已确认热量参考：Greek Yogurt。',
      handlingMode: 'ai',
      status: 'success',
      note: 'REF_CALORIES; confirmed',
      traceId: 'image_1',
      intent: 'image-ocr',
      tool: 'insertData',
      confirmationState: 'confirmed',
      resultCode: 'image-ocr-confirmed',
    });

    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 790,
          callback_query: {
            id: 'cb_1',
            data: 'ocr:confirm:pending_1',
            message: {
              message_id: 321,
              chat: { id: 'test-chat-id' },
            },
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.handleConfirmationCallback).toHaveBeenCalledWith(
      'test-chat-id',
      'cb_1',
      'ocr:confirm:pending_1',
      321,
      expect.any(Date),
    );
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '[callback] ocr:confirm:pending_1',
      expect.objectContaining({
        resultCode: 'image-ocr-confirmed',
      }),
    );
    expect(getAppendMessageLogResult(0).note).toContain(
      'update_id=790; callback_message_id=321; callback_query_id=cb_1',
    );
  });

  it('routes force-reply edits into the OCR confirmation reply handler', () => {
    mocks.handleConfirmationReply.mockReturnValue({
      reply: '已更新热量，请确认或继续修正。',
      handlingMode: 'ai',
      status: 'success',
      note: 'REF_CALORIES; calories updated',
      traceId: 'image_1',
      intent: 'image-ocr',
      tool: 'insertData',
      confirmationState: 'pending',
      resultCode: 'image-ocr-field-updated',
    });

    doPost({
      postData: {
        contents: JSON.stringify({
          update_id: 791,
          message: {
            message_id: 77,
            chat: { id: 'test-chat-id' },
            text: '220',
            reply_to_message: {
              message_id: 654,
              from: { is_bot: true },
            },
          },
        }),
      },
    } as GoogleAppsScript.Events.DoPost);

    expect(mocks.handleConfirmationReply).toHaveBeenCalledWith(
      'test-chat-id',
      654,
      '220',
      expect.any(Date),
    );
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '220',
      expect.objectContaining({ resultCode: 'image-ocr-field-updated' }),
    );
  });

  it('processes authenticated ios shortcut payloads without entering telegram handlers', () => {
    mocks.parseShortcutPayload.mockReturnValue({
      source: 'ios_shortcut',
      weight: [{ date: '2026-04-01T08:39:21+08:00', value: '52.3' }],
      sleep: {
        start: '2026-04-01T00:30:00+08:00',
        end: '2026-04-01T08:10:00+08:00',
        hours: '7.7',
        rating: '88',
      },
    });
    mocks.hasValidShortcutSecret.mockReturnValue(true);

    doPost({
      postData: {
        contents: JSON.stringify({ source: 'ios_shortcut' }),
      },
      headers: {
        'X-HAIJI-SECRET': 'shortcut-secret',
      },
    } as unknown as GoogleAppsScript.Events.DoPost);

    expect(mocks.ingestShortcutPayload).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ios_shortcut' }),
      expect.any(Date),
    );
    expect(mocks.handleIncomingText).not.toHaveBeenCalled();
    expect(mocks.handleIncomingImageMessage).not.toHaveBeenCalled();
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '[ios_shortcut] weight=1; bmi=1; bfp=1; lbm=1; sleep=1',
      expect.objectContaining({ resultCode: 'ios-shortcut-ingested' }),
    );
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it('ignores unauthorized ios shortcut payloads without sending telegram messages', () => {
    mocks.parseShortcutPayload.mockReturnValue({
      source: 'ios_shortcut',
      weight: [{ date: '2026-04-01T08:39:21+08:00', value: '52.3' }],
    });
    mocks.hasValidShortcutSecret.mockReturnValue(false);

    doPost({
      postData: {
        contents: JSON.stringify({ source: 'ios_shortcut' }),
      },
      headers: {
        'X-HAIJI-SECRET': 'wrong-secret',
      },
    } as unknown as GoogleAppsScript.Events.DoPost);

    expect(mocks.ingestShortcutPayload).not.toHaveBeenCalled();
    expect(mocks.handleIncomingText).not.toHaveBeenCalled();
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '[ios_shortcut] weight=1; bmi=1; bfp=1; lbm=1; sleep=1',
      expect.objectContaining({
        status: 'ignored',
        resultCode: 'webhook-unauthorized-shortcut',
      }),
    );
    expect(mocks.sendText).not.toHaveBeenCalled();
  });
});
