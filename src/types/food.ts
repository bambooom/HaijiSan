import type { MealType } from './core';

export type IngredientEstimateConfidence = 'low' | 'medium' | 'high';

export interface IngredientEstimateInput {
  itemName: string;
  quantity: number;
  unit: string;
}

export interface IngredientEstimateResult extends IngredientEstimateInput {
  estimatedCalories: number | null;
  confidence: IngredientEstimateConfidence;
  note: string;
}

export interface MealStructureResult {
  mealType: MealType;
  mealText: string;
  shouldPersist: boolean;
  items: IngredientEstimateInput[];
  note: string;
}

export type MealResolvedItemSource = 'reference' | 'ai';

export interface MealResolvedItem extends IngredientEstimateInput {
  estimatedCalories: number | null;
  source: MealResolvedItemSource;
  note: string;
}

export interface MealResolutionResult {
  mealType: MealType;
  mealText: string;
  shouldPersist: boolean;
  estimatedCalories: number | null;
  items: MealResolvedItem[];
  note: string;
}
