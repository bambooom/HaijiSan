import {
  bodyLogTable,
  foodLogTable,
  sleepLogTable,
  statusLogTable,
  workoutLogTable,
} from '../../tables';
import type {
  BodyLogEntry,
  FoodLogEntry,
  GeminiContent,
  GeminiPart,
  GeminiResponse,
  SleepLogEntry,
  StatusLogEntry,
  WorkoutLogEntry,
} from '../../types';
import { executeGeminiRequest } from '../gemini/transport';
import { formatDateLabel } from '../../utils/value';

const DAILY_INSIGHT_RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const DAILY_INSIGHT_RETRY_DELAYS_MS = [150, 300] as const;
const DAILY_INSIGHT_MAX_ATTEMPTS = 3;
const DAILY_INSIGHT_RECENT_LIMIT = 12;

function extractTextParts(content: GeminiContent | undefined): string {
  return (content?.parts ?? [])
    .map((part: GeminiPart) =>
      typeof part.text === 'string' ? part.text.trim() : '',
    )
    .filter(Boolean)
    .join('\n')
    .trim();
}

function toFoodInsightRecord(entry: FoodLogEntry) {
  return {
    occurred_at: entry.occurred_at,
    meal_type: entry.meal_type,
    meal_text: entry.meal_text,
    calories_kcal: entry.calories_kcal,
    protein_g: entry.protein_g,
    fat_g: entry.fat_g,
    carbs_g: entry.carbs_g,
    vegetable_g: entry.vegetable_g,
  };
}

function toBodyInsightRecord(entry: BodyLogEntry) {
  return {
    occurred_at: entry.occurred_at,
    weight_kg: entry.weight_kg,
    bmi: entry.bmi,
    body_fat_pct: entry.body_fat_pct,
  };
}

function toSleepInsightRecord(entry: SleepLogEntry) {
  return {
    sleep_start_at: entry.sleep_start_at,
    sleep_end_at: entry.sleep_end_at,
    sleep_hours: entry.sleep_hours,
    sleep_quality: entry.sleep_quality,
  };
}

function toWorkoutInsightRecord(entry: WorkoutLogEntry) {
  return {
    occurred_at: entry.occurred_at,
    workout_name: entry.workout_name,
    workout_level: entry.workout_level,
    duration_min: entry.duration_min,
    calories_kcal: entry.calories_kcal,
  };
}

function toStatusInsightRecord(entry: StatusLogEntry) {
  return {
    occurred_at: entry.occurred_at,
    entry_type: entry.entry_type,
    value: entry.value,
    cycle_day: entry.cycle_day,
  };
}

function buildInsightPayload(timestamp: Date, deterministicSummary: string) {
  return {
    date: formatDateLabel(timestamp),
    deterministicSummary,
    recentFoodLogs: foodLogTable
      .listRecent(DAILY_INSIGHT_RECENT_LIMIT, timestamp)
      .map(toFoodInsightRecord),
    recentBodyLogs: bodyLogTable
      .listRecent(DAILY_INSIGHT_RECENT_LIMIT, timestamp)
      .map(toBodyInsightRecord),
    recentSleepLogs: sleepLogTable
      .listRecent(DAILY_INSIGHT_RECENT_LIMIT, timestamp)
      .map(toSleepInsightRecord),
    recentWorkoutLogs: workoutLogTable
      .listRecent(DAILY_INSIGHT_RECENT_LIMIT, timestamp)
      .map(toWorkoutInsightRecord),
    recentStatusLogs: statusLogTable
      .listRecent(DAILY_INSIGHT_RECENT_LIMIT, timestamp)
      .map(toStatusInsightRecord),
  };
}

export function buildDailyInsight(
  timestamp: Date,
  deterministicSummary: string,
): string | null {
  const payload = buildInsightPayload(timestamp, deterministicSummary);

  try {
    const response = executeGeminiRequest<GeminiResponse>(
      {
        systemInstruction: {
          parts: [
            {
              text: [
                'You are writing a short daily health insight in Chinese for a personal self-tracking assistant.',
                'Use a calm, steady, observant, lightly encouraging tone, like a reliable senior teammate.',
                'Base the insight only on the provided records and deterministic summary.',
                'Prefer trend-aware observations from recent days over generic advice.',
                'Do not invent missing data. If evidence is weak, say so plainly.',
                'Do not provide medical diagnosis.',
                'Output plain Chinese text only. Do not use Markdown. Do not use HTML tags.',
                'Keep it concise: 2 to 4 short lines.',
                'Start directly with observations, without greetings.',
              ].join(' '),
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: JSON.stringify(payload),
              },
            ],
          },
        ],
      },
      {
        retryableStatusCodes: DAILY_INSIGHT_RETRYABLE_STATUS_CODES,
        retryDelaysMs: DAILY_INSIGHT_RETRY_DELAYS_MS,
        maxAttempts: DAILY_INSIGHT_MAX_ATTEMPTS,
        failureLabel: 'Daily insight request',
      },
    );

    const insight = extractTextParts(response.candidates?.[0]?.content);
    return insight ? `💡 灰二的观察\n${insight}` : null;
  } catch {
    return null;
  }
}
