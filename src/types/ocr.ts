import type { SleepQuality, WorkoutLevel } from './core';

export const HEALTH_SCREENSHOT_KIND_VALUES = [
  'nutrition_label',
  'food_photo',
  'body_metrics',
  'sleep_summary',
  'workout_summary',
  'unsupported',
] as const;

export type HealthScreenshotKind =
  (typeof HEALTH_SCREENSHOT_KIND_VALUES)[number];

export type NutritionLabelReferenceResult = {
  foodName: string | null;
  brand: string;
  servingSize: number | null;
  servingUnit: string;
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  confidence: number | null;
  note: string;
};

export type HealthScreenshotExtractionResult = NutritionLabelReferenceResult & {
  kind: HealthScreenshotKind;
  appSource: string;
  occurredAt: string | null;
  recognizedText: string;
  summary: string;
  weightKg: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  leanBodyMassKg: number | null;
  sleepStart: string | null;
  sleepEnd: string | null;
  sleepHours: number | null;
  sleepQuality: SleepQuality | null;
  workoutName: string | null;
  durationMin: number | null;
  workoutLevel: WorkoutLevel | null;
  avgHr: number | null;
  maxHr: number | null;
  minHr: number | null;
  workoutCaloriesKcal: number | null;
};

export type HealthScreenshotOcrInput = {
  base64Data: string;
  mimeType: string;
  referenceTimestamp?: Date;
  userPrompt?: string;
};
