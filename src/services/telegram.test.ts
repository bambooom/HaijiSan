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

let downloadTelegramFile: typeof import('./telegram').downloadTelegramFile;

beforeAll(async () => {
  ({ downloadTelegramFile } = await import('./telegram'));
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
});
