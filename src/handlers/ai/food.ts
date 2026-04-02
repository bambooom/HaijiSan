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
  IngredientEstimateResult,
} from '../../types';
import { buildAiResult } from './result';

export function handleFoodAiMessage(
  plan: AiPlan,
  originalText: string,
  timestamp: Date,
  traceId?: string,
): CommandHandlingResult {
  const mealInput = buildMealInput(plan, originalText);
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
      const detailLines = buildResolvedMealDetailLines(resolvedMeal);
      const resolvedMealReply = buildResolvedMealReply({
        detailLines,
        estimatedCalories: resolvedMeal.estimatedCalories,
      });

      if (resolvedMeal.shouldPersist || shouldPersistMeal(plan, originalText)) {
        const previewText = buildMealPreviewReply(resolvedMealReply);

        savePendingAiAction(
          createPendingMealRecordAction({
            timestamp,
            traceId,
            sourceText: originalText,
            previewText,
            note: `mode=command; intent=food_estimate; resolution=single-pass`.slice(
              0,
              500,
            ),
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
          `mode=command; intent=food_estimate; pending-confirmation=true; resolution=single-pass; meal=${resolvedMeal.mealText}; kcal=${resolvedMeal.estimatedCalories}; items=${resolvedMeal.items.length}`.slice(
            0,
            500,
          ),
        );
      }

      return buildAiResult(
        resolvedMealReply,
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
      buildUnableToEstimateReply(),
      'ignored',
      'mode=command; intent=food_estimate; estimate=unparseable',
    );
  }

  if (estimate.items.length === 0) {
    return buildAiResult(
      buildMissingQuantityReply(),
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

  const { detailLines, totalEstimatedCalories, aiResolvedCount, pendingParts } =
    summarizeEstimatedMeal(estimate, aiEstimateMap);

  if (totalEstimatedCalories === null) {
    return buildAiResult(
      buildNoCaloriesReply(detailLines, aiFallbackFailed),
      'ignored',
      `mode=command; intent=food_estimate; meal=${estimate.mealText}; estimate=no-calories`.slice(
        0,
        500,
      ),
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
    const previewText = buildMealPreviewReply(estimatedMealReply);

    savePendingAiAction(
      createPendingMealRecordAction({
        timestamp,
        traceId,
        sourceText: originalText,
        previewText,
        note: `mode=command; intent=food_estimate; pending-confirmation=true`.slice(
          0,
          500,
        ),
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
      `mode=command; intent=food_estimate; meal=${estimate.mealText}; kcal=${totalEstimatedCalories}; ref=${estimate.matchedCount}; ai=${aiResolvedCount}; pending=${pendingParts.length}; pending-confirmation=true`.slice(
        0,
        500,
      ),
    );
  }

  return buildAiResult(
    estimatedMealReply,
    'success',
    `mode=command; intent=food_estimate; meal=${estimate.mealText}; kcal=${totalEstimatedCalories}; ref=${estimate.matchedCount}; ai=${aiResolvedCount}; pending=${pendingParts.length}; persisted=false`.slice(
      0,
      500,
    ),
  );
}
