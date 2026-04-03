import {
  foodItemsRepository,
  foodLogRepository,
  stockRepository,
} from '../repositories';
import { convertQuantity, normalizeUnit } from './food-analysis';
import type {
  FoodItemEntry,
  IngredientEstimateResult,
  MealResolutionResult,
  ParseStatus,
} from '../types';
import type {
  MealPersistResult,
  ParsedIngredient,
} from '../types/food-analysis';

type PersistMealInput = {
  timestamp: Date;
  mealType: MealResolutionResult['mealType'];
  mealText: string;
  estimatedCalories: number | null;
  parseStatus: ParseStatus;
  note: string;
  items: FoodItemEntry[];
};

type StockSyncResult = {
  matchedCount: number;
  updatedCount: number;
  skippedCount: number;
};

function buildAiConfidence(
  estimate: IngredientEstimateResult | undefined,
): number | null {
  if (!estimate) {
    return null;
  }

  if (estimate.confidence === 'high') {
    return 0.9;
  }

  if (estimate.confidence === 'medium') {
    return 0.7;
  }

  if (estimate.confidence === 'low') {
    return 0.4;
  }

  return null;
}

export function buildFoodItemEntriesFromParsed(
  foodLogId: string,
  items: ParsedIngredient[],
  aiEstimateMap: Map<string, IngredientEstimateResult>,
): FoodItemEntry[] {
  return items.map((item) => {
    const fallbackEstimate = aiEstimateMap.get(
      `${item.itemName}|${item.quantity}|${item.unit}`,
    );
    const estimatedCalories =
      item.estimatedCalories ?? fallbackEstimate?.estimatedCalories ?? null;

    return {
      parent_food_log_id: foodLogId,
      item_name: item.itemName,
      quantity: item.quantity,
      unit: item.unit,
      estimated_calories: estimatedCalories,
      linked_food_ref_id: item.linkedFoodRefId,
      linked_stock_item_id: '',
      ai_confidence: buildAiConfidence(fallbackEstimate),
      note: item.matchedReference
        ? ''
        : fallbackEstimate?.note
          ? `AI estimate: ${fallbackEstimate.note}`
          : '',
    };
  });
}

export function buildFoodItemEntriesFromResolution(
  foodLogId: string,
  resolution: MealResolutionResult,
): FoodItemEntry[] {
  return resolution.items.map((item) => ({
    parent_food_log_id: foodLogId,
    item_name: item.itemName,
    quantity: item.quantity,
    unit: item.unit,
    estimated_calories: item.estimatedCalories,
    linked_food_ref_id: item.linkedFoodRefId ?? '',
    linked_stock_item_id: '',
    ai_confidence: item.source === 'reference' ? null : 0.7,
    note:
      item.note ||
      (item.source === 'reference' ? 'Reference-backed' : 'AI-estimated'),
  }));
}

function syncStock(entries: FoodItemEntry[], timestamp: Date): StockSyncResult {
  let matchedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    if (entry.quantity === null) {
      skippedCount += 1;
      continue;
    }

    const stock = stockRepository.findByName(entry.item_name);

    if (!stock || stock.quantity === null) {
      skippedCount += 1;
      continue;
    }

    matchedCount += 1;
    const convertedQuantity = convertQuantity(
      entry.quantity,
      entry.unit,
      stock.unit,
    );

    if (convertedQuantity === null) {
      skippedCount += 1;
      continue;
    }

    const nextQuantity = Number(
      (stock.quantity - convertedQuantity).toFixed(3),
    );

    if (nextQuantity < 0) {
      skippedCount += 1;
      continue;
    }

    const updated = stockRepository.updateQuantity(
      stock.item_name,
      nextQuantity,
      timestamp,
      stock.unit,
      undefined,
      stock.note,
    );

    if (!updated) {
      skippedCount += 1;
      continue;
    }

    entry.linked_stock_item_id = stock.stock_item_id;
    updatedCount += 1;
  }

  return { matchedCount, updatedCount, skippedCount };
}

export function persistMealRecord(input: PersistMealInput): MealPersistResult {
  const foodLogEntry = foodLogRepository.createMealEntry(
    input.timestamp,
    input.mealType,
    input.mealText,
    input.estimatedCalories,
    input.parseStatus,
    input.note,
  );

  foodLogRepository.append(foodLogEntry);

  const stockSync = syncStock(input.items, input.timestamp);

  if (input.items.length > 0) {
    foodItemsRepository.appendMany(
      input.items.map((entry) => ({
        ...entry,
        parent_food_log_id: foodLogEntry.food_log_id,
        unit: normalizeUnit(entry.unit),
      })),
    );
  }

  return {
    foodLogId: foodLogEntry.food_log_id,
    stockSync,
  };
}
