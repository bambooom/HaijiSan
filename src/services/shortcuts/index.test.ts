import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BodyLogEntry,
  InsertDataRequest,
  SleepLogEntry,
  WorkoutLogEntry,
} from '../../types';

const mocks = vi.hoisted(() => ({
  listBodyLogByDate: vi.fn<() => BodyLogEntry[]>(() => []),
  listSleepLogByDate: vi.fn<() => SleepLogEntry[]>(() => []),
  listWorkoutLogByDate: vi.fn<() => WorkoutLogEntry[]>(() => []),
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
  workoutLogTable: {
    listByDate: mocks.listWorkoutLogByDate,
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
    mocks.listWorkoutLogByDate.mockReturnValue([]);
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
    ).toBe('[ios_shortcut] weight=1; bmi=0; bfp=0; lbm=0; sleep=1; workout=0');
  });

  it('maps raw workout payloads into WORKOUT_LOG records', () => {
    const result = ingestShortcutPayload(
      {
        source: 'ios_shortcut',
        video_url: 'https://b23.tv/example',
        share_text: 'Mixed Cardio 跟练视频 https://b23.tv/example',
        workout: {
          uuid: 'A55EB1B3-DE7E-48E1-89F9-18319B52889A',
          name: 'Mixed Cardio',
          activity: {
            name: 'Mixed Cardio',
            type: 73,
          },
          startDate: '2026-04-17T10:02:35Z',
          endDate: '2026-04-17T10:33:30Z',
          source: 'Milky’s Apple Watch',
          duration: {
            value: 1854,
            unit: 'sec',
          },
          activeCalories: {
            value: 128,
            unit: 'kcal',
          },
          distance: {
            value: 2.8,
            unit: 'km',
          },
          pace: '11′00″',
          averageIntensity: {
            value: 60,
            unit: '%',
          },
          minIntensity: {
            value: 37,
            unit: '%',
          },
          maxIntensity: {
            value: 72,
            unit: '%',
          },
          averageMETs: {
            value: 5.8,
            unit: 'METs',
          },
          averageHeartRate: {
            value: 113,
            unit: 'bpm',
          },
          minHeartRate: {
            value: 71,
            unit: 'bpm',
          },
          maxHeartRate: {
            value: 136,
            unit: 'bpm',
          },
          zones: {
            zone1: { time: { value: 683, unit: 'sec' } },
            zone2: { time: { value: 860, unit: 'sec' } },
            zone3: { time: { value: 105, unit: 'sec' } },
            zone4: { time: { value: 0, unit: 'sec' } },
            zone5: { time: { value: 0, unit: 'sec' } },
          },
          weather: {
            humidity: '76%',
            temperature: '26°C',
          },
          device: {
            name: 'Apple Watch',
            hardwareVersion: 'Watch7,1',
            softwareVersion: '26.2.1',
          },
        },
      },
      new Date('2026-04-17T18:40:00+08:00'),
    );

    expect(mocks.executeInsertData).toHaveBeenCalledWith(
      {
        tool: 'insertData',
        sheet: 'WORKOUT_LOG',
        record: expect.objectContaining({
          occurred_at: '2026-04-17 10:02:35',
          workout_name: 'Mixed Cardio',
          workout_video_url: 'https://b23.tv/example',
          workout_level: 'medium',
          duration_min: 30.9,
          avg_hr: 113,
          max_hr: 136,
          min_hr: 71,
          calories_kcal: 128,
        }),
      },
      new Date('2026-04-17T18:40:00+08:00'),
    );
    expect(result.resultCode).toBe('ios-shortcut-ingested');
    expect(result.note).toContain('workout_inserted=1');
    expect(
      (mocks.executeInsertData.mock.calls[0]?.[0] as InsertDataRequest).record
        .note,
    ).toContain('share_text=Mixed Cardio 跟练视频 https://b23.tv/example');
  });

  it('skips workout records that already exist by occurred_at and workout_name', () => {
    mocks.listWorkoutLogByDate.mockReturnValue([
      {
        workout_id: 'workout_1',
        logged_at: '2026-04-17 18:40:00',
        occurred_at: '2026-04-17 10:02:35',
        workout_name: 'Mixed Cardio',
        workout_video_url: '',
        workout_level: 'medium',
        duration_min: 30.9,
        avg_hr: 113,
        max_hr: 136,
        min_hr: 71,
        calories_kcal: 128,
        note: '',
      },
    ]);

    const result = ingestShortcutPayload({
      source: 'ios_shortcut',
      workout: {
        name: 'Mixed Cardio',
        startDate: '2026-04-17T10:02:35Z',
        averageIntensity: { value: 60 },
      },
    });

    expect(mocks.executeInsertData).not.toHaveBeenCalled();
    expect(result.resultCode).toBe('ios-shortcut-noop');
    expect(result.note).toContain('workout_skipped=1');
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
