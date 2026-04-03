import { AI_INTENT_VALUES } from '../../constants/ai';
import { isDateStamp } from '../../shared/date-reference';
import type {
  AiIntent,
  AiPlan,
  AiResponseMode,
  AiStockItem,
  HealthScreenshotExtractionResult,
  HealthScreenshotKind,
  IngredientEstimateConfidence,
  IngredientEstimateInput,
  IngredientEstimateResult,
  MealResolutionResult,
  MealResolvedItem,
  MealStructureResult,
  MealType,
  NutritionLabelReferenceResult,
  SleepQuality,
  WorkoutLevel,
} from '../../types';
import type {
  HealthScreenshotEnvelope,
  IngredientEstimateEnvelope,
  MealResolutionEnvelope,
  MealStructureEnvelope,
  NutritionLabelEnvelope,
  StockItemEnvelope,
} from './types';
import { HEALTH_SCREENSHOT_KIND_VALUES } from '../../types';

const AI_RESPONSE_MODES = new Set<AiResponseMode>([
  'reply',
  'command',
  'clarify',
]);
const AI_INTENTS = new Set<AiIntent>(AI_INTENT_VALUES);
const SLEEP_QUALITIES = new Set<SleepQuality>(['good', 'normal', 'poor']);
const WORKOUT_LEVELS = new Set<WorkoutLevel>(['easy', 'medium', 'hard']);
const MEAL_TYPES = new Set<MealType>(['breakfast', 'lunch', 'dinner', 'snack']);
const ESTIMATE_CONFIDENCES = new Set<IngredientEstimateConfidence>([
  'low',
  'medium',
  'high',
]);
const HEALTH_SCREENSHOT_KINDS = new Set<HealthScreenshotKind>(
  HEALTH_SCREENSHOT_KIND_VALUES,
);

function roundConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function asTargetDate(value: unknown): string | undefined {
  return typeof value === 'string' && isDateStamp(value) ? value : undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function asAiStockItem(value: unknown): AiStockItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as StockItemEnvelope;
  const name = asString(raw.name);
  const quantity = asNullableNumber(raw.quantity);

  if (!name || typeof quantity !== 'number') {
    return null;
  }

  return {
    name,
    quantity,
    unit: asString(raw.unit),
    purchaseChannel: asString(raw.purchaseChannel),
  };
}

function asAiStockItems(value: unknown): AiStockItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => asAiStockItem(item))
    .filter((item): item is AiStockItem => item !== null);

  return items.length > 0 ? items : undefined;
}

function asMode(value: unknown): AiResponseMode {
  if (
    typeof value === 'string' &&
    AI_RESPONSE_MODES.has(value as AiResponseMode)
  ) {
    return value as AiResponseMode;
  }

  return 'clarify';
}

function asIntent(value: unknown): AiIntent {
  if (typeof value === 'string' && AI_INTENTS.has(value as AiIntent)) {
    return value as AiIntent;
  }

  return 'chat';
}

function asSleepQuality(value: unknown): SleepQuality | undefined {
  if (typeof value === 'string' && SLEEP_QUALITIES.has(value as SleepQuality)) {
    return value as SleepQuality;
  }

  return undefined;
}

function asWorkoutLevel(value: unknown): WorkoutLevel | undefined {
  if (typeof value === 'string' && WORKOUT_LEVELS.has(value as WorkoutLevel)) {
    return value as WorkoutLevel;
  }

  return undefined;
}

function asMealType(value: unknown): MealType | undefined {
  if (typeof value === 'string' && MEAL_TYPES.has(value as MealType)) {
    return value as MealType;
  }

  return undefined;
}

