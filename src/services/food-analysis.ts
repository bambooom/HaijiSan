import {
  refCaloriesRepository,
  type FoodReference,
} from '../repositories/ref-calories';
import type { IngredientEstimateInput, MealType } from '../types';

export type ParsedIngredient = {
  sourceSegment: string;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedCalories: number | null;
  linkedFoodRefId: string;
  matchedReference: FoodReference | null;
};

export type ParsedFoodInput = {
  mealType: MealType;
  mealText: string;
  items: ParsedIngredient[];
  segmentCount: number;
};

export type MealEstimateResult = {
  mealType: MealType;
  mealText: string;
  items: ParsedIngredient[];
  segmentCount: number;
  estimatedCalories: number | null;
  matchedCount: number;
  unmatchedSegments: string[];
};

const MEAL_TYPE_PREFIXES: Array<{ prefix: string; mealType: MealType }> = [
  { prefix: '早餐', mealType: 'breakfast' },
  { prefix: '早饭', mealType: 'breakfast' },
  { prefix: '早', mealType: 'breakfast' },
  { prefix: '午餐', mealType: 'lunch' },
  { prefix: '午饭', mealType: 'lunch' },
  { prefix: '中饭', mealType: 'lunch' },
  { prefix: '午', mealType: 'lunch' },
  { prefix: '中', mealType: 'lunch' },
  { prefix: '晚餐', mealType: 'dinner' },
  { prefix: '晚饭', mealType: 'dinner' },
  { prefix: '晚', mealType: 'dinner' },
  { prefix: '加餐', mealType: 'snack' },
  { prefix: '夜宵', mealType: 'snack' },
  { prefix: '宵夜', mealType: 'snack' },
  { prefix: '零食', mealType: 'snack' },
  { prefix: 'breakfast', mealType: 'breakfast' },
  { prefix: 'lunch', mealType: 'lunch' },
  { prefix: 'dinner', mealType: 'dinner' },
  { prefix: 'snack', mealType: 'snack' },
];

const CHINESE_DIGIT_VALUES: Record<string, number> = {
  '零': 0,
  '一': 1,
  '二': 2,
  '两': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
};

const MEAL_TIME_HINTS: Array<{ pattern: RegExp; mealType: MealType }> = [
  { pattern: /(早餐|早饭|早上|早晨|清晨)/, mealType: 'breakfast' },
  { pattern: /(午餐|午饭|中饭|中午)/, mealType: 'lunch' },
  { pattern: /(晚餐|晚饭|晚上|傍晚)/, mealType: 'dinner' },
  { pattern: /(下午|加餐|夜宵|宵夜|零食)/, mealType: 'snack' },
];

function parseChineseNumberToken(token: string): number | null {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return null;
  }

  if (normalizedToken === '半') {
    return 0.5;
  }

  if (/^\d+(?:\.\d+)?$/.test(normalizedToken)) {
    return Number(normalizedToken);
  }

  if (/^[零一二两三四五六七八九十]+$/.test(normalizedToken) === false) {
    return null;
  }

  if (!normalizedToken.includes('十')) {
    return CHINESE_DIGIT_VALUES[normalizedToken] ?? null;
  }

  const [tensPart, onesPart] = normalizedToken.split('十');
  const tens = tensPart === '' ? 1 : CHINESE_DIGIT_VALUES[tensPart];
  const ones = onesPart === '' ? 0 : CHINESE_DIGIT_VALUES[onesPart];

  if (tens === undefined || ones === undefined) {
    return null;
  }

  return tens * 10 + ones;
}

function normalizeMealText(text: string): string {
  return text
    .trim()
    .replace(
      /^(?:我)?(?:今天|刚刚|刚才|刚)?(?:早上|早晨|清晨|上午|中午|下午|傍晚|晚上)?(?:的)?(?:早饭|早餐|午饭|午餐|中饭|晚饭|晚餐|加餐|夜宵|宵夜|零食)?(?:里)?(?:吃了|喝了|吃的是|喝的是|吃|喝)/,
      '',
    )
    .replace(
      /^(?:我)?(?:今天|刚刚|刚才|刚)?(?:早上|早晨|清晨|上午|中午|下午|傍晚|晚上)(?:的)?/,
      '',
    )
    .replace(/^(?:来了一份|来了点|整了点)/, '')
    .replace(
      /^(?:一份|一杯|一碗|一个|一盒)(?=.+(?:牛奶|豆浆|咖啡|酸奶|米饭|面|粉|沙拉|水果))/u,
      (match) => match,
    )
    .trim();
}

