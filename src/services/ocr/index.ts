import type {
  HealthScreenshotExtractionResult,
  HealthScreenshotKind,
  HealthScreenshotOcrInput,
  GeminiResponse,
  GeminiInlinePart,
  GeminiTextPart,
} from '../../types';
import {
  extractGeminiResponseText as extractSharedGeminiResponseText,
  extractJsonObject as extractSharedJsonObject,
} from '../../utils/gemini-response';
import {
  asNullableNumber,
  asNullableString,
  asTrimmedString,
} from '../../utils/value';
import { executeGeminiRequest } from '../gemini/transport';
import { spreadsheetService } from '../spreadsheet';

type RawOcrResult = Partial<HealthScreenshotExtractionResult> & {
  kind?: string;
  appSource?: unknown;
  occurredAt?: unknown;
  recognizedText?: unknown;
  summary?: unknown;
};

const OCR_RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

const OCR_RETRY_DELAYS_MS = [150, 300] as const;

const OCR_MAX_ATTEMPTS = 3;

const KIND_VALUES: HealthScreenshotKind[] = [
  'nutrition_label',
  'food_photo',
  'body_metrics',
  'sleep_summary',
  'workout_summary',
  'unsupported',
];

const SLEEP_QUALITY_VALUES = ['good', 'normal', 'poor'] as const;

const WORKOUT_LEVEL_VALUES = ['easy', 'medium', 'hard'] as const;

function normalizeKind(value: string): HealthScreenshotKind {
  return KIND_VALUES.includes(value as HealthScreenshotKind)
    ? (value as HealthScreenshotKind)
    : 'unsupported';
}

function normalizeSleepQuality(
  value: unknown,
): HealthScreenshotExtractionResult['sleepQuality'] {
  const normalized = asTrimmedString(value);

  return SLEEP_QUALITY_VALUES.includes(
    normalized as (typeof SLEEP_QUALITY_VALUES)[number],
  )
    ? (normalized as HealthScreenshotExtractionResult['sleepQuality'])
    : null;
}

function normalizeWorkoutLevel(
  value: unknown,
): HealthScreenshotExtractionResult['workoutLevel'] {
  const normalized = asTrimmedString(value);

  return WORKOUT_LEVEL_VALUES.includes(
    normalized as (typeof WORKOUT_LEVEL_VALUES)[number],
  )
    ? (normalized as HealthScreenshotExtractionResult['workoutLevel'])
    : null;
}

function buildSystemInstruction(referenceTimestamp: Date): string {
  const currentTimestamp = spreadsheetService.getTimestamp(
    false,
    referenceTimestamp,
  );

  return [
    'You extract structured health information from a single screenshot or photo.',
    `Current local timestamp: ${currentTimestamp}. Use it when interpreting relative date labels such as today, yesterday, 今天, 昨天, 本周, or recent workout summaries.`,
    'Classify the image into exactly one kind: nutrition_label, food_photo, body_metrics, sleep_summary, workout_summary, unsupported.',
    'Return one JSON object only. Do not wrap it in markdown.',
    'If a value is not visible or not reliable, return null for numbers or null for optional timestamps, and use empty strings only for free-text fields such as brand, note, appSource, recognizedText, or summary.',
    'Use occurredAt for the time the measurement or activity shown in the screenshot actually happened. If the screenshot only implies a date but not a time, use 00:00:00 for that date. If the screenshot does not provide a trustworthy occurrence time, return null.',
    'For nutrition_label screenshots, extract foodName, brand, servingSize, servingUnit, caloriesKcal, proteinG, fatG, carbsG, and confidence.',
    'For food_photo images, identify the likely meal or dishes, return kind=food_photo, fill foodName when there is a clear primary dish, keep a concise meal summary in summary, preserve useful visible text in recognizedText, and use occurredAt only when the image itself implies a trustworthy meal time.',
    'For body_metrics screenshots, extract weightKg, bmi, bodyFatPct, leanBodyMassKg, occurredAt, appSource, confidence, and a short summary.',
    'For sleep_summary screenshots, extract sleepStart, sleepEnd, sleepHours, sleepQuality, occurredAt, appSource, confidence, and a short summary.',
    'For workout_summary screenshots, extract workoutName, durationMin, workoutLevel, avgHr, maxHr, minHr, workoutCaloriesKcal, occurredAt, appSource, confidence, and a short summary.',
    'Preserve the most important visible OCR text inside recognizedText so the caller can audit what was read.',
    'Use sleepQuality only as good, normal, or poor. Use workoutLevel only as easy, medium, or hard.',
    'Do not invent health metrics that are not visible in the image.',
  ].join('\n\n');
}

