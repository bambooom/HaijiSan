import { executeInsertData } from '../tools';
import type { InsertDataRequest } from '../tools/types';
import type {
  CommandAuditFields,
  CommandHandlingResult,
  HealthDataSource,
  HealthScreenshotExtractionResult,
} from '../types';
import { buildCommandLogFields } from '../utils/log-meta';
import { extractHealthDataFromImage } from '../services/image-ocr';
import { downloadTelegramFile } from '../services/telegram';

function createTraceId(timestamp: Date): string {
  return `image_${timestamp.getTime()}`;
}

function createAudit(
  sheet = '',
  changedFields: string[] = [],
): CommandAuditFields {
  return {
    toolCallCount: sheet ? 1 : 0,
    readCount: 0,
    insertCount: sheet ? 1 : 0,
    updateCount: 0,
    readSheetNames: [],
    writeSheetNames: sheet ? [sheet] : [],
    primaryAction: sheet ? 'insertData' : '',
    primaryTargetSheet: sheet,
    primarySelectorType: '',
    primarySelectorValue: '',
    changedFields,
  };
}

function buildImageResult(
  reply: string,
  timestamp: Date,
  overrides?: Partial<CommandHandlingResult>,
): CommandHandlingResult {
  const logFields = buildCommandLogFields(undefined, {
    traceId: createTraceId(timestamp),
    intent: overrides?.intent ?? 'image-ocr',
    tool: overrides?.tool ?? '',
    confirmationState: overrides?.confirmationState ?? 'none',
    resultCode: overrides?.resultCode ?? '',
  });

  return {
    reply,
    handlingMode: overrides?.handlingMode ?? 'ai',
    status: overrides?.status ?? 'success',
    note: overrides?.note ?? '',
    audit: overrides?.audit,
    ...logFields,
  };
}

function asTrimmedString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildOcrNote(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
): string {
  return [
    extraction.summary ? `summary=${extraction.summary}` : '',
    extraction.appSource ? `app=${extraction.appSource}` : '',
    caption ? `caption=${caption}` : '',
    extraction.recognizedText
      ? `ocr=${extraction.recognizedText.slice(0, 160)}`
      : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function inferHealthSource(
  extraction: HealthScreenshotExtractionResult,
): HealthDataSource {
  const appSource = extraction.appSource.trim().toLowerCase();

  if (
    appSource.includes('scale') ||
    appSource.includes('weight') ||
    appSource.includes('body composition')
  ) {
    return 'smart_scale';
  }

  if (
    appSource.includes('health') ||
    appSource.includes('fitness') ||
    appSource.includes('apple') ||
    appSource.includes('ios')
  ) {
    return 'ios_health';
  }

  return 'manual';
}

function toNutritionLabelRequest(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
): InsertDataRequest {
  const foodName =
    extraction.foodName || asTrimmedString(caption) || 'OCR nutrition label';

  return {
    tool: 'insertData',
    sheet: 'REF_CALORIES',
    record: {
      food_name: foodName,
      brand: extraction.brand,
      serving_size: extraction.servingSize,
      serving_unit: extraction.servingUnit,
      calories_kcal: extraction.caloriesKcal,
      protein_g: extraction.proteinG,
      fat_g: extraction.fatG,
      carbs_g: extraction.carbsG,
      source: 'nutrition_label',
      note: buildOcrNote(extraction, caption),
    },
  };
}

function toBodyLogRequest(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
): InsertDataRequest {
  return {
    tool: 'insertData',
    sheet: 'BODY_LOG',
    record: {
      occurred_at: extraction.occurredAt ?? undefined,
      weight_kg: extraction.weightKg,
      bmi: extraction.bmi,
      body_fat_pct: extraction.bodyFatPct,
      lean_body_mass_kg: extraction.leanBodyMassKg,
      source: inferHealthSource(extraction),
      note: buildOcrNote(extraction, caption),
    },
  };
}

function toSleepLogRequest(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
): InsertDataRequest | null {
  if (!extraction.sleepStart || !extraction.sleepEnd) {
    return null;
  }

  return {
    tool: 'insertData',
    sheet: 'SLEEP_LOG',
    record: {
      sleep_start_at: extraction.sleepStart,
      sleep_end_at: extraction.sleepEnd,
      sleep_hours: extraction.sleepHours,
      sleep_quality: extraction.sleepQuality ?? 'normal',
      source: inferHealthSource(extraction),
      note: buildOcrNote(extraction, caption),
    },
  };
}

function toWorkoutLogRequest(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
): InsertDataRequest {
  return {
    tool: 'insertData',
    sheet: 'WORKOUT_LOG',
    record: {
      occurred_at: extraction.occurredAt ?? undefined,
      workout_name: extraction.workoutName ?? 'OCR workout',
      workout_level: extraction.workoutLevel ?? 'medium',
      duration_min: extraction.durationMin,
      avg_hr: extraction.avgHr,
      max_hr: extraction.maxHr,
      min_hr: extraction.minHr,
      calories_kcal: extraction.workoutCaloriesKcal,
      note: buildOcrNote(extraction, caption),
    },
  };
}

function formatInsertReply(
  extraction: HealthScreenshotExtractionResult,
  request: InsertDataRequest,
): string {
  switch (request.sheet) {
    case 'REF_CALORIES':
      return `已记录热量参考：${String(request.record.food_name)}。`;
    case 'BODY_LOG':
      return `已记录身体指标截图。`;
    case 'SLEEP_LOG':
      return `已记录睡眠截图数据。`;
    case 'WORKOUT_LOG':
      return `已记录运动截图数据。`;
    default:
      return extraction.kind === 'unsupported'
        ? '这张图片我暂时还不能稳定解析。'
        : '已处理图片。';
  }
}

function buildInsertRequest(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
): InsertDataRequest | null {
  switch (extraction.kind) {
    case 'nutrition_label':
      return toNutritionLabelRequest(extraction, caption);
    case 'body_metrics':
      return toBodyLogRequest(extraction, caption);
    case 'sleep_summary':
      return toSleepLogRequest(extraction, caption);
    case 'workout_summary':
      return toWorkoutLogRequest(extraction, caption);
    case 'unsupported':
      return null;
  }
}

export function handleIncomingImage(
  fileId: string,
  caption: string,
  timestamp: Date,
): CommandHandlingResult {
  try {
    const downloaded = downloadTelegramFile(fileId);
    const extraction = extractHealthDataFromImage({
      base64Data: downloaded.base64Data,
      mimeType: downloaded.mimeType,
      referenceTimestamp: timestamp,
      userPrompt: caption,
    });
    const request = buildInsertRequest(extraction, caption);

    if (!request) {
      return buildImageResult(
        extraction.kind === 'sleep_summary'
          ? '这张睡眠截图缺少足够的开始或结束时间，暂时还不能直接入库。'
          : '这张图片我暂时还不能稳定解析成可写入的数据。',
        timestamp,
        {
          note: buildOcrNote(extraction, caption),
          resultCode: 'image-ocr-no-write',
          audit: createAudit(),
        },
      );
    }

    const result = executeInsertData(request, timestamp);

    return buildImageResult(formatInsertReply(extraction, request), timestamp, {
      tool: 'insertData',
      note: `${request.sheet}; ${buildOcrNote(extraction, caption)}`,
      resultCode: 'image-ocr-inserted',
      audit: createAudit(request.sheet, Object.keys(result.record).sort()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return buildImageResult('图片处理失败，请稍后再试。', timestamp, {
      status: 'failed',
      note: message,
      resultCode: 'image-ocr-error',
      audit: createAudit(),
    });
  }
}
