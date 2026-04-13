import type { HealthDataSource } from './core';
import type { BodyLogEntry, SleepLogEntry } from './records';

export type ShortcutMetricKey = 'weight' | 'bmi' | 'bfp' | 'lbm';

export type ShortcutMetricSample = {
  id?: unknown;
  date?: unknown;
  type?: unknown;
  value?: unknown;
  unit?: unknown;
};

export type ShortcutSleepPayload = {
  start?: unknown;
  end?: unknown;
  hours?: unknown;
  rating?: unknown;
};

export type ShortcutRequestPayload = {
  source: 'ios_shortcut';
  weight?: ShortcutMetricSample[];
  bmi?: ShortcutMetricSample[];
  bfp?: ShortcutMetricSample[];
  lbm?: ShortcutMetricSample[];
  sleep?: ShortcutSleepPayload;
};

export type ShortcutBodyCandidate = Pick<
  BodyLogEntry,
  | 'occurred_at'
  | 'weight_kg'
  | 'bmi'
  | 'body_fat_pct'
  | 'lean_body_mass_kg'
  | 'source'
  | 'note'
>;

export type ShortcutSleepCandidate = Pick<
  SleepLogEntry,
  | 'sleep_start_at'
  | 'sleep_end_at'
  | 'sleep_hours'
  | 'sleep_quality'
  | 'source'
  | 'note'
>;

export type ShortcutIngestionCounts = {
  bodyInserted: number;
  bodySkipped: number;
  sleepInserted: number;
  sleepSkipped: number;
};

export const SHORTCUT_SOURCE: HealthDataSource = 'ios_health';
