import { estimateIngredientCalories } from './estimation';
import { refCaloriesTable } from '../../tables';
import type {
  FoodLogInsertRequest,
  IngredientEstimateInput,
  MealResolvedItem,
  MealResolutionResult,
  MealStructureResult,
  MealType,
  InsertDataRequest,
  ToolRecord,
} from '../../types';
import {
  toNullableNumber,
  sumNullableNumbers,
  normalizeText,
  uniqueValues,
} from '../../utils/value';
import { resolveReferenceScale, scaleNullableNumber } from './units';

const MEAL_ITEM_SEPARATOR = /\s*(?:,|，|、|\+|\/|\n|和)\s*/;

function buildDraftItems(mealText: string): IngredientEstimateInput[] {
  if (!mealText) {
    return [];
  }

  return mealText
    .split(MEAL_ITEM_SEPARATOR)
    .map((itemName) => itemName.trim())
    .filter(Boolean)
    .map((itemName) => ({
      itemName,
      quantity: 1,
      unit: 'serving',
    }));
}

function normalizeStructuredItems(
  items: IngredientEstimateInput[] | undefined,
): IngredientEstimateInput[] {
  if (!items || items.length === 0) {
    return [];
  }

  return items
    .map((item) => ({
      itemName: normalizeText(item.itemName),
      quantity: item.quantity,
      unit: normalizeText(item.unit),
    }))
    .filter(
      (item) =>
        Boolean(item.itemName) &&
        Boolean(item.unit) &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    );
}

function resolveDraftItem(item: IngredientEstimateInput): MealResolvedItem {
  const matchedReference = refCaloriesTable.findByFoodName(item.itemName);

  if (!matchedReference) {
    return {
      ...item,
      estimatedCalories: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      source: 'ai',
      note: 'no local REF_CALORIES match yet',
    };
  }

  const referenceScale = resolveReferenceScale(item, matchedReference);

  if (referenceScale === null) {
    return {
      ...item,
      estimatedCalories: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      source: 'ai',
      note: 'local REF_CALORIES match found, but quantity/unit could not be scaled reliably',
    };
  }

  return {
    ...item,
    estimatedCalories: scaleNullableNumber(
      matchedReference.calories_kcal,
      referenceScale,
    ),
    proteinG: scaleNullableNumber(matchedReference.protein_g, referenceScale),
    fatG: scaleNullableNumber(matchedReference.fat_g, referenceScale),
    carbsG: scaleNullableNumber(matchedReference.carbs_g, referenceScale),
    source: 'reference',
    linkedFoodRefId: matchedReference.food_ref_id,
    note: 'matched local REF_CALORIES by item name and scaled by quantity/unit',
  };
}

function toItemResolution(
  draft: MealStructureResult,
  items: MealResolvedItem[],
): MealResolutionResult {
  const matchedItems = items.filter((item) => item.source === 'reference');
  const linkedFoodRefIds = uniqueValues(
    matchedItems
      .map((item) => item.linkedFoodRefId)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      ),
  );

  if (
    matchedItems.length === 0 &&
    items.every((item) => item.estimatedCalories === null)
  ) {
    return {
      mealType: draft.mealType,
      mealText: draft.mealText,
      shouldPersist: draft.shouldPersist,
      estimatedCalories: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      linkedFoodRefIds: [],
      items,
      note: 'food-workflow: no local reference match',
    };
  }

  return {
    mealType: draft.mealType,
    mealText: draft.mealText,
    shouldPersist: draft.shouldPersist,
    estimatedCalories: sumNullableNumbers(
      items.map((item) => item.estimatedCalories),
    ),
    proteinG: sumNullableNumbers(items.map((item) => item.proteinG)),
    fatG: sumNullableNumbers(items.map((item) => item.fatG)),
    carbsG: sumNullableNumbers(items.map((item) => item.carbsG)),
    linkedFoodRefIds,
    items,
    note:
      matchedItems.length === items.length
        ? 'food-workflow: enriched all items from local REF_CALORIES'
        : matchedItems.length > 0
          ? 'food-workflow: partially enriched from local REF_CALORIES'
          : 'food-workflow: estimated unresolved items with AI fallback',
  };
}

