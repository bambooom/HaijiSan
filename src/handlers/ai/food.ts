import { geminiService } from '../../services/gemini';
import { estimateMealCalories } from '../../services/food-analysis';
import {
  buildAiEstimateMap,
  buildEstimatedMealNote,
  buildMatchedReferenceFacts,
  buildMealInput,
  buildMealPreviewReply,
  buildResolvedMealDetailLines,
  buildResolvedMealNote,
  resolveMealEstimate,
  shouldPersistMeal,
  summarizeEstimatedMeal,
} from '../../services/food-ai';
import {
  buildFoodItemEntriesFromParsed,
  buildFoodItemEntriesFromResolution,
} from '../../services/meal-recording';
import { createPendingMealRecordAction } from '../../services/meal-action';
import { savePendingAiAction } from '../../services/pending-action';
import { resolveTargetDateTimestamp } from '../../shared/date-reference';
import {
  buildEstimatedMealReply,
  buildMissingQuantityReply,
  buildNoCaloriesReply,
  buildResolvedMealReply,
  buildUnableToEstimateReply,
} from '../../utils/food-ai-message';
import type {
  AiPlan,
  CommandHandlingResult,
  CommandLogFields,
  IngredientEstimateResult,
} from '../../types';
import { buildCommandLogFields } from '../../utils/log-meta';
import { buildAiResult } from './result';

function prefixTargetDate(
  targetDate: string | undefined,
  text: string,
): string {
  return targetDate ? `记录日期：${targetDate}\n${text}` : text;
}

