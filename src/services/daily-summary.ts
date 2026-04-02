import {
  buildTodayNutritionReply,
  getTodayNutritionSummary,
} from './nutrition-summary';

export function buildDailySummaryMessage(timestamp: Date): string {
  const nutritionSummary = getTodayNutritionSummary(timestamp);

  if (!nutritionSummary) {
    return '今天还没有足够的数据可汇总。';
  }

  return ['📋 今日总结', buildTodayNutritionReply(nutritionSummary)].join('\n');
}
