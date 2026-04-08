import { beforeAll, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { BodyLogEntry } from '../types';

let LogSheetTableCtor: typeof import('./log-sheet-table').LogSheetTable;

beforeAll(async () => {
  const module = await import('./log-sheet-table');
  LogSheetTableCtor = module.LogSheetTable;
});

const spreadsheet = {
  getDataRows: vi.fn(),
  getTimestamp: vi.fn((_: boolean = false, date: Date = new Date()) =>
    date.toISOString().slice(0, 19).replace('T', ' '),
  ),
} as const;

describe('log sheet table', () => {
  it('uses eventTimeKey for date filtering and recent sorting', () => {
    spreadsheet.getDataRows.mockReturnValue([
      {
        rowNumber: 2,
        values: [
          'body_1',
          '2026-04-04 09:00:00',
          '2026-04-02 07:30:00',
          54.8,
          '',
          '',
          '',
          'manual',
          '',
        ],
      },
      {
        rowNumber: 3,
        values: [
          'body_2',
          '2026-04-02 10:00:00',
          '2026-04-01 07:30:00',
          55.1,
          '',
          '',
          '',
          'manual',
          '',
        ],
      },
    ]);

    const table = new LogSheetTableCtor<BodyLogEntry>({
      schema: SHEET_SCHEMAS.BODY_LOG,
      spreadsheet: spreadsheet as never,
      eventTimeKey: 'occurred_at',
    });

    const sameDayEntries = table.listByDate(new Date('2026-04-02T12:00:00Z'));
    const recentEntries = table.listRecent(2);

    expect(sameDayEntries).toHaveLength(1);
    expect(sameDayEntries[0]).toMatchObject({
      body_log_id: 'body_1',
      occurred_at: '2026-04-02 07:30:00',
      logged_at: '2026-04-04 09:00:00',
    });
    expect(
      recentEntries.map((entry: BodyLogEntry) => entry.body_log_id),
    ).toEqual(['body_1', 'body_2']);
  });
});
