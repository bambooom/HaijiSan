import { geminiService } from './gemini';
import {
  estimateMealCalories,
  estimateMealCaloriesFromStructured,
} from './food-analysis';
import { AI_CONFIRMATION_GUIDE, AI_INTENTS } from '../constants/ai';
import { MEAL_TYPE_LABELS } from '../shared/meal';
import type {
  AiPlan,
  IngredientEstimateResult,
  MealResolutionResult,
  ParseStatus,
} from '../types';
import type {
  EstimatedMealMeta,
  EstimatedMealSummary,
  MealEstimateResult,
  MealReferenceFact,
  ParsedIngredient,
  ResolvedMealEstimate,
} from '../types/food-analysis';

const ESTIMATE_CONFIDENCE_LABELS: Record<
  IngredientEstimateResult['confidence'],
  string
> = {
  low: '低',
  medium: '中',
  high: '高',
};

function buildIngredientKey(
  itemName: string,
  quantity: number,
  unit: string,
): string {
  return `${itemName}|${quantity}|${unit}`;
}

function normalizeReferenceName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function findMatchedReferenceFact(
  itemName: string,
  matchedReferences: MealReferenceFact[],
): MealReferenceFact | null {
  const normalizedItemName = normalizeReferenceName(itemName);

  if (!normalizedItemName) {
    return null;
  }

  const exactMatch = matchedReferences.find((reference) => {
    const normalizedReferenceItem = normalizeReferenceName(reference.itemName);
    const normalizedReferenceName = normalizeReferenceName(
      reference.referenceName,
    );

    return (
      normalizedReferenceItem === normalizedItemName ||
      normalizedReferenceName === normalizedItemName
    );
  });

  if (exactMatch) {
    return exactMatch;
  }

  return (
    matchedReferences.find((reference) => {
      const normalizedReferenceItem = normalizeReferenceName(
        reference.itemName,
      );
      const normalizedReferenceName = normalizeReferenceName(
        reference.referenceName,
      );

      return (
        normalizedItemName.includes(normalizedReferenceItem) ||
        normalizedReferenceItem.includes(normalizedItemName) ||
        normalizedItemName.includes(normalizedReferenceName) ||
        normalizedReferenceName.includes(normalizedItemName)
      );
    }) ?? null
  );
}

function formatReferenceEstimatedItem(item: ParsedIngredient): string {
  const quantityLabel = `${item.quantity}${item.unit}`;

  if (item.estimatedCalories === null || !item.matchedReference) {
    return `- ${item.itemName} ${quantityLabel}：表里暂时没有可直接换算的参考`;
  }

  const brandSuffix = item.matchedReference.brand
    ? `（${item.matchedReference.brand}）`
    : '';

  return `- ${item.itemName} ${quantityLabel}：约 ${item.estimatedCalories} kcal [表内参考] ${item.matchedReference.name}${brandSuffix}`;
}

function formatUnifiedEstimatedItem(
  item: ParsedIngredient,
  aiEstimateMap: Map<string, IngredientEstimateResult>,
): string {
  if (item.estimatedCalories !== null && item.matchedReference) {
    return formatReferenceEstimatedItem(item);
  }

  const quantityLabel = `${item.quantity}${item.unit}`;
  const fallbackEstimate = aiEstimateMap.get(
    buildIngredientKey(item.itemName, item.quantity, item.unit),
  );

  if (!fallbackEstimate || fallbackEstimate.estimatedCalories === null) {
    return `- ${item.itemName} ${quantityLabel}：暂时还没估出来`;
  }

  const noteSuffix = fallbackEstimate.note ? `，${fallbackEstimate.note}` : '';
  const confidenceLabel =
    ESTIMATE_CONFIDENCE_LABELS[fallbackEstimate.confidence];

  return `- ${item.itemName} ${quantityLabel}：约 ${fallbackEstimate.estimatedCalories} kcal [AI估算/${confidenceLabel}]${noteSuffix}`;
}

function formatResolvedItem(
  item: MealResolutionResult['items'][number],
): string {
  const sourceLabel = item.source === 'reference' ? '[表内参考]' : '[AI估算]';
  const detailSuffix = item.note ? `，${item.note}` : '';

  return `- ${item.itemName} ${item.quantity}${item.unit}：约 ${item.estimatedCalories ?? '未知'} kcal ${sourceLabel}${detailSuffix}`;
}

