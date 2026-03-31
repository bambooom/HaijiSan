import type { MealType, ParseStatus } from './core';
import type { FoodItemEntry } from './records';

export interface PendingMealRecordInput {
  createdAt: string;
  mealType: MealType;
  mealText: string;
  estimatedCalories: number | null;
  parseStatus: ParseStatus;
  note: string;
  items: FoodItemEntry[];
}

export interface PendingMappedCommandAction {
  kind: 'mapped-command';
  createdAt: string;
  sourceText: string;
  previewText: string;
  commandText: string;
  note: string;
}

export interface PendingMealRecordAction {
  kind: 'meal-record';
  createdAt: string;
  sourceText: string;
  previewText: string;
  mealRecord: PendingMealRecordInput;
  note: string;
}

export type PendingAiAction =
  | PendingMappedCommandAction
  | PendingMealRecordAction;
