import { geminiService, type MealReferenceFact } from '../services/gemini';
import {
  estimateMealCalories,
  estimateMealCaloriesFromStructured,
  type ParsedIngredient,
} from '../services/food-analysis';
import {
  buildFoodItemEntriesFromParsed,
  buildFoodItemEntriesFromResolution,
  persistMealRecord,
} from '../services/meal-recording';
import { savePendingAiAction } from '../services/pending-action';
import type {
  AiPlan,
  CommandHandlingResult,
  IngredientEstimateResult,
  MealResolutionResult,
  MealType,
  PendingMealRecordAction,
  ParseStatus,
} from '../types';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

const ESTIMATE_CONFIDENCE_LABELS: Record<
  IngredientEstimateResult['confidence'],
  string
> = {
  low: '低',
  medium: '中',
  high: '高',
};

function buildAiResult(
  reply: string,
  status: CommandHandlingResult['status'] = 'success',
  note = '',
): CommandHandlingResult {
  return {
    reply,
    handlingMode: 'ai',
    status,
    note,
  };
}

function buildMealPreviewReply(body: string): string {
  return `${body}\n回复“确认”写入，回复“取消”放弃。`;
}

function buildIngredientKey(
  itemName: string,
  quantity: number,
  unit: string,
): string {
  return `${itemName}|${quantity}|${unit}`;
}

function buildMatchedReferenceFacts(
  items: ParsedIngredient[],
): MealReferenceFact[] {
  return items
    .filter(
      (item) =>
        item.matchedReference?.servingSize !== null &&
        item.matchedReference?.servingSize !== undefined,
    )
    .map((item) => ({
      itemName: item.itemName,
      servingSize: item.matchedReference?.servingSize ?? 0,
      unit: item.matchedReference?.unit ?? '',
      calories: item.matchedReference?.calories ?? 0,
      referenceName: item.matchedReference?.name ?? item.itemName,
    }));
}

function buildAiEstimateMap(
  estimates: IngredientEstimateResult[],
): Map<string, IngredientEstimateResult> {
  return new Map(
    estimates.map((estimate) => [
      buildIngredientKey(estimate.itemName, estimate.quantity, estimate.unit),
      estimate,
    ]),
  );
}