function asEstimateConfidence(value: unknown): IngredientEstimateConfidence {
  if (
    typeof value === 'string' &&
    ESTIMATE_CONFIDENCES.has(value as IngredientEstimateConfidence)
  ) {
    return value as IngredientEstimateConfidence;
  }

  return 'medium';
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asResolvedItemSource(value: unknown): 'reference' | 'ai' {
  return value === 'reference' ? 'reference' : 'ai';
}

function asHealthScreenshotKind(value: unknown): HealthScreenshotKind {
  return typeof value === 'string' &&
    HEALTH_SCREENSHOT_KINDS.has(value as HealthScreenshotKind)
    ? (value as HealthScreenshotKind)
    : 'unsupported';
}

export function normalizePlan(raw: Record<string, unknown>): AiPlan {
  const mode = asMode(raw.mode);
  const intent = asIntent(raw.intent);
  const reply =
    asString(raw.reply) ??
    (mode === 'clarify'
      ? '我还差一点关键信息。你再补充一下，我就能继续处理。'
      : '我知道你的意思了。');

  const plan: AiPlan = {
    mode,
    intent,
    reply,
    targetDate: asTargetDate(raw.targetDate),
    weightKg: asNullableNumber(raw.weightKg),
    bmi: asNullableNumber(raw.bmi),
    bodyFatPct: asNullableNumber(raw.bodyFatPct),
    leanBodyMassKg: asNullableNumber(raw.leanBodyMassKg),
    cycleDay: asNullableNumber(raw.cycleDay),
    symptom: asString(raw.symptom),
    periodNote: asString(raw.periodNote),
    sleepStart: asString(raw.sleepStart),
    sleepEnd: asString(raw.sleepEnd),
    sleepQuality: asSleepQuality(raw.sleepQuality),
    workoutName: asString(raw.workoutName),
    durationMin: asNullableNumber(raw.durationMin),
    workoutLevel: asWorkoutLevel(raw.workoutLevel),
    mealType: asMealType(raw.mealType),
    mealText: asString(raw.mealText),
    stockQuery: asString(raw.stockQuery),
    stockItemName: asString(raw.stockItemName),
    stockQuantity: asNullableNumber(raw.stockQuantity),
    stockUnit: asString(raw.stockUnit),
    stockItems: asAiStockItems(raw.stockItems),
    purchaseChannel: asString(raw.purchaseChannel),
    note: asString(raw.note),
  };

  plan.confidence = computePlanConfidence(plan);

  return plan;
}

function computePlanConfidence(plan: AiPlan): number {
  if (plan.mode === 'reply') {
    return roundConfidence(plan.intent === 'chat' ? 0.92 : 0.72);
  }

  if (plan.mode === 'clarify') {
    return roundConfidence(plan.reply.trim() ? 0.8 : 0.55);
  }

  switch (plan.intent) {
    case 'weight':
      return roundConfidence(
        [plan.weightKg, plan.bmi, plan.bodyFatPct, plan.leanBodyMassKg].some(
          (value) => typeof value === 'number',
        )
          ? 0.95
          : 0.35,
      );
    case 'poo':
      return 0.95;
    case 'period':
      return roundConfidence(
        typeof plan.cycleDay === 'number' || Boolean(plan.periodNote)
          ? 0.8
          : 0.65,
      );
    case 'symptom':
      return roundConfidence(plan.symptom ? 0.82 : 0.4);
    case 'sleep':
      return roundConfidence(plan.sleepStart && plan.sleepEnd ? 0.9 : 0.35);
    case 'workout':
      return roundConfidence(
        plan.workoutName && typeof plan.durationMin === 'number' ? 0.88 : 0.38,
      );
    case 'food':
    case 'food_estimate':
      return roundConfidence(
        plan.mealText ? (plan.mealType ? 0.85 : 0.72) : 0.32,
      );
    case 'nutrition_summary':
      return 0.95;
    case 'stock_adjust':
    case 'stock_set': {
      const hasBatchItems =
        Array.isArray(plan.stockItems) && plan.stockItems.length > 0;
      const hasSingleItem = Boolean(
        plan.stockItemName && typeof plan.stockQuantity === 'number',
      );

      return roundConfidence(hasBatchItems || hasSingleItem ? 0.9 : 0.3);
    }
    case 'stock_check':
      return 0.95;
    case 'chat':
      return 0.9;
  }
}

export function parseIngredientEstimateResults(
  items: IngredientEstimateInput[],
  raw: IngredientEstimateEnvelope,
): IngredientEstimateResult[] {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  return items.map((item, index) => {
    const rawItem = rawItems[index] ?? {};

    return {
      itemName: item.itemName,
      quantity: item.quantity,
      unit: item.unit,
      estimatedCalories: asNullableNumber(rawItem.estimatedCalories) ?? null,
      confidence: asEstimateConfidence(rawItem.confidence),
      note: asString(rawItem.note) ?? '',
    };
  });
}

export function parseMealStructure(
  raw: MealStructureEnvelope,
): MealStructureResult | null {
  const mealType = asMealType(raw.mealType);
  const mealText = asString(raw.mealText);
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems
    .map((item) => ({
      itemName: asString(item.itemName),
      quantity: asNullableNumber(item.quantity),
      unit: asString(item.unit),
    }))
    .filter(
      (
        item,
      ): item is {
        itemName: string;
        quantity: number;
        unit: string;
      } => {
        return (
          Boolean(item.itemName) &&
          typeof item.quantity === 'number' &&
          item.quantity > 0 &&
          Boolean(item.unit)
        );
      },
    );

  if (!mealType || !mealText) {
    return null;
  }

  return {
    mealType,
    mealText,
    shouldPersist: asBoolean(raw.shouldPersist),
    items,
    note: asString(raw.note) ?? '',
  };
}

export function parseMealResolution(
  raw: MealResolutionEnvelope,
): MealResolutionResult | null {
  const mealType = asMealType(raw.mealType);
  const mealText = asString(raw.mealText);
  const estimatedCalories = asNullableNumber(raw.estimatedCalories) ?? null;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems
    .map((item) => ({
      itemName: asString(item.itemName),
      quantity: asNullableNumber(item.quantity),
      unit: asString(item.unit),
      estimatedCalories: asNullableNumber(item.estimatedCalories) ?? null,
      source: asResolvedItemSource(item.source),
      note: asString(item.note) ?? '',
    }))
    .filter((item): item is MealResolvedItem => {
      return (
        Boolean(item.itemName) &&
        typeof item.quantity === 'number' &&
        item.quantity > 0 &&
        Boolean(item.unit)
      );
    });

  if (!mealType || !mealText || items.length === 0) {
    return null;
  }

  return {
    mealType,
    mealText,
    shouldPersist: asBoolean(raw.shouldPersist),
    estimatedCalories,
    items,
    note: asString(raw.note) ?? '',
  };
}

export function parseNutritionLabelReference(
  raw: NutritionLabelEnvelope,
): NutritionLabelReferenceResult {
  return {
    foodName: asString(raw.foodName) ?? null,
    brand: asString(raw.brand) ?? '',
    servingSize: asNullableNumber(raw.servingSize) ?? null,
    servingUnit: asString(raw.servingUnit) ?? '',
    caloriesKcal: asNullableNumber(raw.caloriesKcal) ?? null,
    proteinG: asNullableNumber(raw.proteinG) ?? null,
    fatG: asNullableNumber(raw.fatG) ?? null,
    carbsG: asNullableNumber(raw.carbsG) ?? null,
    confidence: asNullableNumber(raw.confidence) ?? null,
    note: asString(raw.note) ?? '',
  };
}

export function parseHealthScreenshot(
  raw: HealthScreenshotEnvelope,
): HealthScreenshotExtractionResult {
  return {
    kind: asHealthScreenshotKind(raw.kind),
    appSource: asString(raw.appSource) ?? 'unknown',
    confidence: asNullableNumber(raw.confidence) ?? null,
    foodName: asString(raw.foodName) ?? null,
    brand: asString(raw.brand) ?? '',
    servingSize: asNullableNumber(raw.servingSize) ?? null,
    servingUnit: asString(raw.servingUnit) ?? '',
    caloriesKcal: asNullableNumber(raw.caloriesKcal) ?? null,
    proteinG: asNullableNumber(raw.proteinG) ?? null,
    fatG: asNullableNumber(raw.fatG) ?? null,
    carbsG: asNullableNumber(raw.carbsG) ?? null,
    weightKg: asNullableNumber(raw.weightKg) ?? null,
    bmi: asNullableNumber(raw.bmi) ?? null,
    bodyFatPct: asNullableNumber(raw.bodyFatPct) ?? null,
    leanBodyMassKg: asNullableNumber(raw.leanBodyMassKg) ?? null,
    sleepStart: asString(raw.sleepStart) ?? null,
    sleepEnd: asString(raw.sleepEnd) ?? null,
    sleepHours: asNullableNumber(raw.sleepHours) ?? null,
    sleepQuality: asSleepQuality(raw.sleepQuality) ?? null,
    workoutName: asString(raw.workoutName) ?? null,
    durationMin: asNullableNumber(raw.durationMin) ?? null,
    workoutLevel: asWorkoutLevel(raw.workoutLevel) ?? null,
    workoutCaloriesKcal: asNullableNumber(raw.workoutCaloriesKcal) ?? null,
    note: asString(raw.note) ?? '',
  };
}
