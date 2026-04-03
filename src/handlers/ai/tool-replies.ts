import {
  TOOL_NAMES,
  type LogReferenceOutput,
  type LogSleepOutput,
  type LogStatusInput,
  type LogWorkoutOutput,
  type LookupReferenceInput,
  type LookupReferenceOutput,
  type LookupStockInput,
  type LookupStockOutput,
  type SummarizeNutritionOutput,
  type ToolInputMap,
  type ToolName,
} from '../../tools/schemas';
import { formatDateLabel } from '../../shared/date-reference';

function buildDatePrefix(targetDate?: string): string {
  return targetDate ? `${formatDateLabel(targetDate)}：` : '';
}

export function buildReadOnlyToolReply(
  toolName: ToolName,
  output: unknown,
  toolInput: ToolInputMap[keyof ToolInputMap],
): string {
  switch (toolName) {
    case TOOL_NAMES.LOOKUP_STOCK:
      return buildLookupStockReply(
        output as LookupStockOutput,
        (toolInput as LookupStockInput).query,
      );
    case TOOL_NAMES.SUMMARIZE_NUTRITION:
      return buildNutritionSummaryReply(
        output as SummarizeNutritionOutput,
        (toolInput as LookupStockInput & { targetDate?: string }).targetDate,
      );
    case TOOL_NAMES.LOOKUP_REFERENCE:
      return buildLookupReferenceReply(
        output as LookupReferenceOutput,
        (toolInput as LookupReferenceInput).query,
      );
    default:
      return '已完成查询。';
  }
}

export function buildImmediateWriteToolReply(
  toolName: ToolName,
  output: unknown,
  toolInput: ToolInputMap[keyof ToolInputMap],
): string {
  switch (toolName) {
    case TOOL_NAMES.LOG_BODY:
      return buildBodyRecordSuccessReply(
        output as {
          weightKg: number | null;
          bmi: number | null;
          bodyFatPct: number | null;
          leanBodyMassKg: number | null;
        },
        (toolInput as { targetDate?: string }).targetDate,
      );
    case TOOL_NAMES.LOG_SLEEP:
      return buildSleepRecordSuccessReply(
        output as LogSleepOutput,
        (toolInput as { targetDate?: string }).targetDate,
      );
    case TOOL_NAMES.LOG_WORKOUT:
      return buildWorkoutRecordSuccessReply(
        output as LogWorkoutOutput,
        (toolInput as { targetDate?: string }).targetDate,
      );
    case TOOL_NAMES.LOG_STATUS:
      return buildStatusRecordSuccessReply(toolInput as LogStatusInput);
    case TOOL_NAMES.LOG_REFERENCE:
      return buildReferenceRecordSuccessReply(output as LogReferenceOutput);
    default:
      return '已记录。';
  }
}

export function buildLookupStockReply(
  result: LookupStockOutput,
  query?: string,
): string {
  if (result.resultCount === 0) {
    return query
      ? `没有找到和“${query}”相关的库存。`
      : '当前没有可展示的库存。';
  }

  const header = query ? `和“${query}”相关的库存：` : '当前库存：';

  return `${header}\n${result.items.map((item) => `- ${item.itemName}: ${item.amount}`).join('\n')}`;
}

export function buildNutritionSummaryReply(
  result: SummarizeNutritionOutput,
  targetDate?: string,
): string {
  const dateLabel = targetDate ? formatDateLabel(targetDate) : '今天';

  if (result.mealsCount === 0) {
    return `${dateLabel}还没有饮食记录，所以现在没法汇总热量、蛋白质和蔬菜。`;
  }

  const lines = [
    result.totalCalories === null
      ? `${dateLabel}共记录 ${result.mealsCount} 餐，但还没有足够的热量汇总数据。`
      : `${dateLabel}共记录 ${result.mealsCount} 餐，热量约 ${result.totalCalories} kcal。`,
    result.totalProtein === null
      ? '蛋白：今天还没有足够的参考数据，暂时没法可靠判断。'
      : result.proteinTarget === null
        ? `蛋白：已识别约 ${result.totalProtein} g，但我这里没有最近体重，先不判断够不够。`
        : result.totalProtein >= result.proteinTarget
          ? `蛋白：已识别约 ${result.totalProtein} g。今天先按 ${result.proteinTarget} g 看，已经够了。`
          : `蛋白：已识别约 ${result.totalProtein} g。今天先按 ${result.proteinTarget} g 看，还差约 ${Number((result.proteinTarget - result.totalProtein).toFixed(1))} g。`,
    result.totalVegetableGrams === null
      ? '蔬菜：今天还没有足够的重量数据，暂时没法可靠判断。'
      : result.totalVegetableGrams >= 300
        ? `蔬菜：已识别约 ${result.totalVegetableGrams} g，达到今天的基础目标。`
        : `蔬菜：已识别约 ${result.totalVegetableGrams} g，离基础目标 300 g 还差约 ${Number((300 - result.totalVegetableGrams).toFixed(1))} g。`,
  ];

  if (result.unresolvedItems.length > 0) {
    lines.push(`未纳入计算：${result.unresolvedItems.join('、')}。`);
  }

  return lines.join('\n');
}