function collectPendingParts(
  items: ParsedIngredient[],
  aiEstimateMap: Map<string, IngredientEstimateResult>,
  unmatchedSegments: string[],
): string[] {
  const unresolvedItems = items
    .filter((item) => {
      if (item.estimatedCalories !== null) {
        return false;
      }

      const fallbackEstimate = aiEstimateMap.get(
        buildIngredientKey(item.itemName, item.quantity, item.unit),
      );

      return !fallbackEstimate || fallbackEstimate.estimatedCalories === null;
    })
    .map((item) => `${item.itemName}${item.quantity}${item.unit}`);

  return [...new Set([...unresolvedItems, ...unmatchedSegments])];
}

function sumEstimatedCalories(
  items: ParsedIngredient[],
  aiEstimateMap: Map<string, IngredientEstimateResult>,
): number | null {
  return items.reduce<number | null>((sum, item) => {
    const fallbackEstimate = aiEstimateMap.get(
      buildIngredientKey(item.itemName, item.quantity, item.unit),
    );
    const calories =
      item.estimatedCalories ?? fallbackEstimate?.estimatedCalories ?? null;

    if (calories === null) {
      return sum;
    }

    return (sum ?? 0) + calories;
  }, null);
}

export function buildMealInput(plan: AiPlan, originalText: string): string {
  return plan.mealText
    ? plan.mealType
      ? `${MEAL_TYPE_LABELS[plan.mealType]} ${plan.mealText}`
      : plan.mealText
    : originalText;
}

export function buildMealPreviewReply(body: string): string {
  return `${body}\n${AI_CONFIRMATION_GUIDE}`;
}

export function buildMatchedReferenceFacts(
  items: ParsedIngredient[],
): MealReferenceFact[] {
  return items
    .filter(
      (item) =>
        item.matchedReference?.servingSize !== null &&
        item.matchedReference?.servingSize !== undefined,
    )
    .map((item) => ({
      referenceId: item.matchedReference?.id ?? '',
      itemName: item.itemName,
      servingSize: item.matchedReference?.servingSize ?? 0,
      unit: item.matchedReference?.unit ?? '',
      calories: item.matchedReference?.calories ?? 0,
      referenceName: item.matchedReference?.name ?? item.itemName,
    }));
}

export function buildAiEstimateMap(
  estimates: IngredientEstimateResult[],
): Map<string, IngredientEstimateResult> {
  return new Map(
    estimates.map((estimate) => [
      buildIngredientKey(estimate.itemName, estimate.quantity, estimate.unit),
      estimate,
    ]),
  );
}

export function buildResolvedMealDetailLines(
  resolvedMeal: MealResolutionResult,
): string {
  return resolvedMeal.items.map(formatResolvedItem).join('\n');
}

export function reconcileResolvedMealWithReferences(
  resolvedMeal: MealResolutionResult,
  matchedReferences: MealReferenceFact[],
): MealResolutionResult {
  if (matchedReferences.length === 0 || resolvedMeal.items.length === 0) {
    return resolvedMeal;
  }

  const nextItems = resolvedMeal.items.map((item) => {
    const matchedReference = findMatchedReferenceFact(
      item.itemName,
      matchedReferences,
    );

    if (!matchedReference) {
      return item;
    }

    const referenceCalories = Number(
      (
        (item.quantity * matchedReference.calories) /
        matchedReference.servingSize
      ).toFixed(1),
    );

    return {
      ...item,
      estimatedCalories: referenceCalories,
      source: 'reference' as const,
      linkedFoodRefId: matchedReference.referenceId,
      note: matchedReference.referenceName
        ? `按表内参考 ${matchedReference.referenceName} 换算`
        : item.note,
    };
  });

  const resolvedCalories = nextItems.reduce<number | null>((sum, item) => {
    if (item.estimatedCalories === null) {
      return sum;
    }

    return (sum ?? 0) + item.estimatedCalories;
  }, null);

  return {
    ...resolvedMeal,
    items: nextItems,
    estimatedCalories: resolvedCalories,
  };
}

