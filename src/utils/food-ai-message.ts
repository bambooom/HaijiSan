import type {
  EstimatedMealTextInput,
  ResolvedMealTextInput,
} from '../types/food-analysis';

function buildCoverageNote(
  pendingParts: string[],
  aiResolvedCount: number,
): string {
  if (pendingParts.length === 0 && aiResolvedCount === 0) {
    return '这一顿先按表里的参考给你算。';
  }

  if (pendingParts.length === 0) {
    return '这一顿先把表内参考和常见食材的 AI 估算合在一起给你算。';
  }

  return '我先把表内参考和 AI 能补到的部分合在一起给你算。';
}

export function buildResolvedMealReply(input: ResolvedMealTextInput): string {
  return `这一顿我直接按整句理解给你算。\n${input.detailLines}\n合计约 ${input.estimatedCalories ?? '未知'} kcal。`;
}

export function buildNoCaloriesReply(
  detailLines: string,
  aiFallbackFailed: boolean,
): string {
  const fallbackHint = aiFallbackFailed
    ? '\n这次 Gemini 的兜底估算没有接上，所以我只保留了表内结果。'
    : '';

  return `我先查了 Ref_Calories，也试着用 AI 补估常见食材，但这顿还没有形成可用的总热量。\n${detailLines}${fallbackHint}\n把食材和份量再说细一点，我再继续算。克数、个数、颗数、盒数都可以。`;
}

export function buildEstimatedMealReply(input: EstimatedMealTextInput): string {
  const unresolvedSuffix =
    input.pendingParts.length === 0
      ? ''
      : `\n还没估出来的部分：${input.pendingParts.join('、')}`;
  const fallbackStatusSuffix = input.aiFallbackFailed
    ? '\n这次 Gemini 的兜底估算没有接上，所以未命中部分暂时没补上。'
    : '';

  return `${buildCoverageNote(input.pendingParts, input.aiResolvedCount)}\n${input.detailLines}\n合计约 ${input.totalEstimatedCalories} kcal。${unresolvedSuffix}${fallbackStatusSuffix}`;
}
