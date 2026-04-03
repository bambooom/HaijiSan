import type { MealType, ParseStatus } from './core';
import type { IngredientEstimateResult, MealResolutionResult } from './food';
import type { FoodReference } from './repositories';

export type ParsedIngredient = {
  sourceSegment: string;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedCalories: number | null;
  linkedFoodRefId: string;
  matchedReference: FoodReference | null;
};

export type ParsedFoodInput = {
  mealType: MealType;
  mealText: string;
  items: ParsedIngredient[];
  segmentCount: number;
};

export type MealEstimateResult = {
  mealType: MealType;
  mealText: string;
  items: ParsedIngredient[];
  segmentCount: number;
  estimatedCalories: number | null;
  matchedCount: number;
  unmatchedSegments: string[];
};

export interface MealReferenceFact {
  referenceId: string;
  itemName: string;
  servingSize: number;
  unit: string;
  calories: number;
  referenceName: string;
}

export type ResolvedMealEstimate = {
  estimate: MealEstimateResult;
  shouldPersist: boolean;
  parseNote: string;
};

export type EstimatedMealSummary = {
  detailLines: string;
  totalEstimatedCalories: number | null;
  aiResolvedCount: number;
  pendingParts: string[];
};

export type EstimatedMealMeta = {
  parseStatus: ParseStatus;
  note: string;
};

export type MealPersistResult = {
  foodLogId: string;
  stockSync: {
    matchedCount: number;
    updatedCount: number;
    skippedCount: number;
  };
};

export type ParsedMealEstimateInput = {
  estimate: MealEstimateResult;
  aiEstimateMap: Map<string, IngredientEstimateResult>;
};

export type ResolvedMealTextInput = {
  detailLines: string;
  estimatedCalories: number | null;
};

export type EstimatedMealTextInput = {
  detailLines: string;
  totalEstimatedCalories: number;
  pendingParts: string[];
  aiResolvedCount: number;
  aiFallbackFailed: boolean;
};

export type ResolvedMealRecordInput = {
  mealType: MealResolutionResult['mealType'];
  mealText: string;
};
