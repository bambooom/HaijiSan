import type { HealthDataSource } from './core';
import type { BodyLogEntry, SleepLogEntry, WorkoutLogEntry } from './records';

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

export type ShortcutWorkoutPayload = {
  uuid?: unknown;
  name?: unknown;
  activity?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  source?: unknown;
  zones?: unknown;
  duration?: unknown;
  activeCalories?: unknown;
  distance?: unknown;
  pace?: unknown;
  averageIntensity?: unknown;
  minIntensity?: unknown;
  maxIntensity?: unknown;
  averageMETs?: unknown;
  averageHeartRate?: unknown;
  minHeartRate?: unknown;
  maxHeartRate?: unknown;
  weather?: unknown;
  device?: unknown;
  videoUrl?: unknown;
  video_url?: unknown;
  shareText?: unknown;
  share_text?: unknown;
};

export type ShortcutRequestPayload = {
  source: 'ios_shortcut';
  secret?: unknown;
  x_haiji_secret?: unknown;
  videoUrl?: unknown;
  video_url?: unknown;
  shareText?: unknown;
  share_text?: unknown;
  weight?: ShortcutMetricSample[];
  bmi?: ShortcutMetricSample[];
  bfp?: ShortcutMetricSample[];
  lbm?: ShortcutMetricSample[];
  sleep?: ShortcutSleepPayload;
  workout?: ShortcutWorkoutPayload;
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

export type ShortcutWorkoutCandidate = Pick<
  WorkoutLogEntry,
  | 'occurred_at'
  | 'workout_name'
  | 'workout_video_url'
  | 'workout_level'
  | 'duration_min'
  | 'avg_hr'
  | 'max_hr'
  | 'min_hr'
  | 'calories_kcal'
  | 'note'
>;

export type ShortcutIngestionCounts = {
  bodyInserted: number;
  bodySkipped: number;
  sleepInserted: number;
  sleepSkipped: number;
  workoutInserted: number;
  workoutSkipped: number;
};

export const SHORTCUT_SOURCE: HealthDataSource = 'ios_health';
