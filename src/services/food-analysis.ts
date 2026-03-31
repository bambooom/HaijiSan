import type { IngredientEstimateInput, MealType } from '../types';
import type {
  MealEstimateResult,
  ParsedFoodInput,
  ParsedIngredient,
} from '../types/food-analysis';
import type { FoodReference } from '../types/repositories';
import {
  countMeaningfulSegments,
  createParsedIngredient,
  inferMealTypeByPrefix,
  inferMealTypeByTimeHint,
  normalizeMealText,
  parseWeightedIngredient,
  splitMeaningfulSegments,
} from '../utils/food-analysis';

export function normalizeUnit(unit: string): string {
  const normalizedUnit = unit.trim().toLowerCase();

  if (normalizedUnit === '克') {
    return 'g';
  }

  if (normalizedUnit === '千克') {
    return 'kg';
  }

  if (normalizedUnit === '毫升') {
    return 'ml';
  }

  if (normalizedUnit === '升') {
    return 'l';
  }

  return normalizedUnit;
}

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const normalizedFromUnit = normalizeUnit(fromUnit);
  const normalizedToUnit = normalizeUnit(toUnit);

  if (normalizedFromUnit === normalizedToUnit) {
    return quantity;
  }

  if (normalizedFromUnit === 'kg' && normalizedToUnit === 'g') {
    return quantity * 1000;
  }

  if (normalizedFromUnit === 'g' && normalizedToUnit === 'kg') {
    return quantity / 1000;
  }

  if (normalizedFromUnit === 'l' && normalizedToUnit === 'ml') {
    return quantity * 1000;
  }

  if (normalizedFromUnit === 'ml' && normalizedToUnit === 'l') {
    return quantity / 1000;
  }

  return null;
}

export function inferMealType(content: string): {
  mealType: MealType;
  mealText: string;
} {
  const prefixedMeal = inferMealTypeByPrefix(content);

  if (prefixedMeal) {
    return prefixedMeal;
  }

  const trimmedContent = content.trim();

  return {
    mealType: inferMealTypeByTimeHint(trimmedContent),
    mealText: normalizeMealText(trimmedContent),
  };
}

export function estimateMealCaloriesFromStructured(
  mealType: MealType,
  mealText: string,
  items: IngredientEstimateInput[],
): MealEstimateResult | null {
  const parsedItems = items
    .map((item) => createParsedIngredient(item, estimateCaloriesForReference))
    .filter((item): item is ParsedIngredient => item !== null);

  if (parsedItems.length === 0) {
    return null;
  }

  const estimatedCalories = parsedItems.reduce<number | null>((sum, item) => {
    if (item.estimatedCalories === null) {
      return sum;
    }

    return (sum ?? 0) + item.estimatedCalories;
  }, null);
  const matchedCount = parsedItems.filter(
    (item) => item.estimatedCalories !== null,
  ).length;
  const unmatchedSegments = items
    .filter((item) => {
      return !parsedItems.some(
        (parsedItem) =>
          parsedItem.itemName === item.itemName &&
          parsedItem.quantity === item.quantity &&
          parsedItem.unit === item.unit,
      );
    })
    .map((item) => `${item.quantity}${item.unit}${item.itemName}`);

  return {
    mealType,
    mealText: normalizeMealText(mealText),
    items: parsedItems,
    segmentCount: items.length,
    estimatedCalories,
    matchedCount,
    unmatchedSegments,
  };
}

export function parseWeightedIngredients(text: string): ParsedIngredient[] {
  return text
    .split(/[+,，,]/)
    .map((segment) =>
      parseWeightedIngredient(segment, estimateCaloriesForReference),
    )
    .filter((item): item is ParsedIngredient => item !== null);
}

export function parseFoodContent(rawContent: string): ParsedFoodInput | null {
  const trimmedContent = rawContent.trim();

  if (!trimmedContent) {
    return null;
  }

  const { mealType, mealText } = inferMealType(trimmedContent);

  if (!mealText) {
    return null;
  }

  return {
    mealType,
    mealText,
    items: parseWeightedIngredients(mealText),
    segmentCount: countMeaningfulSegments(mealText),
  };
}

export function estimateMealCalories(
  rawContent: string,
): MealEstimateResult | null {
  const parsedFoodInput = parseFoodContent(rawContent);

  if (!parsedFoodInput) {
    return null;
  }

  const unmatchedSegments = splitMeaningfulSegments(
    parsedFoodInput.mealText,
  ).filter(
    (segment) =>
      !parsedFoodInput.items.some((item) => item.sourceSegment === segment),
  );
  const estimatedCalories = parsedFoodInput.items.reduce<number | null>(
    (sum, item) => {
      if (item.estimatedCalories === null) {
        return sum;
      }

      return (sum ?? 0) + item.estimatedCalories;
    },
    null,
  );
  const matchedCount = parsedFoodInput.items.filter(
    (item) => item.estimatedCalories !== null,
  ).length;

  return {
    mealType: parsedFoodInput.mealType,
    mealText: parsedFoodInput.mealText,
    items: parsedFoodInput.items,
    segmentCount: parsedFoodInput.segmentCount,
    estimatedCalories,
    matchedCount,
    unmatchedSegments,
  };
}

function estimateCaloriesForReference(
  quantity: number,
  unit: string,
  reference: FoodReference | null,
): number | null {
  if (
    !reference ||
    reference.servingSize === null ||
    reference.servingSize <= 0
  ) {
    return null;
  }

  const convertedQuantity = convertQuantity(quantity, unit, reference.unit);

  if (convertedQuantity === null) {
    return null;
  }

  return Number(
    ((convertedQuantity * reference.calories) / reference.servingSize).toFixed(
      1,
    ),
  );
}
