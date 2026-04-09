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
  MealResolutionResult,
  MealStructureResult,
} from '../types/food';

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

  return [
    {
      itemName: mealText,
      quantity: 1,
      unit: 'serving',
    },
  ];
}

export function buildMealStructure(record: ToolRecord): MealStructureResult {
  const mealText = normalizeMealText(record.meal_text);
  const mealType = (record.meal_type as MealType | undefined) ?? 'snack';

  return {
    mealType,
    mealText,
    shouldPersist: Boolean(mealText),
    items: buildDraftItems(mealText),
    note: mealText
      ? 'food-workflow: single-item draft from meal_text'
      : 'food-workflow: empty meal_text',
  };
}

export function resolveMealFromReferences(
  draft: MealStructureResult,
): MealResolutionResult {
  const matchedReference = draft.mealText
    ? refCaloriesTable.findByFoodName(draft.mealText)
    : null;

  if (!matchedReference) {
    return {
      mealType: draft.mealType,
      mealText: draft.mealText,
      shouldPersist: draft.shouldPersist,
      estimatedCalories: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      linkedFoodRefIds: [],
      items: draft.items.map((item) => ({
        ...item,
        estimatedCalories: null,
        proteinG: null,
        fatG: null,
        carbsG: null,
        source: 'ai',
        note: 'no local REF_CALORIES match yet',
      })),
      note: 'food-workflow: no local reference match',
    };
  }

  return {
    mealType: draft.mealType,
    mealText: draft.mealText,
    shouldPersist: draft.shouldPersist,
    estimatedCalories: matchedReference.calories_kcal,
    proteinG: matchedReference.protein_g,
    fatG: matchedReference.fat_g,
    carbsG: matchedReference.carbs_g,
    linkedFoodRefIds: [matchedReference.food_ref_id],
    items: draft.items.map((item) => ({
      ...item,
      estimatedCalories: matchedReference.calories_kcal,
      proteinG: matchedReference.protein_g,
      fatG: matchedReference.fat_g,
      carbsG: matchedReference.carbs_g,
      source: 'reference',
      linkedFoodRefId: matchedReference.food_ref_id,
      note: 'matched local REF_CALORIES by meal_text',
    })),
    note: 'food-workflow: enriched from local REF_CALORIES',
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
