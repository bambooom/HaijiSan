import {
  bodyLogRepository,
  foodItemsRepository,
  foodLogRepository,
  refCaloriesRepository,
} from '../repositories';
import type { FoodItemEntry, FoodLogEntry, MealType } from '../types';
import type { FoodReference } from '../types/repositories';
import { convertQuantity } from './food-analysis';

const DAILY_VEGETABLE_TARGET_G = 300;
const PROTEIN_TARGET_PER_KG = 1.2;
const HIGH_CARB_CALORIE_SHARE_THRESHOLD = 0.6;
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
  mealSummaries: MealNutritionSummary[];
  totalCalories: number | null;
  coveredCaloriesMealCount: number;
  totalProtein: number | null;
  totalFat: number | null;
  totalCarbs: number | null;
  proteinCoveredItemCount: number;
  fatCoveredItemCount: number;
  carbsCoveredItemCount: number;
  proteinTarget: number | null;
  latestWeightKg: number | null;
  proteinUnresolvedItems: string[];
  fatUnresolvedItems: string[];
  carbsUnresolvedItems: string[];
  proteinStatus: 'enough' | 'low' | 'unknown';
  vegetableStatus: 'enough' | 'low' | 'unknown';
  carbsStatus: 'high' | 'moderate' | 'unknown';
  carbCalorieShare: number | null;
  totalVegetableGrams: number | null;
  vegetableCoveredItemCount: number;
  vegetableUnresolvedItems: string[];
};

export type MealNutritionSummary = {
  meal: FoodLogEntry;
  totalCalories: number | null;
  totalProtein: number | null;
  totalFat: number | null;
  totalCarbs: number | null;
  totalVegetableGrams: number | null;
  proteinCoveredItemCount: number;
  fatCoveredItemCount: number;
  carbsCoveredItemCount: number;
  vegetableCoveredItemCount: number;
  proteinUnresolvedItems: string[];
  fatUnresolvedItems: string[];
  carbsUnresolvedItems: string[];
  vegetableUnresolvedItems: string[];
};

type NutrientKey = 'protein' | 'fat' | 'carbs';

type MealNutritionAccumulator = MealNutritionSummary;

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

function createEmptyMealSummary(meal: FoodLogEntry): MealNutritionAccumulator {
  return {
    meal,
    totalCalories: meal.estimated_calories,
    totalProtein: null,
    totalFat: null,
    totalCarbs: null,
    totalVegetableGrams: null,
    proteinCoveredItemCount: 0,
    fatCoveredItemCount: 0,
    carbsCoveredItemCount: 0,
    vegetableCoveredItemCount: 0,
    proteinUnresolvedItems: [],
    fatUnresolvedItems: [],
    carbsUnresolvedItems: [],
    vegetableUnresolvedItems: [],
  };
}

function getReferenceNutrientValue(
  item: FoodItemEntry,
  referenceMap: Map<string, FoodReference>,
  nutrientKey: NutrientKey,
): number | null {
  if (item.quantity === null || !item.linked_food_ref_id) {
    return null;
  }

  const reference = referenceMap.get(item.linked_food_ref_id);

  if (
    !reference ||
    reference.servingSize === null ||
    reference.servingSize <= 0
  ) {
    return null;
  }

  const nutrientValue = reference[nutrientKey];

  if (nutrientValue === null) {
    return null;
  }

  const convertedQuantity = convertQuantity(
    item.quantity,
    item.unit,
    reference.unit,
  );

  if (convertedQuantity === null) {
    return null;
  }

  return (convertedQuantity * nutrientValue) / reference.servingSize;
}

function getVegetableGrams(item: FoodItemEntry): number | null {
  if (!isVegetableItem(item.item_name) || item.quantity === null) {
    return null;
  }

  return convertQuantity(item.quantity, item.unit, 'g');
}

function addRounded(currentValue: number | null, nextValue: number): number {
  return roundToOneDecimal((currentValue ?? 0) + nextValue);
}