function inferMealTypeByTimeHint(content: string): MealType {
  for (const { pattern, mealType } of MEAL_TIME_HINTS) {
    if (pattern.test(content)) {
      return mealType;
    }
  }

  return 'snack';
}

export function normalizeUnit(unit: string): string {
  const normalizedUnit = unit.trim().toLowerCase();

  if (normalizedUnit === '克') {
    return 'g';
  }

  if (normalizedUnit === '千克') {
    return 'kg';
  }

  if (normalizedUnit === '毫升') {
    return 'ml';
  }

  if (normalizedUnit === '升') {
    return 'l';
  }

  return normalizedUnit;
}

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const normalizedFromUnit = normalizeUnit(fromUnit);
  const normalizedToUnit = normalizeUnit(toUnit);

  if (normalizedFromUnit === normalizedToUnit) {
    return quantity;
  }

  if (normalizedFromUnit === 'kg' && normalizedToUnit === 'g') {
    return quantity * 1000;
  }

  if (normalizedFromUnit === 'g' && normalizedToUnit === 'kg') {
    return quantity / 1000;
  }

  if (normalizedFromUnit === 'l' && normalizedToUnit === 'ml') {
    return quantity * 1000;
  }

  if (normalizedFromUnit === 'ml' && normalizedToUnit === 'l') {
    return quantity / 1000;
  }

  return null;
}

function findBestReference(keyword: string): FoodReference | null {
  const matches = refCaloriesRepository.searchByKeyword(keyword);
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (matches.length === 0) {
    return null;
  }

  const exactMatch = matches.find((match) => {
    const normalizedName = match.name.trim().toLowerCase();
    const normalizedBrand = match.brand.trim().toLowerCase();

    return (
      normalizedName === normalizedKeyword ||
      `${normalizedBrand} ${normalizedName}`.trim() === normalizedKeyword
    );
  });

  if (exactMatch) {
    return exactMatch;
  }

  return matches.sort((left, right) => left.name.length - right.name.length)[0];
}

function estimateCaloriesForReference(
  quantity: number,
  unit: string,
  reference: FoodReference | null,
): number | null {
  if (
    !reference ||
    reference.servingSize === null ||
    reference.servingSize <= 0
  ) {
    return null;
  }

  const convertedQuantity = convertQuantity(quantity, unit, reference.unit);

  if (convertedQuantity === null) {
    return null;
  }

  return Number(
    ((convertedQuantity * reference.calories) / reference.servingSize).toFixed(
      1,
    ),
  );
}

export function createParsedIngredient(
  item: IngredientEstimateInput,
): ParsedIngredient | null {
  const itemName = item.itemName.trim();
  const unit = item.unit.trim();
  const quantity = item.quantity;

  if (!itemName || !unit || Number.isNaN(quantity) || quantity <= 0) {
    return null;
  }

  const matchedReference = findBestReference(itemName);

  return {
    sourceSegment: `${quantity}${unit}${itemName}`,
    itemName,
    quantity,
    unit,
    estimatedCalories: estimateCaloriesForReference(
      quantity,
      unit,
      matchedReference,
    ),
    linkedFoodRefId: matchedReference?.id ?? '',
    matchedReference,
  };
}

export function inferMealType(content: string): {
  mealType: MealType;
  mealText: string;
} {
  const trimmedContent = content.trim();

  for (const { prefix, mealType } of MEAL_TYPE_PREFIXES) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = trimmedContent.match(
      new RegExp(`^${escapedPrefix}(?:[:：]|\\s+)(.+)$`, 'i'),
    );

    if (match) {
      return {
        mealType,
        mealText: normalizeMealText(match[1]),
      };
    }
  }

  return {
    mealType: inferMealTypeByTimeHint(trimmedContent),
    mealText: normalizeMealText(trimmedContent),
  };
}

