import { buildAiResult } from '../handlers/ai/result';
import {
  bodyLogRepository,
  refCaloriesRepository,
  sleepLogRepository,
  workoutLogRepository,
} from '../repositories';
import type { CommandHandlingResult, HealthDataSource } from '../types';
import { geminiService } from './gemini';

const MIN_OCR_CONFIDENCE = 0.75;

type PhotoImportInput = {
  base64Data: string;
  mimeType: string;
  caption?: string;
};

function buildOcrNote(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('; ')
    .slice(0, 500);
}

function parseDateTimeToken(value: string, fallbackDate: Date): Date | null {
  const normalized = value.trim();
  const fullMatch = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/,
  );

  if (fullMatch) {
    return new Date(
      Number(fullMatch[1]),
      Number(fullMatch[2]) - 1,
      Number(fullMatch[3]),
      Number(fullMatch[4]),
      Number(fullMatch[5]),
      0,
      0,
    );
  }

  const timeOnlyMatch = normalized.match(/^(\d{2}):(\d{2})$/);

  if (!timeOnlyMatch) {
    return null;
  }

  return new Date(
    fallbackDate.getFullYear(),
    fallbackDate.getMonth(),
    fallbackDate.getDate(),
    Number(timeOnlyMatch[1]),
    Number(timeOnlyMatch[2]),
    0,
    0,
  );
}

function mapPhotoSource(appSource: string): HealthDataSource {
  if (appSource === 'smart_scale') {
    return 'smart_scale';
  }

  if (appSource === 'ios_health' || appSource === 'autosleep') {
    return 'ios_health';
  }

  return 'manual';
}

function buildLowConfidenceResult(
  kind: string,
  confidence: number | null,
  note: string,
): CommandHandlingResult {
  const confidenceText =
    typeof confidence === 'number' ? confidence.toFixed(2) : '未知';

  return buildAiResult(
    `这张图我暂时不敢直接写入。识别类型：${kind}，置信度 ${confidenceText}。你可以换一张更清晰的截图，或者在图片说明里补充一点提示。`,
    'ignored',
    buildOcrNote([`photo-kind=${kind}`, `confidence=${confidenceText}`, note]),
    {
      intent: 'photo_ocr',
      tool: '',
      resultCode: 'photo-low-confidence',
    },
  );
}

function buildUnsupportedResult(note: string): CommandHandlingResult {
  return buildAiResult(
    '这张图片我没能稳定识别成营养成分表、体重/体脂截图、睡眠截图或运动截图。可以换一张更完整清晰的截图，或在发送时补一句说明。',
    'ignored',
    buildOcrNote(['photo-kind=unsupported', note]),
    {
      intent: 'photo_ocr',
      tool: '',
      resultCode: 'photo-unsupported',
    },
  );
}

export function importReferenceFromNutritionLabelPhoto(
  input: PhotoImportInput,
  timestamp: Date,
): CommandHandlingResult {
  const extracted = geminiService.extractNutritionLabelReference(input);

  if (
    (extracted.confidence ?? 0) < MIN_OCR_CONFIDENCE ||
    !extracted.foodName ||
    extracted.caloriesKcal === null
  ) {
    return buildLowConfidenceResult(
      'nutrition_label',
      extracted.confidence,
      extracted.note,
    );
  }

  const entry = refCaloriesRepository.logReference(timestamp, {
    foodName: extracted.foodName,
    brand: extracted.brand,
    servingSize: extracted.servingSize,
    servingUnit: extracted.servingUnit,
    caloriesKcal: extracted.caloriesKcal,
    proteinG: extracted.proteinG,
    fatG: extracted.fatG,
    carbsG: extracted.carbsG,
    source: 'nutrition_label',
    note: buildOcrNote([
      'photo-ocr',
      `confidence=${extracted.confidence?.toFixed(2) ?? 'unknown'}`,
      extracted.note,
      input.caption,
    ]),
  });

  return buildAiResult(
    `✅ 已写入热量参考：${entry.food_name}${entry.brand ? `（${entry.brand}）` : ''}，${entry.calories_kcal ?? '未知'} kcal${entry.serving_size ? ` / ${entry.serving_size}${entry.serving_unit}` : ''}。`,
    'success',
    buildOcrNote([
      'photo-kind=nutrition_label',
      `confidence=${extracted.confidence?.toFixed(2) ?? 'unknown'}`,
      extracted.note,
    ]),
    {
      intent: 'photo_ocr',
      tool: 'logReference',
      resultCode: 'photo-reference-imported',
    },
  );
}