function formatEstimatedItem(item: ParsedIngredient): string {
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
    return formatEstimatedItem(item);
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

function formatResolvedItem(
  item: MealResolutionResult['items'][number],
): string {
  const sourceLabel = item.source === 'reference' ? '[表内参考]' : '[AI估算]';
  const detailSuffix = item.note ? `，${item.note}` : '';

  return `- ${item.itemName} ${item.quantity}${item.unit}：约 ${item.estimatedCalories ?? '未知'} kcal ${sourceLabel}${detailSuffix}`;
}

function buildResolvedMealNote(resolvedMeal: MealResolutionResult): string {
  const noteParts: string[] = [];

  if (resolvedMeal.items.some((item) => item.source === 'ai')) {
    noteParts.push('Contains AI-estimated ingredients');
  }

  if (resolvedMeal.note) {
    noteParts.push(`AI meal resolution: ${resolvedMeal.note}`);
  }

  return noteParts.join('; ');
}

function buildEstimatedMealNote(
  estimate: NonNullable<ReturnType<typeof estimateMealCalories>>,
  pendingParts: string[],
  parseNote: string,
): { parseStatus: ParseStatus; note: string } {
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

function savePendingMealRecordAction(action: PendingMealRecordAction): void {
  savePendingAiAction(action);
}

export function executePendingMealRecordAction(
  action: PendingMealRecordAction,
  fallbackTimestamp: Date,
): CommandHandlingResult {
  try {
    const createdAt = new Date(action.mealRecord.createdAt);
    const timestamp = Number.isNaN(createdAt.getTime())
      ? fallbackTimestamp
      : createdAt;
    const persisted = persistMealRecord({
      timestamp,
      mealType: action.mealRecord.mealType,
      mealText: action.mealRecord.mealText,
      estimatedCalories: action.mealRecord.estimatedCalories,
      parseStatus: action.mealRecord.parseStatus,
      note: action.mealRecord.note,
      items: action.mealRecord.items,
    });
    const stockSuffix =
      persisted.stockSync.updatedCount > 0
        ? `库存同步 ${persisted.stockSync.updatedCount} 项。`
        : '这次没有同步到库存项。';

    return buildAiResult(
      `已按刚才的预览写入。\n这餐已经记进 Food_Log 了，合计约 ${action.mealRecord.estimatedCalories ?? '未知'} kcal。${stockSuffix}`,
      'success',
      `${action.note}; confirmed=true; stock-updated=${persisted.stockSync.updatedCount}`.slice(
        0,
        500,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return buildAiResult(
      '我收到了确认，但这次实际写入没有成功。刚才那步已经停住了，你可以重新发一次。',
      'failed',
      `${action.note}; confirmed=true; persist-error=${message}`.slice(0, 500),
    );
  }
}

function shouldPersistMeal(plan: AiPlan, originalText: string): boolean {
  if (plan.intent === 'food') {
    return true;
  }

  return /(早餐|早饭|午餐|午饭|中饭|晚餐|晚饭|加餐|夜宵|宵夜|零食|吃了|喝了|吃的是|喝的是)/.test(
    originalText,
  );
}

function resolveMealEstimate(
  plan: AiPlan,
  originalText: string,
  timestamp: Date,
): {
  estimate: ReturnType<typeof estimateMealCalories>;
  shouldPersist: boolean;
  parseNote: string;
} | null {
  const mealInput = plan.mealText
    ? plan.mealType
      ? `${MEAL_TYPE_LABELS[plan.mealType]} ${plan.mealText}`
      : plan.mealText
    : originalText;
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
        const shouldPersist = structuredMeal.shouldPersist || basePersist;
        const parseNote = structuredMeal.note
          ? `AI meal extraction: ${structuredMeal.note}`
          : 'AI meal extraction applied';

        return {
          estimate: structuredEstimate,
          shouldPersist,
          parseNote,
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

export function handleFoodAiMessage(
  plan: AiPlan,
  originalText: string,
  timestamp: Date,
): CommandHandlingResult {
  const mealInput = plan.mealText
    ? plan.mealType
      ? `${MEAL_TYPE_LABELS[plan.mealType]} ${plan.mealText}`
      : plan.mealText
    : originalText;
  const preMatchedEstimate = estimateMealCalories(mealInput);
  const matchedReferenceFacts = buildMatchedReferenceFacts(
    preMatchedEstimate?.items ?? [],
  );

  try {
    const resolvedMeal = geminiService.resolveMealRecord(
      originalText,
      timestamp,
      matchedReferenceFacts,
    );

    if (resolvedMeal) {
      const detailLines = resolvedMeal.items.map(formatResolvedItem).join('\n');

      if (resolvedMeal.shouldPersist || shouldPersistMeal(plan, originalText)) {
        const previewText = buildMealPreviewReply(
          `这一顿我直接按整句理解给你算。\n${detailLines}\n合计约 ${resolvedMeal.estimatedCalories ?? '未知'} kcal。`,
        );

        savePendingMealRecordAction({
          kind: 'meal-record',
          createdAt: timestamp.toISOString(),
          sourceText: originalText,
          previewText,
          note: `mode=command; intent=food_estimate; resolution=single-pass`.slice(
            0,
            500,
          ),
          mealRecord: {
            createdAt: timestamp.toISOString(),
            mealType: resolvedMeal.mealType,
            mealText: resolvedMeal.mealText,
            estimatedCalories: resolvedMeal.estimatedCalories,
            parseStatus: 'parsed',
            note: buildResolvedMealNote(resolvedMeal),
            items: buildFoodItemEntriesFromResolution('', resolvedMeal),
          },
        });

        return buildAiResult(
          previewText,
          'success',
          `mode=command; intent=food_estimate; pending-confirmation=true; resolution=single-pass; meal=${resolvedMeal.mealText}; kcal=${resolvedMeal.estimatedCalories}; items=${resolvedMeal.items.length}`.slice(
            0,
            500,
          ),
        );
      }

      return buildAiResult(
        `这一顿我直接按整句理解给你算。\n${detailLines}\n合计约 ${resolvedMeal.estimatedCalories ?? '未知'} kcal。`,
        'success',
        `mode=command; intent=food_estimate; meal=${resolvedMeal.mealText}; kcal=${resolvedMeal.estimatedCalories}; items=${resolvedMeal.items.length}; persisted=false`.slice(
          0,
          500,
        ),
      );
    }
  } catch {
    // Fall back to staged flow.
  }

  const resolvedEstimate = resolveMealEstimate(plan, originalText, timestamp);
  const estimate = resolvedEstimate?.estimate ?? null;

  if (!estimate) {
    return buildAiResult(
      '这顿我还没法稳稳地算。把主要食材和份量发清楚一点，我再替你估。',
      'ignored',
      'mode=command; intent=food_estimate; estimate=unparseable',
    );
  }

  if (estimate.items.length === 0) {
    return buildAiResult(
      '我先去参考表里找了，但你这句里还缺能换算的份量。把食材和份量发给我就行，克数、个数、颗数、盒数都可以。',
      'ignored',
      `mode=command; intent=food_estimate; meal=${estimate.mealText}; estimate=no-weighted-items`.slice(
        0,
        500,
      ),
    );
  }

  const unresolvedItems = estimate.items.filter(
    (item) => item.estimatedCalories === null,
  );
  let aiEstimateMap = new Map<string, IngredientEstimateResult>();
  let aiFallbackFailed = false;

  if (unresolvedItems.length > 0) {
    try {
      aiEstimateMap = buildAiEstimateMap(
        geminiService.estimateIngredientCalories(
          unresolvedItems.map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
          })),
        ),
      );
    } catch {
      aiFallbackFailed = true;
    }
  }

  const detailLines = estimate.items
    .map((item) => formatUnifiedEstimatedItem(item, aiEstimateMap))
    .join('\n');
  const totalEstimatedCalories = sumEstimatedCalories(
    estimate.items,
    aiEstimateMap,
  );
  const aiResolvedCount = unresolvedItems.filter((item) => {
    const fallbackEstimate = aiEstimateMap.get(
      buildIngredientKey(item.itemName, item.quantity, item.unit),
    );

    return Boolean(
      fallbackEstimate?.estimatedCalories !== null && fallbackEstimate,
    );
  }).length;
  const pendingParts = collectPendingParts(
    estimate.items,
    aiEstimateMap,
    estimate.unmatchedSegments,
  );

  if (totalEstimatedCalories === null) {
    const fallbackHint = aiFallbackFailed
      ? '\n这次 Gemini 的兜底估算没有接上，所以我只保留了表内结果。'
      : '';

    return buildAiResult(
      `我先查了 Ref_Calories，也试着用 AI 补估常见食材，但这顿还没有形成可用的总热量。\n${detailLines}${fallbackHint}\n把食材和份量再说细一点，我再继续算。克数、个数、颗数、盒数都可以。`,
      'ignored',
      `mode=command; intent=food_estimate; meal=${estimate.mealText}; estimate=no-calories`.slice(
        0,
        500,
      ),
    );
  }

  const coverageNote =
    pendingParts.length === 0 && aiResolvedCount === 0
      ? '这一顿先按表里的参考给你算。'
      : pendingParts.length === 0
        ? '这一顿先把表内参考和常见食材的 AI 估算合在一起给你算。'
        : '我先把表内参考和 AI 能补到的部分合在一起给你算。';
  const unresolvedSuffix =
    pendingParts.length === 0
      ? ''
      : `\n还没估出来的部分：${pendingParts.join('、')}`;
  const fallbackStatusSuffix = aiFallbackFailed
    ? '\n这次 Gemini 的兜底估算没有接上，所以未命中部分暂时没补上。'
    : '';
  const shouldPersist =
    resolvedEstimate?.shouldPersist ?? shouldPersistMeal(plan, originalText);

  if (shouldPersist) {
    const mealRecordMeta = buildEstimatedMealNote(
      estimate,
      pendingParts,
      resolvedEstimate?.parseNote ?? '',
    );
    const previewText = buildMealPreviewReply(
      `${coverageNote}\n${detailLines}\n合计约 ${totalEstimatedCalories} kcal。${unresolvedSuffix}${fallbackStatusSuffix}`,
    );

    savePendingMealRecordAction({
      kind: 'meal-record',
      createdAt: timestamp.toISOString(),
      sourceText: originalText,
      previewText,
      note: `mode=command; intent=food_estimate; pending-confirmation=true`.slice(
        0,
        500,
      ),
      mealRecord: {
        createdAt: timestamp.toISOString(),
        mealType: estimate.mealType,
        mealText: estimate.mealText,
        estimatedCalories: totalEstimatedCalories,
        parseStatus: mealRecordMeta.parseStatus,
        note: mealRecordMeta.note,
        items: buildFoodItemEntriesFromParsed(
          '',
          estimate.items,
          aiEstimateMap,
        ),
      },
    });

    return buildAiResult(
      previewText,
      'success',
      `mode=command; intent=food_estimate; meal=${estimate.mealText}; kcal=${totalEstimatedCalories}; ref=${estimate.matchedCount}; ai=${aiResolvedCount}; pending=${pendingParts.length}; pending-confirmation=true`.slice(
        0,
        500,
      ),
    );
  }

  return buildAiResult(
    `${coverageNote}\n${detailLines}\n合计约 ${totalEstimatedCalories} kcal。${unresolvedSuffix}${fallbackStatusSuffix}`,
    'success',
    `mode=command; intent=food_estimate; meal=${estimate.mealText}; kcal=${totalEstimatedCalories}; ref=${estimate.matchedCount}; ai=${aiResolvedCount}; pending=${pendingParts.length}; persisted=false`.slice(
      0,
      500,
    ),
  );
}