export function handleFoodAiMessage(
  plan: AiPlan,
  originalText: string,
  timestamp: Date,
  traceId?: string,
  baseNote?: string,
  baseLogFields?: CommandLogFields,
): CommandHandlingResult {
  const recordTimestamp = resolveTargetDateTimestamp(
    timestamp,
    plan.targetDate,
  );
  const mealInput = buildMealInput(plan, originalText);
  const preMatchedEstimate = estimateMealCalories(mealInput);
  const matchedReferenceFacts = buildMatchedReferenceFacts(
    preMatchedEstimate?.items ?? [],
  );

  try {
    const resolvedMeal = geminiService.resolveMealRecord(
      originalText,
      recordTimestamp,
      matchedReferenceFacts,
    );

    if (resolvedMeal) {
      const detailLines = buildResolvedMealDetailLines(resolvedMeal);
      const resolvedMealReply = buildResolvedMealReply({
        detailLines,
        estimatedCalories: resolvedMeal.estimatedCalories,
      });

      if (resolvedMeal.shouldPersist || shouldPersistMeal(plan, originalText)) {
        const previewText = prefixTargetDate(
          plan.targetDate,
          buildMealPreviewReply(resolvedMealReply),
        );

        savePendingAiAction(
          createPendingMealRecordAction({
            timestamp,
            recordTimestamp,
            traceId,
            sourceText: originalText,
            previewText,
            note: appendMealExecutionNote(
              baseNote,
              `resolution=single-pass; meal=${resolvedMeal.mealText}; kcal=${resolvedMeal.estimatedCalories}; items=${resolvedMeal.items.length}`,
            ),
            logFields: buildCommandLogFields(baseLogFields, {
              intent: plan.intent,
              confirmationState: 'pending',
              resultCode: 'pending-write',
            }),
            mealType: resolvedMeal.mealType,
            mealText: resolvedMeal.mealText,
            estimatedCalories: resolvedMeal.estimatedCalories,
            parseStatus: 'parsed',
            mealNote: buildResolvedMealNote(resolvedMeal),
            items: buildFoodItemEntriesFromResolution('', resolvedMeal),
          }),
        );

        return buildAiResult(
          previewText,
          'success',
          appendMealExecutionNote(
            baseNote,
            `pending-confirmation=true; resolution=single-pass; meal=${resolvedMeal.mealText}; kcal=${resolvedMeal.estimatedCalories}; items=${resolvedMeal.items.length}`,
          ),
          buildCommandLogFields(baseLogFields, {
            intent: plan.intent,
            confirmationState: 'pending',
            resultCode: 'pending-write',
          }),
        );
      }

      return buildAiResult(
        prefixTargetDate(plan.targetDate, resolvedMealReply),
        'success',
        appendMealExecutionNote(
          baseNote,
          `meal=${resolvedMeal.mealText}; kcal=${resolvedMeal.estimatedCalories}; items=${resolvedMeal.items.length}; persisted=false`,
        ),
        buildCommandLogFields(baseLogFields, {
          intent: plan.intent,
          resultCode: 'food-estimated',
        }),
      );
    }
  } catch {
    // Fall back to staged flow.
  }

  const resolvedEstimate = resolveMealEstimate(
    plan,
    originalText,
    recordTimestamp,
  );
  const estimate = resolvedEstimate?.estimate ?? null;

  if (!estimate) {
    return buildAiResult(
      buildUnableToEstimateReply(),
      'ignored',
      appendMealExecutionNote(baseNote, 'estimate=unparseable'),
      buildCommandLogFields(baseLogFields, {
        intent: plan.intent,
        resultCode: 'estimate-unparseable',
      }),
    );
  }

  if (estimate.items.length === 0) {
    return buildAiResult(
      buildMissingQuantityReply(),
      'ignored',
      appendMealExecutionNote(
        baseNote,
        `meal=${estimate.mealText}; estimate=no-weighted-items`,
      ),
      buildCommandLogFields(baseLogFields, {
        intent: plan.intent,
        resultCode: 'estimate-no-weighted-items',
      }),
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

  const { detailLines, totalEstimatedCalories, aiResolvedCount, pendingParts } =
    summarizeEstimatedMeal(estimate, aiEstimateMap);

  if (totalEstimatedCalories === null) {
    return buildAiResult(
      buildNoCaloriesReply(detailLines, aiFallbackFailed),
      'ignored',
      appendMealExecutionNote(
        baseNote,
        `meal=${estimate.mealText}; estimate=no-calories`,
      ),
      buildCommandLogFields(baseLogFields, {
        intent: plan.intent,
        resultCode: 'estimate-no-calories',
      }),
    );
  }

  const estimatedMealReply = buildEstimatedMealReply({
    detailLines,
    totalEstimatedCalories,
    pendingParts,
    aiResolvedCount,
    aiFallbackFailed,
  });
  const shouldPersist =
    resolvedEstimate?.shouldPersist ?? shouldPersistMeal(plan, originalText);

  if (shouldPersist) {
    const mealRecordMeta = buildEstimatedMealNote(
      estimate,
      pendingParts,
      resolvedEstimate?.parseNote ?? '',
    );
    // Keep preview payload creation in one place so confirmation writes exactly what was shown.
    const previewText = prefixTargetDate(
      plan.targetDate,
      buildMealPreviewReply(estimatedMealReply),
    );

    savePendingAiAction(
      createPendingMealRecordAction({
        timestamp,
        recordTimestamp,
        traceId,
        sourceText: originalText,
        previewText,
        note: appendMealExecutionNote(baseNote, 'pending-confirmation=true'),
        logFields: buildCommandLogFields(baseLogFields, {
          intent: plan.intent,
          confirmationState: 'pending',
          resultCode: 'pending-write',
        }),
        mealType: estimate.mealType,
        mealText: estimate.mealText,
        estimatedCalories: totalEstimatedCalories,
        parseStatus: mealRecordMeta.parseStatus,
        mealNote: mealRecordMeta.note,
        items: buildFoodItemEntriesFromParsed(
          '',
          estimate.items,
          aiEstimateMap,
        ),
      }),
    );

    return buildAiResult(
      previewText,
      'success',
      appendMealExecutionNote(
        baseNote,
        `meal=${estimate.mealText}; kcal=${totalEstimatedCalories}; ref=${estimate.matchedCount}; ai=${aiResolvedCount}; pending=${pendingParts.length}; pending-confirmation=true`,
      ),
      buildCommandLogFields(baseLogFields, {
        intent: plan.intent,
        confirmationState: 'pending',
        resultCode: 'pending-write',
      }),
    );
  }

  return buildAiResult(
    prefixTargetDate(plan.targetDate, estimatedMealReply),
    'success',
    appendMealExecutionNote(
      baseNote,
      `meal=${estimate.mealText}; kcal=${totalEstimatedCalories}; ref=${estimate.matchedCount}; ai=${aiResolvedCount}; pending=${pendingParts.length}; persisted=false`,
    ),
    buildCommandLogFields(baseLogFields, {
      intent: plan.intent,
      resultCode: 'food-estimated',
    }),
  );
}

function appendMealExecutionNote(
  baseNote: string | undefined,
  detail: string,
): string {
  return `${baseNote ?? 'mode=command; intent=food_estimate'}; ${detail}`.slice(
    0,
    500,
  );
}