export function importHealthDataPhoto(
  input: PhotoImportInput,
  timestamp: Date,
): CommandHandlingResult {
  const extracted = geminiService.extractHealthScreenshot({
    ...input,
    timestamp,
  });

  if ((extracted.confidence ?? 0) < MIN_OCR_CONFIDENCE) {
    return buildLowConfidenceResult(
      extracted.kind,
      extracted.confidence,
      extracted.note,
    );
  }

  if (extracted.kind === 'nutrition_label') {
    return importReferenceFromNutritionLabelPhoto(input, timestamp);
  }

  if (extracted.kind === 'body_metrics') {
    if (
      extracted.weightKg === null &&
      extracted.bmi === null &&
      extracted.bodyFatPct === null &&
      extracted.leanBodyMassKg === null
    ) {
      return buildUnsupportedResult(extracted.note);
    }

    const entry = bodyLogRepository.logMetrics(timestamp, {
      weightKg: extracted.weightKg,
      bmi: extracted.bmi,
      bodyFatPct: extracted.bodyFatPct,
      leanBodyMassKg: extracted.leanBodyMassKg,
      source: mapPhotoSource(extracted.appSource),
      note: buildOcrNote([
        'photo-ocr',
        `app=${extracted.appSource}`,
        extracted.note,
        input.caption,
      ]),
    });

    return buildAiResult(
      `✅ 已记录身体数据：体重 ${entry.weight_kg ?? '未知'} kg，BMI ${entry.bmi ?? '未知'}，体脂 ${entry.body_fat_pct ?? '未知'}%。`,
      'success',
      buildOcrNote([
        'photo-kind=body_metrics',
        `app=${extracted.appSource}`,
        `confidence=${extracted.confidence?.toFixed(2) ?? 'unknown'}`,
        extracted.note,
      ]),
      {
        intent: 'weight',
        tool: 'logBody',
        resultCode: 'photo-body-imported',
      },
    );
  }

  if (extracted.kind === 'sleep_summary') {
    const sleepStart =
      extracted.sleepStart === null
        ? null
        : parseDateTimeToken(extracted.sleepStart, timestamp);
    const sleepEnd =
      extracted.sleepEnd === null
        ? null
        : parseDateTimeToken(extracted.sleepEnd, timestamp);

    if (!sleepStart || !sleepEnd) {
      return buildUnsupportedResult(extracted.note);
    }

    if (sleepStart.getTime() >= sleepEnd.getTime()) {
      sleepStart.setDate(sleepStart.getDate() - 1);
    }

    const sleepHours =
      extracted.sleepHours ??
      Number(
        (
          (sleepEnd.getTime() - sleepStart.getTime()) /
          (1000 * 60 * 60)
        ).toFixed(1),
      );

    sleepLogRepository.logSleep(
      timestamp,
      sleepStart,
      sleepEnd,
      sleepHours,
      extracted.sleepQuality ?? 'normal',
      buildOcrNote([
        'photo-ocr',
        `app=${extracted.appSource}`,
        extracted.note,
        input.caption,
      ]),
      mapPhotoSource(extracted.appSource),
    );

    return buildAiResult(
      `✅ 已记录睡眠：${extracted.sleepStart} - ${extracted.sleepEnd}，约 ${sleepHours} 小时，质量${extracted.sleepQuality ?? 'normal'}。`,
      'success',
      buildOcrNote([
        'photo-kind=sleep_summary',
        `app=${extracted.appSource}`,
        `confidence=${extracted.confidence?.toFixed(2) ?? 'unknown'}`,
        extracted.note,
      ]),
      {
        intent: 'sleep',
        tool: 'logSleep',
        resultCode: 'photo-sleep-imported',
      },
    );
  }

  if (extracted.kind === 'workout_summary') {
    if (!extracted.workoutName || extracted.durationMin === null) {
      return buildUnsupportedResult(extracted.note);
    }

    workoutLogRepository.logWorkout(
      timestamp,
      extracted.workoutName,
      extracted.durationMin,
      extracted.workoutLevel ?? 'medium',
      buildOcrNote([
        'photo-ocr',
        `app=${extracted.appSource}`,
        extracted.workoutCaloriesKcal === null
          ? null
          : `calories=${extracted.workoutCaloriesKcal}`,
        extracted.note,
        input.caption,
      ]),
    );

    return buildAiResult(
      `✅ 已记录运动：${extracted.workoutName}，时长 ${extracted.durationMin} 分钟，强度${extracted.workoutLevel ?? 'medium'}。`,
      'success',
      buildOcrNote([
        'photo-kind=workout_summary',
        `app=${extracted.appSource}`,
        `confidence=${extracted.confidence?.toFixed(2) ?? 'unknown'}`,
        extracted.note,
      ]),
      {
        intent: 'workout',
        tool: 'logWorkout',
        resultCode: 'photo-workout-imported',
      },
    );
  }

  return buildUnsupportedResult(extracted.note);
}