export function buildLookupReferenceReply(
  result: LookupReferenceOutput,
  query?: string,
): string {
  if (result.resultCount === 0) {
    return query
      ? `没有找到和“${query}”相关的热量参考。`
      : '热量参考表还是空的，暂时没有可展示的条目。';
  }

  const header = query ? `📖 “${query}” 的热量参考：` : '📖 热量参考表：';

  return `${header}\n${result.references
    .map((item) => `• ${item.foodName}${item.brand ? `（${item.brand}）` : ''}`)
    .join('\n')}`;
}

export function buildBodyRecordSuccessReply(
  result: {
    weightKg: number | null;
    bmi: number | null;
    bodyFatPct: number | null;
    leanBodyMassKg: number | null;
  },
  targetDate?: string,
): string {
  const parts = [`${buildDatePrefix(targetDate)}身体数据已记录。`];

  if (result.weightKg !== null) {
    parts.push(`体重 ${result.weightKg} kg`);
  }

  if (result.bmi !== null) {
    parts.push(`BMI ${result.bmi}`);
  }

  if (result.bodyFatPct !== null) {
    parts.push(`体脂率 ${result.bodyFatPct}%`);
  }

  if (result.leanBodyMassKg !== null) {
    parts.push(`去脂体重 ${result.leanBodyMassKg} kg`);
  }

  return parts.join(' ');
}

export function buildSleepRecordSuccessReply(
  result: LogSleepOutput,
  targetDate?: string,
): string {
  const qualityLabels: Record<string, string> = {
    good: '好',
    normal: '一般',
    poor: '差',
  };

  return `${buildDatePrefix(targetDate)}睡眠已记录，共 ${result.sleepHours ?? '未知'} 小时，质量${qualityLabels[result.sleepQuality ?? 'normal'] ?? result.sleepQuality ?? '一般'}。`;
}

export function buildWorkoutRecordSuccessReply(
  result: LogWorkoutOutput,
  targetDate?: string,
): string {
  return `${buildDatePrefix(targetDate)}运动 ${result.workoutName} 已记录，时长 ${result.durationMin ?? '未知'} 分钟。`;
}

export function buildStatusRecordSuccessReply(input: LogStatusInput): string {
  const prefix = buildDatePrefix(input.targetDate);

  switch (input.entryType) {
    case 'bowel':
      return `${prefix}排便状态已记录。`;
    case 'menstruation':
      return input.cycleDay === null || input.cycleDay === undefined
        ? `${prefix}经期状态已记录。`
        : `${prefix}经期状态已记录，周期第 ${input.cycleDay} 天。`;
    case 'symptom':
      return `${prefix}症状 ${String(input.value ?? input.note ?? '').trim()} 已记录。`;
    case 'medication':
      return `${prefix}用药记录 ${String(input.value ?? input.note ?? '').trim()} 已记录。`;
  }
}

export function buildReferenceRecordSuccessReply(
  result: LogReferenceOutput,
): string {
  const brandSuffix = result.brand ? `（${result.brand}）` : '';
  const caloriesLabel =
    result.caloriesKcal === null ? '热量未填写' : `${result.caloriesKcal} kcal`;

  return `参考条目 ${result.foodName}${brandSuffix} 已记录，${caloriesLabel}。`;
}
