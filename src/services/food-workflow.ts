import { estimateIngredientCalories } from './food-estimation';
import { refCaloriesTable, stockTable } from '../tables';
import type {
  FoodLogInsertRequest,
  FoodReferenceEntry,
  MealType,
} from '../types';
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
const STOCK_SIDE_EFFECT_UNITS = new Set([
  'serving',
  'piece',
  '个',
  '份',
  '个/份',
]);

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

function normalizeStructuredItems(
  items: IngredientEstimateInput[] | undefined,
): IngredientEstimateInput[] {
  if (!items || items.length === 0) {
    return [];
  }

  return items
    .map((item) => ({
      itemName: normalizeMealText(item.itemName),
      quantity: item.quantity,
      unit: normalizeMealText(item.unit),
    }))
    .filter(
      (item) =>
        Boolean(item.itemName) &&
        Boolean(item.unit) &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    );
}

function sumNullableNumbers(
  values: Array<number | null | undefined>,
): number | null {
  const definedValues = values.filter(
    (value): value is number => typeof value === 'number',
  );

  if (definedValues.length === 0) {
    return null;
  }

  return (
    Math.round(definedValues.reduce((sum, value) => sum + value, 0) * 10) / 10
  );
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase();
}

function roundNutritionValue(value: number): number {
  return Math.round(value * 10) / 10;
}

function isServingUnit(value: string): boolean {
  return new Set(['serving', 'servings', '份', 'portion']).has(
    normalizeUnit(value),
  );
}

function isPieceUnit(value: string): boolean {
  return new Set(['piece', 'pieces', '个']).has(normalizeUnit(value));
}

function scaleNullableNumber(
  value: number | null,
  scale: number,
): number | null {
  return value === null ? null : roundNutritionValue(value * scale);
}

function resolveReferenceScale(
  item: IngredientEstimateInput,
  reference: FoodReferenceEntry,
): number | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  const itemUnit = normalizeUnit(item.unit);
  const referenceUnit = normalizeUnit(reference.serving_unit);
  const referenceSize = reference.serving_size;

  if (!itemUnit) {
    return null;
  }

  if (isServingUnit(itemUnit)) {
    return item.quantity;
  }

  if (itemUnit === referenceUnit) {
    if (
      typeof referenceSize === 'number' &&
      Number.isFinite(referenceSize) &&
      referenceSize > 0
    ) {
      return item.quantity / referenceSize;
    }

    return item.quantity;
  }

  if (isPieceUnit(itemUnit) && isPieceUnit(referenceUnit)) {
    if (
      typeof referenceSize === 'number' &&
      Number.isFinite(referenceSize) &&
      referenceSize > 0
    ) {
      return item.quantity / referenceSize;
    }

    return item.quantity;
  }

  return null;
}

function canAutoAdjustStock(
  item: MealResolvedItem,
  stockUnit: string,
): boolean {
  if (item.source !== 'reference') {
    return false;
  }

  if (
    !Number.isFinite(item.quantity) ||
    item.quantity <= 0 ||
    !Number.isInteger(item.quantity)
  ) {
    return false;
  }

  const normalizedItemUnit = normalizeUnit(item.unit);
  const normalizedStockUnit = normalizeUnit(stockUnit);

  if (normalizedItemUnit === normalizedStockUnit) {
    return true;
  }

  return (
    (normalizedItemUnit === 'serving' || normalizedItemUnit === 'piece') &&
    STOCK_SIDE_EFFECT_UNITS.has(normalizedStockUnit)
  );
}

function applyResolvedFieldsToFoodRecord(
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

function applyStockSideEffects(
  record: ToolRecord,
  resolution: MealResolutionResult,
  timestamp: Date,
): ToolRecord {
  const linkedStockItemIds = uniqueValues(
    resolution.items.flatMap((item) => {
      const stockEntry = stockTable.findByName(item.itemName);

      if (!stockEntry || !canAutoAdjustStock(item, stockEntry.unit)) {
        return [];
      }

      const result = stockTable.adjustStock(
        timestamp,
        stockEntry.item_name,
        -item.quantity,
        stockEntry.unit,
        undefined,
        undefined,
      );

      return result.ok ? [stockEntry.stock_item_id] : [];
    }),
  );

  if (
    linkedStockItemIds.length === 0 ||
    (typeof record.linked_stock_item_ids === 'string' &&
      record.linked_stock_item_ids.trim())
  ) {
    return record;
  }

  return {
    ...record,
    linked_stock_item_ids: linkedStockItemIds.join(', '),
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

export function buildMealStructure(
  record: ToolRecord,
  structuredItems?: IngredientEstimateInput[],
): MealStructureResult {
  const mealText = normalizeMealText(record.meal_text);
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

export function enrichFoodInsertRecord(record: ToolRecord): ToolRecord {
  const draft = buildMealStructure(record);
  const resolution = resolveMealFromReferences(draft);
  return applyResolvedFieldsToFoodRecord(record, draft, resolution);
}

export function executeFoodInsertWorkflow(
  request: InsertDataRequest | FoodLogInsertRequest,
  timestamp: Date,
): InsertDataResult {
  const draft = buildMealStructure(
    request.record,
    request.tool === 'insertFoodLog' ? request.items : undefined,
  );
  const resolution = resolveMealWithAiFallback(draft, timestamp);
  const enrichedRecord = applyResolvedFieldsToFoodRecord(
    request.record,
    draft,
    resolution,
  );
  const finalRecord = applyStockSideEffects(
    enrichedRecord,
    resolution,
    timestamp,
  );

  return executeInsertData(
    {
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: finalRecord,
    },
    timestamp,
  );
}
