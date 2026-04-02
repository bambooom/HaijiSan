import {
  buildTodayNutritionReply,
  getTodayNutritionSummary,
} from '../../services/nutrition-summary';
import type { AiPlan, CommandHandlingResult } from '../../types';
import { buildAiResult } from './result';

export function handleNutritionSummaryAiMessage(
  _plan: AiPlan,
  _sourceText: string,
  timestamp: Date,
): CommandHandlingResult {
  const summary = getTodayNutritionSummary(timestamp);

  if (!summary) {
    return buildAiResult(
      '今天还没有饮食记录，所以现在没法汇总热量、蛋白质和蔬菜。',
      'ignored',
      'mode=command; intent=nutrition_summary; meals=0',
    );
  }

  return buildAiResult(
    buildTodayNutritionReply(summary),
    'success',
    `mode=command; intent=nutrition_summary; meals=${summary.meals.length}`.slice(
      0,
      500,
    ),
  );
}
