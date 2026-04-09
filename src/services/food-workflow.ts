import { refCaloriesTable } from '../tables';
import type { MealType } from '../types';
import type {
  InsertDataRequest,
  InsertDataResult,
  ToolRecord,
} from '../tools/types';
import { executeInsertData } from '../tools';
import type {
  IngredientEstimateInput,
  MealResolvedItem,
  MealResolutionResult,
  MealStructureResult,
} from '../types/food';

const MEAL_ITEM_SEPARATOR = /\s*(?:,|，|、|\+|\/|\n|和)\s*/;

function normalizeMealText(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/[\s\u3000]+/g, ' ')
    : '';
}

function toNullableNumber(value: unknown): number | null | undefined {
  return typeof value === 'number' ? value : value === null ? null : undefined;
}

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

function sumNullableNumbers(values: Array<number | null | undefined>): number | null {
  const definedValues = values.filter(
    (value): value is number => typeof value === 'number',
  );

  if (definedValues.length === 0) {
    return null;
  }

  return Math.round(definedValues.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
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

  return {
    ...item,
    estimatedCalories: matchedReference.calories_kcal,
    proteinG: matchedReference.protein_g,
    fatG: matchedReference.fat_g,
    carbsG: matchedReference.carbs_g,
    source: 'reference',
    linkedFoodRefId: matchedReference.food_ref_id,
    note: 'matched local REF_CALORIES by item name',
  };
}

export function buildMealStructure(record: ToolRecord): MealStructureResult {
  const mealText = normalizeMealText(record.meal_text);
  const mealType = (record.meal_type as MealType | undefined) ?? 'snack';
  const items = buildDraftItems(mealText);

  return {
    mealType,
    mealText,
    shouldPersist: Boolean(mealText),
    items,
    note: !mealText
      ? 'food-workflow: empty meal_text'
      : items.length <= 1
        ? 'food-workflow: single-item draft from meal_text'
        : 'food-workflow: multi-item draft from meal_text',
  };
}

export function resolveMealFromReferences(
  draft: MealStructureResult,
): MealResolutionResult {
  const resolvedItems = draft.items.map(resolveDraftItem);
  const matchedItems = resolvedItems.filter(
    (item) => item.source === 'reference',
  );
  const linkedFoodRefIds = uniqueValues(
    matchedItems
      .map((item) => item.linkedFoodRefId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );

  if (matchedItems.length === 0) {
    return {
      mealType: draft.mealType,
      mealText: draft.mealText,
      shouldPersist: draft.shouldPersist,
      estimatedCalories: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      linkedFoodRefIds: [],
      items: resolvedItems,
      note: 'food-workflow: no local reference match',
    };
  }

  return {
    mealType: draft.mealType,
    mealText: draft.mealText,
    shouldPersist: draft.shouldPersist,
    estimatedCalories: sumNullableNumbers(
      matchedItems.map((item) => item.estimatedCalories),
    ),
    proteinG: sumNullableNumbers(matchedItems.map((item) => item.proteinG)),
    fatG: sumNullableNumbers(matchedItems.map((item) => item.fatG)),
    carbsG: sumNullableNumbers(matchedItems.map((item) => item.carbsG)),
    linkedFoodRefIds,
    items: resolvedItems,
    note:
      matchedItems.length === resolvedItems.length
        ? 'food-workflow: enriched all items from local REF_CALORIES'
        : 'food-workflow: partially enriched from local REF_CALORIES',
  };
}

export function enrichFoodInsertRecord(record: ToolRecord): ToolRecord {
  const draft = buildMealStructure(record);
  const resolution = resolveMealFromReferences(draft);
  const nextRecord: ToolRecord = {
    ...record,
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

export function executeFoodInsertWorkflow(
  request: InsertDataRequest,
  timestamp: Date,
): InsertDataResult {
  return executeInsertData(
    {
      ...request,
      record: enrichFoodInsertRecord(request.record),
    },
    timestamp,
  );
}
