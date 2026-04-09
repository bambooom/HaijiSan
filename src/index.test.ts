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
  handleIncomingImageMessage: vi.fn(),
  handleOcrConfirmationCallback: vi.fn(),
  handleOcrConfirmationReply: vi.fn(),
  attachConfirmationPreviewMessage: vi.fn(),
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
  handleIncomingImageMessage: mocks.handleIncomingImageMessage,
}));

vi.mock('./services/ocr-confirmation', () => ({
  handleOcrConfirmationCallback: mocks.handleOcrConfirmationCallback,
  handleOcrConfirmationReply: mocks.handleOcrConfirmationReply,
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
    mocks.sendText.mockReturnValue(321);
    mocks.handleOcrConfirmationCallback.mockReturnValue(null);
    mocks.handleOcrConfirmationReply.mockReturnValue(null);
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
    expect(mocks.sendText).toHaveBeenCalledWith('test-chat-id', '已记录。', {
      replyMarkup: undefined,
    });
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
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '今天睡得不太好',
      expect.objectContaining({
        status: 'ignored',
        resultCode: 'webhook-duplicate',
      }),
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

    expect(mocks.cacheRemove).toHaveBeenCalledWith('telegram_update:456');
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
        note: 'boom',
      }),
    );
  });

  it('routes photo messages into the image handler and logs the caption', () => {
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

    expect(mocks.handleIncomingImageMessage).toHaveBeenCalledWith(
      'large',
      '早餐营养标签',
      expect.any(Date),
      'test-chat-id',
    );
    expect(mocks.handleIncomingText).not.toHaveBeenCalled();
    expect(mocks.attachConfirmationPreviewMessage).toHaveBeenCalledWith(
      'pending_1',
      321,
    );
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '[image] 早餐营养标签',
      expect.objectContaining({ reply: '请确认这条营养参考：' }),
    );
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
    mocks.handleOcrConfirmationCallback.mockReturnValue({
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

    expect(mocks.handleOcrConfirmationCallback).toHaveBeenCalledWith(
      'test-chat-id',
      'cb_1',
      'ocr:confirm:pending_1',
      321,
      expect.any(Date),
    );
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      expect.any(Date),
      '[callback] ocr:confirm:pending_1',
      expect.objectContaining({ resultCode: 'image-ocr-confirmed' }),
    );
  });

  it('routes force-reply edits into the OCR confirmation reply handler', () => {
    mocks.handleOcrConfirmationReply.mockReturnValue({
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

    expect(mocks.handleOcrConfirmationReply).toHaveBeenCalledWith(
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
});