function buildUserPrompt(userPrompt?: string): string {
  if (userPrompt?.trim()) {
    return `User hint: ${userPrompt.trim()}`;
  }

  return 'Read this image and extract any useful structured health, nutrition, sleep, or workout data.';
}

function buildPayload(
  input: HealthScreenshotOcrInput,
): Record<string, unknown> {
  return {
    systemInstruction: {
      parts: [
        {
          text: buildSystemInstruction(input.referenceTimestamp ?? new Date()),
        },
      ],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: buildUserPrompt(input.userPrompt),
          } satisfies GeminiTextPart,
          {
            inline_data: {
              mime_type: input.mimeType,
              data: input.base64Data,
            },
          } satisfies GeminiInlinePart,
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };
}

function normalizeOcrResult(
  raw: RawOcrResult,
): HealthScreenshotExtractionResult {
  return {
    kind: normalizeKind(asTrimmedString(raw.kind)),
    appSource: asTrimmedString(raw.appSource),
    occurredAt: asNullableString(raw.occurredAt),
    recognizedText: asTrimmedString(raw.recognizedText),
    summary: asTrimmedString(raw.summary),
    foodName: asNullableString(raw.foodName),
    brand: asTrimmedString(raw.brand),
    servingSize: asNullableNumber(raw.servingSize),
    servingUnit: asTrimmedString(raw.servingUnit),
    caloriesKcal: asNullableNumber(raw.caloriesKcal),
    proteinG: asNullableNumber(raw.proteinG),
    fatG: asNullableNumber(raw.fatG),
    carbsG: asNullableNumber(raw.carbsG),
    confidence: asNullableNumber(raw.confidence),
    note: asTrimmedString(raw.note),
    weightKg: asNullableNumber(raw.weightKg),
    bmi: asNullableNumber(raw.bmi),
    bodyFatPct: asNullableNumber(raw.bodyFatPct),
    leanBodyMassKg: asNullableNumber(raw.leanBodyMassKg),
    sleepStart: asNullableString(raw.sleepStart),
    sleepEnd: asNullableString(raw.sleepEnd),
    sleepHours: asNullableNumber(raw.sleepHours),
    sleepQuality: normalizeSleepQuality(raw.sleepQuality),
    workoutName: asNullableString(raw.workoutName),
    durationMin: asNullableNumber(raw.durationMin),
    workoutLevel: normalizeWorkoutLevel(raw.workoutLevel),
    avgHr: asNullableNumber(raw.avgHr),
    maxHr: asNullableNumber(raw.maxHr),
    minHr: asNullableNumber(raw.minHr),
    workoutCaloriesKcal: asNullableNumber(raw.workoutCaloriesKcal),
  };
}

export function extractHealthDataFromImage(
  input: HealthScreenshotOcrInput,
): HealthScreenshotExtractionResult {
  if (!input.base64Data.trim()) {
    throw new Error('OCR input base64Data must be non-empty.');
  }

  if (!input.mimeType.trim()) {
    throw new Error('OCR input mimeType must be non-empty.');
  }

  const response = executeGeminiRequest<GeminiResponse>(buildPayload(input), {
    retryableStatusCodes: OCR_RETRYABLE_STATUS_CODES,
    retryDelaysMs: OCR_RETRY_DELAYS_MS,
    maxAttempts: OCR_MAX_ATTEMPTS,
    failureLabel: 'Gemini OCR request',
  });
  const text = extractSharedGeminiResponseText(response, 'Gemini OCR');
  const parsed = JSON.parse(
    extractSharedJsonObject(text, 'Gemini OCR'),
  ) as RawOcrResult;

  return normalizeOcrResult(parsed);
}
