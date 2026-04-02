import type {
  FoodItemEntry,
  MealPersistResult,
  ParseStatus,
  PendingMealRecordAction,
} from '../types';
import { persistMealRecord } from './meal-recording';

type CreatePendingMealRecordActionInput = {
  timestamp: Date;
  traceId?: string;
  sourceText: string;
  previewText: string;
  note: string;
  mealType: PendingMealRecordAction['mealRecord']['mealType'];
  mealText: string;
  estimatedCalories: number | null;
  parseStatus: ParseStatus;
  mealNote: string;
  items: FoodItemEntry[];
};

export function createPendingMealRecordAction(
  input: CreatePendingMealRecordActionInput,
): PendingMealRecordAction {
  return {
    kind: 'meal-record',
    traceId: input.traceId,
    createdAt: input.timestamp.toISOString(),
    sourceText: input.sourceText,
    previewText: input.previewText,
    note: input.note,
    mealRecord: {
      createdAt: input.timestamp.toISOString(),
      mealType: input.mealType,
      mealText: input.mealText,
      estimatedCalories: input.estimatedCalories,
      parseStatus: input.parseStatus,
      note: input.mealNote,
      items: input.items,
    },
  };
}

export function confirmPendingMealRecordAction(
  action: PendingMealRecordAction,
  fallbackTimestamp: Date,
): MealPersistResult {
  const createdAt = new Date(action.mealRecord.createdAt);
  // Persist with the previewed timestamp when it is still valid.
  const timestamp = Number.isNaN(createdAt.getTime())
    ? fallbackTimestamp
    : createdAt;

  return persistMealRecord({
    timestamp,
    mealType: action.mealRecord.mealType,
    mealText: action.mealRecord.mealText,
    estimatedCalories: action.mealRecord.estimatedCalories,
    parseStatus: action.mealRecord.parseStatus,
    note: action.mealRecord.note,
    items: action.mealRecord.items,
  });
}