function buildMealSummaries(
  meals: FoodLogEntry[],
  items: FoodItemEntry[],
  referenceMap: Map<string, FoodReference>,
): MealNutritionSummary[] {
  const itemsByMeal = new Map<string, FoodItemEntry[]>();

  for (const item of items) {
    const mealItems = itemsByMeal.get(item.parent_food_log_id) ?? [];
    mealItems.push(item);
    itemsByMeal.set(item.parent_food_log_id, mealItems);
  }

  return meals.map((meal) => {
    const summary = createEmptyMealSummary(meal);
    const mealItems = itemsByMeal.get(meal.food_log_id) ?? [];
    let fallbackCalories = 0;
    let fallbackCaloriesCount = 0;

    for (const item of mealItems) {
      if (item.estimated_calories !== null) {
        fallbackCalories += item.estimated_calories;
        fallbackCaloriesCount += 1;
      }

      const protein = getReferenceNutrientValue(item, referenceMap, 'protein');
      if (protein === null) {
        summary.proteinUnresolvedItems.push(item.item_name);
      } else {
        summary.totalProtein = addRounded(summary.totalProtein, protein);
        summary.proteinCoveredItemCount += 1;
      }

      const fat = getReferenceNutrientValue(item, referenceMap, 'fat');
      if (fat === null) {
        summary.fatUnresolvedItems.push(item.item_name);
      } else {
        summary.totalFat = addRounded(summary.totalFat, fat);
        summary.fatCoveredItemCount += 1;
      }

      const carbs = getReferenceNutrientValue(item, referenceMap, 'carbs');
      if (carbs === null) {
        summary.carbsUnresolvedItems.push(item.item_name);
      } else {
        summary.totalCarbs = addRounded(summary.totalCarbs, carbs);
        summary.carbsCoveredItemCount += 1;
      }

      if (!isVegetableItem(item.item_name)) {
        continue;
      }

      const grams = getVegetableGrams(item);
      if (grams === null) {
        summary.vegetableUnresolvedItems.push(item.item_name);
      } else {
        summary.totalVegetableGrams = addRounded(
          summary.totalVegetableGrams,
          grams,
        );
        summary.vegetableCoveredItemCount += 1;
      }
    }

    if (summary.totalCalories === null && fallbackCaloriesCount > 0) {
      summary.totalCalories = roundToOneDecimal(fallbackCalories);
    }

    return {
      ...summary,
      proteinUnresolvedItems: uniqNames(summary.proteinUnresolvedItems),
      fatUnresolvedItems: uniqNames(summary.fatUnresolvedItems),
      carbsUnresolvedItems: uniqNames(summary.carbsUnresolvedItems),
      vegetableUnresolvedItems: uniqNames(summary.vegetableUnresolvedItems),
    };
  });
}

function sumNullable(values: Array<number | null>): number | null {
  const definedValues = values.filter(
    (value): value is number => typeof value === 'number',
  );

  if (definedValues.length === 0) {
    return null;
  }

  return roundToOneDecimal(
    definedValues.reduce((sum, value) => sum + value, 0),
  );
}

function getProteinStatus(
  totalProtein: number | null,
  proteinTarget: number | null,
): NutritionSummary['proteinStatus'] {
  if (totalProtein === null || proteinTarget === null) {
    return 'unknown';
  }

  return totalProtein >= proteinTarget ? 'enough' : 'low';
}

function getVegetableStatus(
  totalVegetableGrams: number | null,
): NutritionSummary['vegetableStatus'] {
  if (totalVegetableGrams === null) {
    return 'unknown';
  }

  return totalVegetableGrams >= DAILY_VEGETABLE_TARGET_G ? 'enough' : 'low';
}

function getCarbCalorieShare(
  totalCarbs: number | null,
  totalCalories: number | null,
): number | null {
  if (totalCarbs === null || totalCalories === null || totalCalories <= 0) {
    return null;
  }

  return roundToOneDecimal((totalCarbs * 4) / totalCalories);
}

function getCarbsStatus(
  carbCalorieShare: number | null,
): NutritionSummary['carbsStatus'] {
  if (carbCalorieShare === null) {
    return 'unknown';
  }

  return carbCalorieShare >= HIGH_CARB_CALORIE_SHARE_THRESHOLD
    ? 'high'
    : 'moderate';
}

function formatMealType(mealType: MealType): string {
  switch (mealType) {
    case 'breakfast':
      return '早餐';
    case 'lunch':
      return '午餐';
    case 'dinner':
      return '晚餐';
    case 'snack':
      return '加餐';
  }
}

