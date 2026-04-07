import { foodLogTable } from '../tables';
import type { FoodLogEntry, MealType } from '../types';

const DAILY_VEGETABLE_TARGET_G = 300;
const PROTEIN_TARGET_PER_KG = 1.2;
const HIGH_CARB_CALORIE_SHARE_THRESHOLD = 0.6;

export type NutritionSummary = {
  meals: FoodLogEntry[];
  mealSummaries: MealNutritionSummary[];
  totalCalories: number | null;
  totalProtein: number | null;
  totalFat: number | null;
  totalCarbs: number | null;
  proteinTarget: number | null;
  latestWeightKg: number | null;
  proteinStatus: 'enough' | 'low' | 'unknown';
  vegetableStatus: 'enough' | 'low' | 'unknown';
  carbsStatus: 'high' | 'moderate' | 'unknown';
  carbCalorieShare: number | null;
  totalVegetableGrams: number | null;
};

export type MealNutritionSummary = {
  meal: FoodLogEntry;
  totalCalories: number | null;
  totalProtein: number | null;
  totalFat: number | null;
  totalCarbs: number | null;
  totalVegetableGrams: number | null;
};

function roundToOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function buildMealSummaries(meals: FoodLogEntry[]): MealNutritionSummary[] {
  return meals.map((meal) => ({
    meal,
    totalCalories: meal.calories_kcal,
    totalProtein: meal.protein_g,
    totalFat: meal.fat_g,
    totalCarbs: meal.carbs_g,
    totalVegetableGrams: meal.vegetable_g,
  }));
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
  latestWeightKg: number | null;
}): NutritionSummary {
  const mealSummaries = buildMealSummaries(input.meals);
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
  const proteinTarget =
    input.latestWeightKg === null
      ? null
      : roundToOneDecimal(input.latestWeightKg * PROTEIN_TARGET_PER_KG);
  const carbCalorieShare = getCarbCalorieShare(totalCarbs, totalCalories);

  return {
    meals: input.meals,
    mealSummaries,
    totalCalories,
    totalProtein,
    totalFat,
    totalCarbs,
    proteinTarget,
    latestWeightKg: input.latestWeightKg,
    proteinStatus: getProteinStatus(totalProtein, proteinTarget),
    vegetableStatus: getVegetableStatus(totalVegetableGrams),
    carbsStatus: getCarbsStatus(carbCalorieShare),
    carbCalorieShare,
    totalVegetableGrams,
  };
}

export function getTodayNutritionSummary(
  timestamp: Date,
): NutritionSummary | null {
  const meals = foodLogTable.listByDate(timestamp);

  if (meals.length === 0) {
    return null;
  }

  return buildNutritionSummaryFromRecords({
    meals,
    // Weight-based target calculation is temporarily disabled until a generic latest-value query exists.
    latestWeightKg: null,
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
  ].join('\n');
}
