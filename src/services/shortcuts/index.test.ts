import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BodyLogEntry,
  InsertDataRequest,
  SleepLogEntry,
} from '../../types';

const mocks = vi.hoisted(() => ({
  listBodyLogByDate: vi.fn<() => BodyLogEntry[]>(() => []),
  listSleepLogByDate: vi.fn<() => SleepLogEntry[]>(() => []),
  executeInsertData: vi.fn((request: InsertDataRequest) => ({
    tool: 'insertData',
    sheet: request.sheet,
    record: request.record,
  })),
  getTimestamp: vi.fn((_: boolean, date: Date) =>
    date.toISOString().slice(0, 19).replace('T', ' '),
  ),
}));

vi.mock('../../tables', () => ({
  bodyLogTable: {
    listByDate: mocks.listBodyLogByDate,
  },
  sleepLogTable: {
    listByDate: mocks.listSleepLogByDate,
  },
}));

vi.mock('../../tools', () => ({
  executeInsertData: mocks.executeInsertData,
}));

vi.mock('../spreadsheet', () => ({
  spreadsheetService: {
    getTimestamp: mocks.getTimestamp,
  },
}));

import {
  buildShortcutRawLogText,
  getRequestHeader,
  hasValidShortcutSecret,
  ingestShortcutPayload,
  parseShortcutPayload,
} from './index';

describe('shortcuts ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBodyLogByDate.mockReturnValue([]);
    mocks.listSleepLogByDate.mockReturnValue([]);
  });

  it('parses ios shortcut payloads and ignores non-shortcut bodies', () => {
    expect(
      parseShortcutPayload(
        JSON.stringify({ source: 'ios_shortcut', weight: [] }),
      ),
    ).toEqual({ source: 'ios_shortcut', weight: [] });
    expect(
      parseShortcutPayload(
        JSON.stringify({ update_id: 1, message: { text: 'hi' } }),
      ),
    ).toBeNull();
  });

  it('reads the custom secret header case-insensitively', () => {
    const event = {
      headers: {
        'x-haiji-secret': 'shortcut-secret',
      },
    } as unknown as GoogleAppsScript.Events.DoPost;

    expect(getRequestHeader(event, 'X-HAIJI-SECRET')).toBe('shortcut-secret');
    expect(hasValidShortcutSecret(event, 'shortcut-secret')).toBe(true);
    expect(hasValidShortcutSecret(event, 'other-secret')).toBe(false);
  });

  it('accepts query-string or body secret when GAS does not expose headers', () => {
    expect(
      hasValidShortcutSecret(
        {
          parameter: {
            x_haiji_secret: 'shortcut-secret',
          },
        } as unknown as GoogleAppsScript.Events.DoPost,
        'shortcut-secret',
      ),
    ).toBe(true);

    expect(
      hasValidShortcutSecret(
        {
          parameter: {},
        } as unknown as GoogleAppsScript.Events.DoPost,
        'shortcut-secret',
        {
          source: 'ios_shortcut',
          x_haiji_secret: 'shortcut-secret',
        },
      ),
    ).toBe(true);

    expect(
      hasValidShortcutSecret(
        {
          parameter: {},
        } as unknown as GoogleAppsScript.Events.DoPost,
        'shortcut-secret',
        {
          source: 'ios_shortcut',
          secret: 'shortcut-secret',
        },
      ),
    ).toBe(true);
  });

  it('aggregates body metrics by timestamp and inserts sleep with derived quality', () => {
    const result = ingestShortcutPayload(
      {
        source: 'ios_shortcut',
        weight: [
          {
            id: '20260401083921_weight',
            date: '2026-04-01T08:39:21+08:00',
            type: 'Weight',
            value: '52.3',
            unit: 'kg',
          },
        ],
        bmi: [
          {
            id: '20260401083921_bmi',
            date: '2026-04-01T08:39:21+08:00',
            type: 'Body Mass Index',
            value: '21.1',
          },
        ],
        bfp: [
          {
            id: '20260401083921_bfp',
            date: '2026-04-01T08:39:21+08:00',
            type: 'Body Fat Percentage',
            value: '30.4',
            unit: '%',
          },
        ],
        lbm: [
          {
            id: '20260401083921_lbm',
            date: '2026-04-01T08:39:21+08:00',
            type: 'Lean Body Mass',
            value: '36',
            unit: 'kg',
          },
        ],
        sleep: {
          start: '2026-04-01T00:10:00+08:00',
          end: '2026-04-01T08:00:00+08:00',
          hours: '7.8',
          rating: '88',
        },
      },
      new Date('2026-04-01T09:00:00+08:00'),
    );

    expect(mocks.executeInsertData).toHaveBeenCalledTimes(2);
    expect(mocks.executeInsertData).toHaveBeenNthCalledWith(
      1,
      {
        tool: 'insertData',
        sheet: 'BODY_LOG',
        record: {
          occurred_at: '2026-04-01 00:39:21',
          weight_kg: 52.3,
          bmi: 21.1,
          body_fat_pct: 30.4,
          lean_body_mass_kg: 36,
          source: 'ios_health',
          note: '',
        },
      },
      new Date('2026-04-01T09:00:00+08:00'),
    );
    expect(mocks.executeInsertData).toHaveBeenNthCalledWith(
      2,
      {
        tool: 'insertData',
        sheet: 'SLEEP_LOG',
        record: {
          sleep_start_at: '2026-03-31 16:10:00',
          sleep_end_at: '2026-04-01 00:00:00',
          sleep_hours: 7.8,
          sleep_quality: 'good',
          source: 'ios_health',
          note: '',
        },
      },
      new Date('2026-04-01T09:00:00+08:00'),
    );
    expect(result.resultCode).toBe('ios-shortcut-ingested');
    expect(result.note).toContain('body_inserted=1');
    expect(result.note).toContain('sleep_inserted=1');
    expect(
      buildShortcutRawLogText({
        source: 'ios_shortcut',
        weight: [{}],
        sleep: {},
      }),
    ).toBe('[ios_shortcut] weight=1; bmi=0; bfp=0; lbm=0; sleep=1');
  });

  it('skips body and sleep records that already exist by timestamp window', () => {
    mocks.listBodyLogByDate.mockReturnValue([
      {
        body_log_id: 'body_1',
        logged_at: '2026-04-01 09:00:00',
        occurred_at: '2026-04-01 00:39:21',
        weight_kg: 52.3,
        bmi: 21.1,
        body_fat_pct: 30.4,
        lean_body_mass_kg: 36,
        source: 'ios_health',
        note: '',
      },
    ]);
    mocks.listSleepLogByDate.mockReturnValue([
      {
        sleep_log_id: 'sleep_1',
        logged_at: '2026-04-01 09:00:00',
        sleep_start_at: '2026-03-31 16:10:00',
        sleep_end_at: '2026-04-01 00:00:00',
        sleep_hours: 7.8,
        sleep_quality: 'good',
        source: 'ios_health',
        note: '',
      },
    ]);

    const result = ingestShortcutPayload({
      source: 'ios_shortcut',
      weight: [
        {
          date: '2026-04-01T08:39:21+08:00',
          value: '52.3',
        },
      ],
      sleep: {
        start: '2026-04-01T00:10:00+08:00',
        end: '2026-04-01T08:00:00+08:00',
        hours: '7.8',
        rating: '60',
      },
    });

    expect(mocks.executeInsertData).not.toHaveBeenCalled();
    expect(result.resultCode).toBe('ios-shortcut-noop');
    expect(result.note).toContain('body_skipped=1');
    expect(result.note).toContain('sleep_skipped=1');
  });
});
