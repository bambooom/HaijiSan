import { beforeAll, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
    X_HAIJI_SECRET: 'shortcut-secret',
  },
  Session: {
    getScriptTimeZone: () => 'UTC',
  },
  Utilities: {
    formatDate: vi.fn((_date: Date, _timeZone: string, format: string) => {
      if (format !== 'yyyy-MM-dd HH:mm:ss') {
        throw new Error(`Unexpected format: ${format}`);
      }

      return '2026-04-01 00:39:21';
    }),
  },
});

let normalizeTimestampText: typeof import('./timestamp').normalizeTimestampText;
let parseDateStamp: typeof import('./timestamp').parseDateStamp;

beforeAll(async () => {
  ({ normalizeTimestampText, parseDateStamp } = await import('./timestamp'));
});

describe('timestamp utils', () => {
  it('normalizes ISO timestamps into sheet timestamps', () => {
    expect(normalizeTimestampText('2026-04-01T08:39:21+08:00', 'field')).toBe(
      '2026-04-01 00:39:21',
    );
  });

  it('parses date stamps into local dates', () => {
    expect(parseDateStamp('2026-04-01')).toEqual(new Date(2026, 3, 1));
  });
});