export function buildMealStructure(
  record: ToolRecord,
  structuredItems?: IngredientEstimateInput[],
): MealStructureResult {
  const mealText = normalizeText(record.meal_text);
  const mealType = (record.meal_type as MealType | undefined) ?? 'snack';
  const items = normalizeStructuredItems(structuredItems);
  const draftItems = items.length > 0 ? items : buildDraftItems(mealText);

  return {
    mealType,
    mealText,
    shouldPersist: Boolean(mealText),
    items: draftItems,
    note: !mealText
      ? 'food-workflow: empty meal_text'
      : items.length > 0
        ? 'food-workflow: using AI-structured meal items'
        : draftItems.length <= 1
          ? 'food-workflow: single-item draft from meal_text'
          : 'food-workflow: multi-item draft from meal_text',
  };
}

export function resolveMealFromReferences(
  draft: MealStructureResult,
): MealResolutionResult {
  return toItemResolution(draft, draft.items.map(resolveDraftItem));
}

export function resolveMealWithAiFallback(
  draft: MealStructureResult,
  referenceTimestamp: Date,
): MealResolutionResult {
  const localResolution = resolveMealFromReferences(draft);
  const unresolvedItems = localResolution.items.filter(
    (item) => item.estimatedCalories === null,
  );

  if (unresolvedItems.length === 0) {
    return localResolution;
  }

  try {
    const aiEstimates = estimateIngredientCalories(
      unresolvedItems,
      referenceTimestamp,
    );
    let aiIndex = 0;
    const mergedItems = localResolution.items.map((item) => {
      if (item.estimatedCalories !== null) {
        return item;
      }

      const estimate = aiEstimates[aiIndex];
      aiIndex += 1;

      return {
        ...item,
        estimatedCalories: estimate?.estimatedCalories ?? null,
        note: estimate?.note || item.note,
      };
    });

    return toItemResolution(draft, mergedItems);
  } catch {
    return localResolution;
  }
}

export function applyResolvedFieldsToFoodRecord(
  baseRecord: ToolRecord,
  draft: MealStructureResult,
  resolution: MealResolutionResult,
): ToolRecord {
  const nextRecord: ToolRecord = {
    ...baseRecord,
    meal_text: draft.mealText,
  };

  if (
    (nextRecord.linked_food_ref_ids === undefined ||
      nextRecord.linked_food_ref_ids === '') &&
    resolution.linkedFoodRefIds.length > 0
  ) {
    nextRecord.linked_food_ref_ids = resolution.linkedFoodRefIds.join(', ');
  }

  const fieldPairs: Array<
    ['calories_kcal' | 'protein_g' | 'fat_g' | 'carbs_g', number | null]
  > = [
    ['calories_kcal', resolution.estimatedCalories],
    ['protein_g', resolution.proteinG],
    ['fat_g', resolution.fatG],
    ['carbs_g', resolution.carbsG],
  ];

  fieldPairs.forEach(([field, value]) => {
    if (toNullableNumber(nextRecord[field]) === undefined && value !== null) {
      nextRecord[field] = value;
    }
  });

  return nextRecord;
}

export function enrichFoodInsertRecord(record: ToolRecord): ToolRecord {
  const draft = buildMealStructure(record);
  const resolution = resolveMealFromReferences(draft);
  return applyResolvedFieldsToFoodRecord(record, draft, resolution);
}

export function extractStructuredItems(
  request: InsertDataRequest | FoodLogInsertRequest,
): IngredientEstimateInput[] | undefined {
  return request.tool === 'insertFoodLog' ? request.items : undefined;
}
