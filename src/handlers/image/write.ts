import type {
  HealthDataSource,
  HealthScreenshotExtractionResult,
  MealType,
  InsertDataRequest,
  UpdateDataRequest,
} from '../../types';
import { refCaloriesTable } from '../../tables';
import { asTrimmedString } from '../../utils/value';

export function buildOcrNote(
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

export function formatImageWriteReply(
  extraction: HealthScreenshotExtractionResult,
  request: InsertDataRequest | UpdateDataRequest,
): string {
  switch (request.sheet) {
    case 'REF_CALORIES':
      return request.tool === 'updateData'
        ? `已更新热量参考：${String(request.updates.food_name)}。`
        : `已记录热量参考：${String(request.record.food_name)}。`;
    case 'BODY_LOG':
      return '已记录身体指标截图。';
    case 'SLEEP_LOG':
      return '已记录睡眠截图数据。';
    case 'WORKOUT_LOG':
      return '已记录运动截图数据。';
    case 'FOOD_LOG':
      return '已记录餐食图片。';
    default:
      return extraction.kind === 'unsupported'
        ? '这张图片我暂时还不能稳定解析。'
        : '已处理图片。';
  }
}

export function buildImageWriteRequest(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
  referenceTimestamp?: Date,
): InsertDataRequest | UpdateDataRequest | null {
  switch (extraction.kind) {
    case 'nutrition_label': {
      const foodName =
        extraction.foodName ||
        asTrimmedString(caption) ||
        'OCR nutrition label';
      const existingReference =
        refCaloriesTable.findEntryRowByFoodName(foodName);

      return existingReference
        ? toNutritionLabelUpdateRequest(
            existingReference.rowNumber,
            extraction,
            caption,
          )
        : toNutritionLabelRequest(extraction, caption);
    }
    case 'food_photo':
      return toFoodPhotoRequest(extraction, caption, referenceTimestamp);
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

function inferMealType(text: string, occurredAt: string | null): MealType {
  const normalizedText = text.trim().toLowerCase();

  if (/早餐|早饭|breakfast/.test(normalizedText)) {
    return 'breakfast';
  }

  if (/午餐|午饭|lunch/.test(normalizedText)) {
    return 'lunch';
  }

  if (/晚餐|晚饭|dinner/.test(normalizedText)) {
    return 'dinner';
  }

  if (occurredAt) {
    const hour = Number(occurredAt.slice(11, 13));

    if (hour >= 4 && hour < 10) {
      return 'breakfast';
    }

    if (hour >= 10 && hour < 15) {
      return 'lunch';
    }

    if (hour >= 17 && hour < 22) {
      return 'dinner';
    }
  }

  return 'snack';
}

function getDefaultMealTime(mealType: MealType): string {
  switch (mealType) {
    case 'breakfast':
      return '08:00:00';
    case 'lunch':
      return '12:30:00';
    case 'dinner':
      return '18:30:00';
    case 'snack':
      return '15:30:00';
  }
}

function hasExplicitMealCue(text: string): boolean {
  return /早餐|早饭|breakfast|午餐|午饭|lunch|晚餐|晚饭|dinner|加餐|零食|下午茶|夜宵|snack/i.test(
    text,
  );
}

function formatDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function shiftDate(baseDate: Date, days: number): Date {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function extractCaptionDateStamp(
  text: string,
  referenceTimestamp: Date,
): string | null {
  const explicitDate = text.match(/(\d{4}-\d{2}-\d{2})/);

  if (explicitDate) {
    return explicitDate[1] ?? null;
  }

  if (/前天/i.test(text)) {
    return formatDateStamp(shiftDate(referenceTimestamp, -2));
  }

  if (/昨天|yesterday/i.test(text)) {
    return formatDateStamp(shiftDate(referenceTimestamp, -1));
  }

  if (/今天|today/i.test(text)) {
    return formatDateStamp(referenceTimestamp);
  }

  return null;
}

function isDateOnlyMidnightTimestamp(value: string | null): value is string {
  return (
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2} 00:00:00$/.test(value)
  );
}

function resolveFoodPhotoOccurredAt(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
  mealType: MealType,
  referenceTimestamp: Date,
): string | undefined {
  if (
    extraction.occurredAt &&
    !isDateOnlyMidnightTimestamp(extraction.occurredAt)
  ) {
    return extraction.occurredAt;
  }

  const mealTime = getDefaultMealTime(mealType);
  const captionDateStamp = extractCaptionDateStamp(caption, referenceTimestamp);

  if (isDateOnlyMidnightTimestamp(extraction.occurredAt)) {
    return `${extraction.occurredAt.slice(0, 10)} ${mealTime}`;
  }

  if (hasExplicitMealCue(caption)) {
    return `${captionDateStamp ?? formatDateStamp(referenceTimestamp)} ${mealTime}`;
  }

  if (captionDateStamp) {
    return `${captionDateStamp} ${referenceTimestamp.toTimeString().slice(0, 8)}`;
  }

  return undefined;
}

function buildFoodPhotoMealText(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
): string {
  return (
    [
      asTrimmedString(extraction.summary),
      asTrimmedString(extraction.foodName),
      asTrimmedString(caption),
      asTrimmedString(extraction.recognizedText),
    ].find(Boolean) || 'OCR food photo'
  );
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

function toNutritionLabelUpdateRequest(
  rowNumber: number,
  extraction: HealthScreenshotExtractionResult,
  caption: string,
): UpdateDataRequest {
  const foodName =
    extraction.foodName || asTrimmedString(caption) || 'OCR nutrition label';

  return {
    tool: 'updateData',
    sheet: 'REF_CALORIES',
    selector: {
      type: 'row-number',
      rowNumber,
    },
    updates: {
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

function toFoodPhotoRequest(
  extraction: HealthScreenshotExtractionResult,
  caption: string,
  referenceTimestamp: Date = new Date(),
): InsertDataRequest {
  const mealText = buildFoodPhotoMealText(extraction, caption);
  const routingText = [caption, extraction.summary, extraction.foodName]
    .filter(Boolean)
    .join(' ');
  const mealType = inferMealType(routingText, extraction.occurredAt);
  const occurredAt = resolveFoodPhotoOccurredAt(
    extraction,
    caption,
    mealType,
    referenceTimestamp,
  );

  return {
    tool: 'insertData',
    sheet: 'FOOD_LOG',
    record: {
      occurred_at: occurredAt,
      meal_type: mealType,
      meal_text: mealText,
      calories_kcal: extraction.caloriesKcal,
      protein_g: extraction.proteinG,
      fat_g: extraction.fatG,
      carbs_g: extraction.carbsG,
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
