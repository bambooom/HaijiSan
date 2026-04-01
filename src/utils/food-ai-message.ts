import type {
  EstimatedMealTextInput,
  ResolvedMealTextInput,
} from '../types/food-analysis';

export function buildUnableToEstimateReply(): string {
  return '这顿暂时还没法算。把主要食材和份量说清楚一点，我再继续估。';
}

export function buildMissingQuantityReply(): string {
  return '这句里还缺能换算的份量。把食材和份量发给我就行，克数、个数、颗数、盒数都可以。';
}

function buildCoverageNote(
  pendingParts: string[],
  aiResolvedCount: number,
): string {
  if (pendingParts.length === 0 && aiResolvedCount === 0) {
    return '这顿先按表里的参考来算。';
  }

  if (pendingParts.length === 0) {
    return '这顿结合表内参考和常见食材估算来算。';
  }

  return '这顿先按表内参考和可补充的估算结果来算。';
}

export function buildResolvedMealReply(input: ResolvedMealTextInput): string {
  return `按这句描述估算如下：\n${input.detailLines}\n合计约 ${input.estimatedCalories ?? '未知'} kcal。`;
}

export function buildNoCaloriesReply(
  detailLines: string,
  aiFallbackFailed: boolean,
): string {
  const fallbackHint = aiFallbackFailed
    ? '\n这次 AI 补估没有成功，所以这里只保留了表内结果。'
    : '';

  return `这次还没法得到可用的总热量。\n${detailLines}${fallbackHint}\n把食材和份量说得更具体一点，我再继续算。克数、个数、颗数、盒数都可以。`;
}

export function buildEstimatedMealReply(input: EstimatedMealTextInput): string {
  const unresolvedSuffix =
    input.pendingParts.length === 0
      ? ''
      : `\n还没估出来的部分：${input.pendingParts.join('、')}`;
  const fallbackStatusSuffix = input.aiFallbackFailed
    ? '\n这次 AI 补估没有成功，所以未命中部分暂时没补上。'
    : '';

  return `${buildCoverageNote(input.pendingParts, input.aiResolvedCount)}\n${input.detailLines}\n合计约 ${input.totalEstimatedCalories} kcal。${unresolvedSuffix}${fallbackStatusSuffix}`;
}
