import { foodLogRepository, stockRepository } from '../repositories';
import { convertQuantity } from './food-analysis';
import type { MealResolutionResult } from '../types';
import type {
  MealPersistResult,
  ParsedIngredient,
} from '../types/food-analysis';

type PersistMealInput = {
  timestamp: Date;
  mealType: MealResolutionResult['mealType'];
  mealText: string;
  note: string;
  items: ParsedIngredient[];
};

type StockSyncResult = {
  matchedCount: number;
  updatedCount: number;
  skippedCount: number;
  linkedStockItemIds: string[];
};

type MealAggregate = {
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  vegetableG: number | null;
  linkedFoodRefIds: string[];
};

export function enrichParsedIngredientsWithFallback(
  resolution: MealResolutionResult,
): ParsedIngredient[] {
  return resolution.items.map((item) => ({
    sourceSegment: `${item.quantity}${item.unit}${item.itemName}`,
    itemName: item.itemName,
    quantity: item.quantity,
    unit: item.unit,
    estimatedCalories: item.estimatedCalories,
    linkedFoodRefId: item.linkedFoodRefId ?? '',
    matchedReference: null,
  }));
}

function roundToOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function addNullable(current: number | null, next: number): number {
  return roundToOneDecimal((current ?? 0) + next);
}

function uniqValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isVegetableName(name: string): boolean {
  return /(菠菜|生菜|油麦菜|西兰花|西葫芦|茼蒿|番茄|娃娃菜|苋菜|枸杞芽|海鲜菇|香菇|金针菇|蘑菇|黄瓜|芦笋|青椒|彩椒|花菜|白菜|卷心菜|甘蓝|苦瓜|南瓜|冬瓜|丝瓜|萝卜|胡萝卜|芹菜|豆芽|豆苗)/.test(
    name,
  );
}

function buildMealAggregate(items: ParsedIngredient[]): MealAggregate {
  let caloriesKcal: number | null = null;
  let proteinG: number | null = null;
  let fatG: number | null = null;
  let carbsG: number | null = null;
  let vegetableG: number | null = null;

  for (const item of items) {
    if (item.estimatedCalories !== null) {
      caloriesKcal = addNullable(caloriesKcal, item.estimatedCalories);
    }

    const reference = item.matchedReference;

    if (
      reference &&
      reference.servingSize !== null &&
      reference.servingSize > 0
    ) {
      const convertedQuantity = convertQuantity(
        item.quantity,
        item.unit,
        reference.unit,
      );

      if (convertedQuantity !== null) {
        if (reference.protein !== null) {
          proteinG = addNullable(
            proteinG,
            (convertedQuantity * reference.protein) / reference.servingSize,
          );
        }

        if (reference.fat !== null) {
          fatG = addNullable(
            fatG,
            (convertedQuantity * reference.fat) / reference.servingSize,
          );
        }

        if (reference.carbs !== null) {
          carbsG = addNullable(
            carbsG,
            (convertedQuantity * reference.carbs) / reference.servingSize,
          );
        }
      }
    }

    if (isVegetableName(item.itemName)) {
      const grams = convertQuantity(item.quantity, item.unit, 'g');

      if (grams !== null) {
        vegetableG = addNullable(vegetableG, grams);
      }
    }
  }

  return {
    caloriesKcal,
    proteinG,
    fatG,
    carbsG,
    vegetableG,
    linkedFoodRefIds: uniqValues(items.map((item) => item.linkedFoodRefId)),
  };
}

function syncStock(
  items: ParsedIngredient[],
  timestamp: Date,
): StockSyncResult {
  let matchedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const linkedStockItemIds: string[] = [];

  for (const item of items) {
    const stock = stockRepository.findByName(item.itemName);

    if (!stock || stock.quantity === null) {
      skippedCount += 1;
      continue;
    }

    matchedCount += 1;
    const convertedQuantity = convertQuantity(
      item.quantity,
      item.unit,
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

    linkedStockItemIds.push(stock.stock_item_id);
    updatedCount += 1;
  }

  return {
    matchedCount,
    updatedCount,
    skippedCount,
    linkedStockItemIds: uniqValues(linkedStockItemIds),
  };
}

export function persistMealRecord(input: PersistMealInput): MealPersistResult {
  const aggregate = buildMealAggregate(input.items);
  const stockSync = syncStock(input.items, input.timestamp);
  const foodLogEntry = foodLogRepository.createMealEntry(
    input.timestamp,
    input.mealType,
    input.mealText,
    aggregate.caloriesKcal,
    aggregate.proteinG,
    aggregate.fatG,
    aggregate.carbsG,
    aggregate.vegetableG,
    aggregate.linkedFoodRefIds.join(', '),
    stockSync.linkedStockItemIds.join(', '),
    input.note,
  );

  foodLogRepository.append(foodLogEntry);

  return {
    foodLogId: foodLogEntry.food_log_id,
    stockSync,
  };
}