export function parseWeightedIngredient(
  segment: string,
): ParsedIngredient | null {
  const trimmedSegment = segment.trim();

  if (!trimmedSegment) {
    return null;
  }

  const match = trimmedSegment.match(
    /^((?:\d+(?:\.\d+)?)|半|[零一二两三四五六七八九十]+)(g|kg|ml|l|克|千克|毫升|升|个|颗|枚|份|碗|袋|盒|杯|片|根|条|只|瓶|罐)(.+)$/i,
  );

  if (!match) {
    return null;
  }

  const quantity = parseChineseNumberToken(match[1]);
  const unit = match[2];
  const itemName = match[3].trim();

  if (!itemName || quantity === null || Number.isNaN(quantity)) {
    return null;
  }

  const matchedReference = findBestReference(itemName);

  return {
    sourceSegment: trimmedSegment,
    itemName,
    quantity,
    unit,
    estimatedCalories: estimateCaloriesForReference(
      quantity,
      unit,
      matchedReference,
    ),
    linkedFoodRefId: matchedReference?.id ?? '',
    matchedReference,
  };
}

export function estimateMealCaloriesFromStructured(
  mealType: MealType,
  mealText: string,
  items: IngredientEstimateInput[],
): MealEstimateResult | null {
  const parsedItems = items
    .map((item) => createParsedIngredient(item))
    .filter((item): item is ParsedIngredient => item !== null);

  if (parsedItems.length === 0) {
    return null;
  }

  const estimatedCalories = parsedItems.reduce<number | null>((sum, item) => {
    if (item.estimatedCalories === null) {
      return sum;
    }

    return (sum ?? 0) + item.estimatedCalories;
  }, null);
  const matchedCount = parsedItems.filter(
    (item) => item.estimatedCalories !== null,
  ).length;
  const unmatchedSegments = items
    .filter((item) => {
      return !parsedItems.some(
        (parsedItem) =>
          parsedItem.itemName === item.itemName &&
          parsedItem.quantity === item.quantity &&
          parsedItem.unit === item.unit,
      );
    })
    .map((item) => `${item.quantity}${item.unit}${item.itemName}`);

  return {
    mealType,
    mealText: normalizeMealText(mealText),
    items: parsedItems,
    segmentCount: items.length,
    estimatedCalories,
    matchedCount,
    unmatchedSegments,
  };
}

export function parseWeightedIngredients(text: string): ParsedIngredient[] {
  return text
    .split(/[+,，,]/)
    .map((segment) => parseWeightedIngredient(segment))
    .filter((item): item is ParsedIngredient => item !== null);
}

export function countMeaningfulSegments(text: string): number {
  return text
    .split(/[+,，,]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '').length;
}

export function splitMeaningfulSegments(text: string): string[] {
  return text
    .split(/[+,，,]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');
}

export function parseFoodContent(rawContent: string): ParsedFoodInput | null {
  const trimmedContent = rawContent.trim();

  if (!trimmedContent) {
    return null;
  }

  const { mealType, mealText } = inferMealType(trimmedContent);

  if (!mealText) {
    return null;
  }

  return {
    mealType,
    mealText,
    items: parseWeightedIngredients(mealText),
    segmentCount: countMeaningfulSegments(mealText),
  };
}

export function estimateMealCalories(
  rawContent: string,
): MealEstimateResult | null {
  const parsedFoodInput = parseFoodContent(rawContent);

  if (!parsedFoodInput) {
    return null;
  }

  const unmatchedSegments = splitMeaningfulSegments(
    parsedFoodInput.mealText,
  ).filter(
    (segment) =>
      !parsedFoodInput.items.some((item) => item.sourceSegment === segment),
  );
  const estimatedCalories = parsedFoodInput.items.reduce<number | null>(
    (sum, item) => {
      if (item.estimatedCalories === null) {
        return sum;
      }

      return (sum ?? 0) + item.estimatedCalories;
    },
    null,
  );
  const matchedCount = parsedFoodInput.items.filter(
    (item) => item.estimatedCalories !== null,
  ).length;

  return {
    mealType: parsedFoodInput.mealType,
    mealText: parsedFoodInput.mealText,
    items: parsedFoodInput.items,
    segmentCount: parsedFoodInput.segmentCount,
    estimatedCalories,
    matchedCount,
    unmatchedSegments,
  };
}
