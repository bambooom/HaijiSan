import {
  bodyLogRepository,
  foodItemsRepository,
  foodLogRepository,
  refCaloriesRepository,
} from '../repositories';
import type { FoodItemEntry, FoodLogEntry } from '../types';
import type { FoodReference } from '../types/repositories';
import { convertQuantity } from './food-analysis';

const DAILY_VEGETABLE_TARGET_G = 300;
const PROTEIN_TARGET_PER_KG = 1.2;
const VEGETABLE_KEYWORDS = [
  '菠菜',
  '生菜',
  '油麦菜',
  '西兰花',
  '有机西兰花',
  '西葫芦',
  '茼蒿',
  '小番茄',
  '番茄',
  '娃娃菜',
  '苋菜',
  '枸杞芽',
  '海鲜菇',
  '香菇',
  '金针菇',
  '蘑菇',
  '黄瓜',
  '芦笋',
  '青椒',
  '彩椒',
  '花菜',
  '西红柿',
  '白菜',
  '卷心菜',
  '甘蓝',
  '菜花',
  '苦瓜',
  '南瓜',
  '冬瓜',
  '丝瓜',
  '萝卜',
  '胡萝卜',
  '芹菜',
  '豆芽',
  '豆苗',
];

export type NutritionSummary = {
  meals: FoodLogEntry[];
  totalCalories: number | null;
  coveredCaloriesMealCount: number;
  totalProtein: number | null;
  proteinCoveredItemCount: number;
  proteinTarget: number | null;
  latestWeightKg: number | null;
  proteinUnresolvedItems: string[];
  totalVegetableGrams: number | null;
  vegetableCoveredItemCount: number;
  vegetableUnresolvedItems: string[];
};

function roundToOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function uniqNames(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isVegetableItem(name: string): boolean {
  return VEGETABLE_KEYWORDS.some((keyword) => name.includes(keyword));
}

function buildReferenceMap(items: FoodReference[]): Map<string, FoodReference> {
  return new Map(items.map((item) => [item.id, item]));
}

function sumCalories(meals: FoodLogEntry[]): {
  totalCalories: number | null;
  coveredCaloriesMealCount: number;
} {
  let totalCalories = 0;
  let coveredCaloriesMealCount = 0;

  for (const meal of meals) {
    if (typeof meal.estimated_calories !== 'number') {
      continue;
    }

    totalCalories += meal.estimated_calories;
    coveredCaloriesMealCount += 1;
  }

  return {
    totalCalories:
      coveredCaloriesMealCount > 0 ? roundToOneDecimal(totalCalories) : null,
    coveredCaloriesMealCount,
  };
}

function sumProtein(
  items: FoodItemEntry[],
  referenceMap: Map<string, FoodReference>,
): {
  totalProtein: number | null;
  proteinCoveredItemCount: number;
  proteinUnresolvedItems: string[];
} {
  let totalProtein = 0;
  let proteinCoveredItemCount = 0;
  const proteinUnresolvedItems: string[] = [];

  for (const item of items) {
    if (item.quantity === null || !item.linked_food_ref_id) {
      proteinUnresolvedItems.push(item.item_name);
      continue;
    }

    const reference = referenceMap.get(item.linked_food_ref_id);

    if (
      !reference ||
      reference.protein === null ||
      reference.servingSize === null ||
      reference.servingSize <= 0
    ) {
      proteinUnresolvedItems.push(item.item_name);
      continue;
    }

    const convertedQuantity = convertQuantity(
      item.quantity,
      item.unit,
      reference.unit,
    );

    if (convertedQuantity === null) {
      proteinUnresolvedItems.push(item.item_name);
      continue;
    }

    totalProtein +=
      (convertedQuantity * reference.protein) / reference.servingSize;
    proteinCoveredItemCount += 1;
  }

  return {
    totalProtein:
      proteinCoveredItemCount > 0 ? roundToOneDecimal(totalProtein) : null,
    proteinCoveredItemCount,
    proteinUnresolvedItems: uniqNames(proteinUnresolvedItems),
  };
}

function sumVegetables(items: FoodItemEntry[]): {
  totalVegetableGrams: number | null;
  vegetableCoveredItemCount: number;
  vegetableUnresolvedItems: string[];
} {
  let totalVegetableGrams = 0;
  let vegetableCoveredItemCount = 0;
  const vegetableUnresolvedItems: string[] = [];

  for (const item of items) {
    if (!isVegetableItem(item.item_name)) {
      continue;
    }

    if (item.quantity === null) {
      vegetableUnresolvedItems.push(item.item_name);
      continue;
    }

    const grams = convertQuantity(item.quantity, item.unit, 'g');

    if (grams === null) {
      vegetableUnresolvedItems.push(item.item_name);
      continue;
    }

    totalVegetableGrams += grams;
    vegetableCoveredItemCount += 1;
  }

  return {
    totalVegetableGrams:
      vegetableCoveredItemCount > 0
        ? roundToOneDecimal(totalVegetableGrams)
        : null,
    vegetableCoveredItemCount,
    vegetableUnresolvedItems: uniqNames(vegetableUnresolvedItems),
  };
}

export function buildNutritionSummaryFromRecords(input: {
  meals: FoodLogEntry[];
  items: FoodItemEntry[];
  references: FoodReference[];
  latestWeightKg: number | null;
}): NutritionSummary {
  const referenceMap = buildReferenceMap(input.references);
  const { totalCalories, coveredCaloriesMealCount } = sumCalories(input.meals);
  const { totalProtein, proteinCoveredItemCount, proteinUnresolvedItems } =
    sumProtein(input.items, referenceMap);
  const {
    totalVegetableGrams,
    vegetableCoveredItemCount,
    vegetableUnresolvedItems,
  } = sumVegetables(input.items);

  return {
    meals: input.meals,
    totalCalories,
    coveredCaloriesMealCount,
    totalProtein,
    proteinCoveredItemCount,
    proteinTarget:
      input.latestWeightKg === null
        ? null
        : roundToOneDecimal(input.latestWeightKg * PROTEIN_TARGET_PER_KG),
    latestWeightKg: input.latestWeightKg,
    proteinUnresolvedItems,
    totalVegetableGrams,
    vegetableCoveredItemCount,
    vegetableUnresolvedItems,
  };
}

export function getTodayNutritionSummary(
  timestamp: Date,
): NutritionSummary | null {
  const meals = foodLogRepository.listByDate(timestamp);

  if (meals.length === 0) {
    return null;
  }

  const items = foodItemsRepository.listByFoodLogIds(
    meals.map((meal) => meal.food_log_id),
  );
  const references = refCaloriesRepository.findByIds(
    uniqNames(items.map((item) => item.linked_food_ref_id)),
  );

  return buildNutritionSummaryFromRecords({
    meals,
    items,
    references,
    latestWeightKg: bodyLogRepository.getLatestWeight(),
  });
}

function buildProteinLine(summary: NutritionSummary): string {
  if (summary.totalProtein === null) {
    return '蛋白：今天还没有足够的参考数据，暂时没法可靠判断。';
  }

  if (summary.proteinTarget === null || summary.latestWeightKg === null) {
    return `蛋白：已识别约 ${summary.totalProtein} g，但我这里没有最近体重，先不判断够不够。`;
  }

  if (summary.totalProtein >= summary.proteinTarget) {
    return `蛋白：已识别约 ${summary.totalProtein} g。按最近体重 ${summary.latestWeightKg} kg，今天先按 ${summary.proteinTarget} g 看，已经够了。`;
  }

  return `蛋白：已识别约 ${summary.totalProtein} g。按最近体重 ${summary.latestWeightKg} kg，今天先按 ${summary.proteinTarget} g 看，还差约 ${roundToOneDecimal(summary.proteinTarget - summary.totalProtein)} g。`;
}

function buildVegetableLine(summary: NutritionSummary): string {
  if (summary.totalVegetableGrams === null) {
    return '蔬菜：今天还没有足够的重量数据，暂时没法可靠判断。';
  }

  if (summary.totalVegetableGrams >= DAILY_VEGETABLE_TARGET_G) {
    return `蔬菜：已识别约 ${summary.totalVegetableGrams} g，达到今天的基础目标。`;
  }

  return `蔬菜：已识别约 ${summary.totalVegetableGrams} g，离基础目标 ${DAILY_VEGETABLE_TARGET_G} g 还差约 ${roundToOneDecimal(DAILY_VEGETABLE_TARGET_G - summary.totalVegetableGrams)} g。`;
}

function buildCoverageLines(summary: NutritionSummary): string[] {
  const lines: string[] = [];

  if (summary.coveredCaloriesMealCount < summary.meals.length) {
    lines.push(
      `热量覆盖 ${summary.coveredCaloriesMealCount}/${summary.meals.length} 餐。`,
    );
  }

  if (summary.proteinUnresolvedItems.length > 0) {
    lines.push(`蛋白未纳入：${summary.proteinUnresolvedItems.join('、')}。`);
  }

  if (summary.vegetableUnresolvedItems.length > 0) {
    lines.push(`蔬菜未纳入：${summary.vegetableUnresolvedItems.join('、')}。`);
  }

  return lines;
}

export function buildTodayNutritionReply(summary: NutritionSummary): string {
  const caloriesLine =
    summary.totalCalories === null
      ? `今天共记录 ${summary.meals.length} 餐，但还没有足够的热量汇总数据。`
      : `今天共记录 ${summary.meals.length} 餐，热量约 ${summary.totalCalories} kcal。`;

  return [
    caloriesLine,
    buildProteinLine(summary),
    buildVegetableLine(summary),
    ...buildCoverageLines(summary),
  ].join('\n');
}
