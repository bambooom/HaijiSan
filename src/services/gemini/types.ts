import type { IngredientEstimateConfidence } from '../../types';
import type {
  HealthScreenshotExtractionResult,
  HealthScreenshotKind,
  NutritionLabelReferenceResult,
} from '../../types';

export interface GeminiTextPart {
  text?: string;
}

export interface GeminiInlineDataPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export type GeminiRequestPart = GeminiTextPart | GeminiInlineDataPart;

export interface GeminiContent {
  parts?: GeminiRequestPart[];
}

export interface GeminiCandidate {
  content?: GeminiContent;
}

export interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
}

export interface IngredientEstimateEnvelope {
  items?: Array<Record<string, unknown>>;
}

export interface MealStructureEnvelope {
  mealType?: unknown;
  mealText?: unknown;
  shouldPersist?: unknown;
  items?: Array<Record<string, unknown>>;
  note?: unknown;
}

export interface MealResolutionEnvelope {
  mealType?: unknown;
  mealText?: unknown;
  shouldPersist?: unknown;
  estimatedCalories?: unknown;
  items?: Array<Record<string, unknown>>;
  note?: unknown;
}

export interface NutritionLabelEnvelope {
  foodName?: unknown;
  brand?: unknown;
  servingSize?: unknown;
  servingUnit?: unknown;
  caloriesKcal?: unknown;
  proteinG?: unknown;
  fatG?: unknown;
  carbsG?: unknown;
  confidence?: unknown;
  note?: unknown;
}

export interface HealthScreenshotEnvelope extends NutritionLabelEnvelope {
  kind?: unknown;
  appSource?: unknown;
  weightKg?: unknown;
  bmi?: unknown;
  bodyFatPct?: unknown;
  leanBodyMassKg?: unknown;
  sleepStart?: unknown;
  sleepEnd?: unknown;
  sleepHours?: unknown;
  sleepQuality?: unknown;
  workoutName?: unknown;
  durationMin?: unknown;
  workoutLevel?: unknown;
  workoutCaloriesKcal?: unknown;
}

export interface StockItemEnvelope {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  purchaseChannel?: unknown;
}

export type ParsedIngredientEstimate = {
  estimatedCalories: number | null;
  confidence: IngredientEstimateConfidence;
  note: string;
};
