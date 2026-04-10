import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  base64Encode: vi.fn(() => 'encoded-image'),
}));

Object.assign(globalThis, {
  UrlFetchApp: {
    fetch: mocks.fetch,
  },
  Utilities: {
    base64Encode: mocks.base64Encode,
  },
});

let downloadTelegramFile: typeof import('./index').downloadTelegramFile;
let sendText: typeof import('./index').sendText;
let editText: typeof import('./index').editText;
let answerCallbackQuery: typeof import('./index').answerCallbackQuery;

beforeAll(async () => {
  ({ downloadTelegramFile, sendText, editText, answerCallbackQuery } =
    await import('./index'));
});

describe('downloadTelegramFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('infers a concrete image MIME type when Telegram returns octet-stream', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const blob = {
      getBytes: vi.fn(() => bytes),
      getContentType: vi.fn(() => 'application/octet-stream'),
    };

    mocks.fetch
      .mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            ok: true,
            result: {
              file_path: 'photos/file_123.jpg',
            },
          }),
      })
      .mockReturnValueOnce({
        getResponseCode: () => 200,
        getBlob: () => blob,
      });

    const result = downloadTelegramFile('file_123');

    expect(result).toEqual({
      base64Data: 'encoded-image',
      mimeType: 'image/jpeg',
    });
    expect(mocks.base64Encode).toHaveBeenCalledWith(bytes);
  });

  it('preserves a concrete blob MIME type when Telegram provides one', () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const blob = {
      getBytes: vi.fn(() => bytes),
      getContentType: vi.fn(() => 'image/png'),
    };

    mocks.fetch
      .mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            ok: true,
            result: {
              file_path: 'photos/file_456.jpg',
            },
          }),
      })
      .mockReturnValueOnce({
        getResponseCode: () => 200,
        getBlob: () => blob,
      });

    const result = downloadTelegramFile('file_456');

    expect(result.mimeType).toBe('image/png');
  });

  it('sends inline keyboard markup and returns the sent message id', () => {
    mocks.fetch.mockReturnValue({
      getContentText: () =>
        JSON.stringify({ ok: true, result: { message_id: 321 } }),
    });

    const result = sendText('test-chat-id', '请确认', {
      replyMarkup: {
        inlineKeyboard: [
          [
            { text: '确认', callbackData: 'ocr:confirm:1' },
            { text: '取消', callbackData: 'ocr:cancel:1' },
          ],
        ],
      },
    });

    expect(result).toBe(321);
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        payload: JSON.stringify({
          chat_id: 'test-chat-id',
          text: '请确认',
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '确认', callback_data: 'ocr:confirm:1' },
                { text: '取消', callback_data: 'ocr:cancel:1' },
              ],
            ],
          },
        }),
      }),
    );
  });

  it('supports editing messages and answering callback queries', () => {
    mocks.fetch.mockReturnValue({
      getContentText: () => JSON.stringify({ ok: true }),
    });

    editText('test-chat-id', 321, '已更新', {
      replyMarkup: {
        inlineKeyboard: [[{ text: '返回', callbackData: 'ocr:back:1' }]],
      },
    });
    answerCallbackQuery('cb_1', '已确认');

    expect(mocks.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/editMessageText'),
      expect.objectContaining({
        payload: JSON.stringify({
          chat_id: 'test-chat-id',
          message_id: 321,
          text: '已更新',
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '返回', callback_data: 'ocr:back:1' }]],
          },
        }),
      }),
    );
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/answerCallbackQuery'),
      expect.objectContaining({
        payload: JSON.stringify({
          callback_query_id: 'cb_1',
          text: '已确认',
        }),
      }),
    );
  });
});