export function buildResolvedMealNote(
  resolvedMeal: MealResolutionResult,
): string {
  const noteParts: string[] = [];

  if (resolvedMeal.items.some((item) => item.source === 'ai')) {
    noteParts.push('Contains AI-estimated ingredients');
  }

  if (resolvedMeal.note) {
    noteParts.push(`AI meal resolution: ${resolvedMeal.note}`);
  }

  return noteParts.join('; ');
}

export function buildEstimatedMealNote(
  estimate: MealEstimateResult,
  pendingParts: string[],
  parseNote: string,
): EstimatedMealMeta {
  const parseStatus: ParseStatus =
    estimate.items.length > 0 && estimate.items.length === estimate.segmentCount
      ? 'parsed'
      : 'pending';
  const noteParts: string[] = [];

  if (parseStatus === 'pending') {
    noteParts.push('Best-effort parsing; raw meal text preserved');
  }

  if (pendingParts.length > 0) {
    noteParts.push(`Unresolved parts: ${pendingParts.join(', ')}`);
  }

  if (estimate.items.some((item) => item.matchedReference === null)) {
    noteParts.push('Contains AI-estimated ingredients');
  }

  if (parseNote) {
    noteParts.push(parseNote);
  }

  return {
    parseStatus,
    note: noteParts.join('; '),
  };
}

export function shouldPersistMeal(plan: AiPlan, originalText: string): boolean {
  if (plan.intent === AI_INTENTS.FOOD) {
    return true;
  }

  return /(早餐|早饭|午餐|午饭|中饭|晚餐|晚饭|加餐|夜宵|宵夜|零食|吃了|喝了|吃的是|喝的是)/.test(
    originalText,
  );
}

export function resolveMealEstimate(
  plan: AiPlan,
  originalText: string,
  timestamp: Date,
): ResolvedMealEstimate | null {
  const mealInput = buildMealInput(plan, originalText);
  const ruleEstimate = estimateMealCalories(mealInput);
  const basePersist = shouldPersistMeal(plan, originalText);
  const ruleLooksGood =
    ruleEstimate !== null &&
    ruleEstimate.items.length > 0 &&
    ruleEstimate.unmatchedSegments.length === 0;

  if (ruleLooksGood) {
    return {
      estimate: ruleEstimate,
      shouldPersist: basePersist,
      parseNote: '',
    };
  }

  try {
    const structuredMeal = geminiService.extractMealStructure(
      originalText,
      timestamp,
    );

    if (structuredMeal && structuredMeal.items.length > 0) {
      const structuredEstimate = estimateMealCaloriesFromStructured(
        structuredMeal.mealType,
        structuredMeal.mealText,
        structuredMeal.items,
      );

      if (structuredEstimate) {
        return {
          estimate: structuredEstimate,
          shouldPersist: structuredMeal.shouldPersist || basePersist,
          parseNote: structuredMeal.note
            ? `AI meal extraction: ${structuredMeal.note}`
            : 'AI meal extraction applied',
        };
      }
    }
  } catch {
    // Fall back to rule-based estimate.
  }

  if (!ruleEstimate) {
    return null;
  }

  return {
    estimate: ruleEstimate,
    shouldPersist: basePersist,
    parseNote: 'Rule-based meal parsing fallback',
  };
}

export function summarizeEstimatedMeal(
  estimate: MealEstimateResult,
  aiEstimateMap: Map<string, IngredientEstimateResult>,
): EstimatedMealSummary {
  const unresolvedItems = estimate.items.filter(
    (item) => item.estimatedCalories === null,
  );

  return {
    detailLines: estimate.items
      .map((item) => formatUnifiedEstimatedItem(item, aiEstimateMap))
      .join('\n'),
    totalEstimatedCalories: sumEstimatedCalories(estimate.items, aiEstimateMap),
    aiResolvedCount: unresolvedItems.filter((item) => {
      const fallbackEstimate = aiEstimateMap.get(
        buildIngredientKey(item.itemName, item.quantity, item.unit),
      );

      return Boolean(
        fallbackEstimate?.estimatedCalories !== null && fallbackEstimate,
      );
    }).length,
    pendingParts: collectPendingParts(
      estimate.items,
      aiEstimateMap,
      estimate.unmatchedSegments,
    ),
  };
}
