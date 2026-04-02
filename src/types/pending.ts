import type { AiPlan, AiStockItem, MealType, ParseStatus } from './core';
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
  traceId?: string;
  createdAt: string;
  sourceText: string;
  previewText: string;
  commandText: string;
  note: string;
}

export interface PendingMealRecordAction {
  kind: 'meal-record';
  traceId?: string;
  createdAt: string;
  sourceText: string;
  previewText: string;
  mealRecord: PendingMealRecordInput;
  note: string;
}

export interface PendingStockBatchAction {
  kind: 'stock-batch';
  traceId?: string;
  createdAt: string;
  sourceText: string;
  previewText: string;
  operation: 'adjust' | 'set';
  items: AiStockItem[];
  note: string;
}

export interface PendingClarificationAction {
  kind: 'clarify';
  traceId?: string;
  createdAt: string;
  sourceText: string;
  clarificationReply: string;
  partialPlan: AiPlan;
  note: string;
}

export interface PendingConfirmationReceipt {
  traceId?: string;
  kind: Exclude<PendingAiAction['kind'], 'clarify'>;
  confirmedAt: string;
  status: 'processing' | 'completed' | 'failed';
  reply: string;
  note: string;
}

export type PendingAiAction =
  | PendingMappedCommandAction
  | PendingMealRecordAction
  | PendingStockBatchAction
  | PendingClarificationAction;