export function buildNutritionSummaryFromRecords(input: {
  meals: FoodLogEntry[];
  items: FoodItemEntry[];
  references: FoodReference[];
  latestWeightKg: number | null;
}): NutritionSummary {
  const referenceMap = buildReferenceMap(input.references);
  const mealSummaries = buildMealSummaries(
    input.meals,
    input.items,
    referenceMap,
  );
  const totalCalories = sumNullable(
    mealSummaries.map((mealSummary) => mealSummary.totalCalories),
  );
  const totalProtein = sumNullable(
    mealSummaries.map((mealSummary) => mealSummary.totalProtein),
  );
  const totalFat = sumNullable(
    mealSummaries.map((mealSummary) => mealSummary.totalFat),
  );
  const totalCarbs = sumNullable(
    mealSummaries.map((mealSummary) => mealSummary.totalCarbs),
  );
  const totalVegetableGrams = sumNullable(
    mealSummaries.map((mealSummary) => mealSummary.totalVegetableGrams),
  );
  const coveredCaloriesMealCount = mealSummaries.filter(
    (mealSummary) => mealSummary.totalCalories !== null,
  ).length;
  const proteinCoveredItemCount = mealSummaries.reduce(
    (sum, mealSummary) => sum + mealSummary.proteinCoveredItemCount,
    0,
  );
  const fatCoveredItemCount = mealSummaries.reduce(
    (sum, mealSummary) => sum + mealSummary.fatCoveredItemCount,
    0,
  );
  const carbsCoveredItemCount = mealSummaries.reduce(
    (sum, mealSummary) => sum + mealSummary.carbsCoveredItemCount,
    0,
  );
  const vegetableCoveredItemCount = mealSummaries.reduce(
    (sum, mealSummary) => sum + mealSummary.vegetableCoveredItemCount,
    0,
  );
  const proteinUnresolvedItems = uniqNames(
    mealSummaries.flatMap((mealSummary) => mealSummary.proteinUnresolvedItems),
  );
  const fatUnresolvedItems = uniqNames(
    mealSummaries.flatMap((mealSummary) => mealSummary.fatUnresolvedItems),
  );
  const carbsUnresolvedItems = uniqNames(
    mealSummaries.flatMap((mealSummary) => mealSummary.carbsUnresolvedItems),
  );
  const vegetableUnresolvedItems = uniqNames(
    mealSummaries.flatMap(
      (mealSummary) => mealSummary.vegetableUnresolvedItems,
    ),
  );
  const proteinTarget =
    input.latestWeightKg === null
      ? null
      : roundToOneDecimal(input.latestWeightKg * PROTEIN_TARGET_PER_KG);
  const carbCalorieShare = getCarbCalorieShare(totalCarbs, totalCalories);

  return {
    meals: input.meals,
    mealSummaries,
    totalCalories,
    coveredCaloriesMealCount,
    totalProtein,
    totalFat,
    totalCarbs,
    proteinCoveredItemCount,
    fatCoveredItemCount,
    carbsCoveredItemCount,
    proteinTarget,
    latestWeightKg: input.latestWeightKg,
    proteinUnresolvedItems,
    fatUnresolvedItems,
    carbsUnresolvedItems,
    proteinStatus: getProteinStatus(totalProtein, proteinTarget),
    vegetableStatus: getVegetableStatus(totalVegetableGrams),
    carbsStatus: getCarbsStatus(carbCalorieShare),
    carbCalorieShare,
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

function buildFatCarbLine(summary: NutritionSummary): string {
  const fatText =
    summary.totalFat === null
      ? '脂肪暂无足够参考数据'
      : `脂肪约 ${summary.totalFat} g`;
  const carbsText =
    summary.totalCarbs === null
      ? '碳水暂无足够参考数据'
      : `碳水约 ${summary.totalCarbs} g`;

  return `宏量：${fatText}；${carbsText}。`;
}

function buildMealBreakdownLines(summary: NutritionSummary): string[] {
  if (summary.mealSummaries.length === 0) {
    return [];
  }

  return [
    '分餐：',
    ...summary.mealSummaries.map((mealSummary) => {
      const caloriesText =
        mealSummary.totalCalories === null
          ? '热量待补'
          : `${mealSummary.totalCalories} kcal`;
      const proteinText =
        mealSummary.totalProtein === null
          ? '蛋白 --'
          : `蛋白 ${mealSummary.totalProtein} g`;
      const fatText =
        mealSummary.totalFat === null
          ? '脂肪 --'
          : `脂肪 ${mealSummary.totalFat} g`;
      const carbsText =
        mealSummary.totalCarbs === null
          ? '碳水 --'
          : `碳水 ${mealSummary.totalCarbs} g`;
      const vegetableText =
        mealSummary.totalVegetableGrams === null
          ? '蔬菜 --'
          : `蔬菜 ${mealSummary.totalVegetableGrams} g`;

      return `${formatMealType(mealSummary.meal.meal_type)} ${mealSummary.meal.meal_text}：${caloriesText}；${proteinText}；${fatText}；${carbsText}；${vegetableText}。`;
    }),
  ];
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

  if (summary.fatUnresolvedItems.length > 0) {
    lines.push(`脂肪未纳入：${summary.fatUnresolvedItems.join('、')}。`);
  }

  if (summary.carbsUnresolvedItems.length > 0) {
    lines.push(`碳水未纳入：${summary.carbsUnresolvedItems.join('、')}。`);
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
    buildFatCarbLine(summary),
    buildVegetableLine(summary),
    ...buildMealBreakdownLines(summary),
    ...buildCoverageLines(summary),
  ].join('\n');
}
