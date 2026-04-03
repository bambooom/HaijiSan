import { refCaloriesRepository } from '../repositories/ref-calories';
import type {
  FoodReference,
  IngredientEstimateInput,
  MealType,
  ParsedIngredient,
} from '../types';

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

const WEIGHTED_UNIT_PATTERN =
  'g|kg|ml|l|克|千克|毫升|升|个|颗|枚|份|碗|袋|盒|杯|片|根|条|只|瓶|罐';
const QUANTITY_TOKEN_PATTERN =
  '(?:\\d+(?:\\.\\d+)?)|半|[零一二两三四五六七八九十]+';

export function inferMealTypeByPrefix(content: string): {
  mealType: MealType;
  mealText: string;
} | null {
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

  return null;
}

export function normalizeMealText(text: string): string {
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

export function inferMealTypeByTimeHint(content: string): MealType {
  for (const { pattern, mealType } of MEAL_TIME_HINTS) {
    if (pattern.test(content)) {
      return mealType;
    }
  }

  return 'snack';
}

export function parseWeightedIngredient(
  segment: string,
  estimateCaloriesForReference: (
    quantity: number,
    unit: string,
    reference: FoodReference | null,
  ) => number | null,
): ParsedIngredient | null {
  const trimmedSegment = segment.trim();

  if (!trimmedSegment) {
    return null;
  }

  const prefixedMatch = trimmedSegment.match(
    new RegExp(
      `^(${QUANTITY_TOKEN_PATTERN})(${WEIGHTED_UNIT_PATTERN})(.+)$`,
      'i',
    ),
  );

  if (prefixedMatch) {
    return buildParsedIngredient(
      trimmedSegment,
      prefixedMatch[3],
      prefixedMatch[1],
      prefixedMatch[2],
      estimateCaloriesForReference,
    );
  }

  const suffixedMatch = trimmedSegment.match(
    new RegExp(
      `^(.+?)(?:\\s*[x×*]\\s*|\\s+)(${QUANTITY_TOKEN_PATTERN})(${WEIGHTED_UNIT_PATTERN})$`,
      'i',
    ),
  );

  if (suffixedMatch) {
    return buildParsedIngredient(
      trimmedSegment,
      suffixedMatch[1],
      suffixedMatch[2],
      suffixedMatch[3],
      estimateCaloriesForReference,
    );
  }

  const parenthesizedMatch = trimmedSegment.match(
    new RegExp(
      `^(.+?)[（(]\\s*(${QUANTITY_TOKEN_PATTERN})(${WEIGHTED_UNIT_PATTERN})\\s*[)）]$`,
      'i',
    ),
  );

  if (parenthesizedMatch) {
    return buildParsedIngredient(
      trimmedSegment,
      parenthesizedMatch[1],
      parenthesizedMatch[2],
      parenthesizedMatch[3],
      estimateCaloriesForReference,
    );
  }

  return null;
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

export function createParsedIngredient(
  item: IngredientEstimateInput,
  estimateCaloriesForReference: (
    quantity: number,
    unit: string,
    reference: FoodReference | null,
  ) => number | null,
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

function normalizeIngredientName(rawName: string): string {
  return rawName
    .trim()
    .replace(/^(?:的\s*)+/, '')
    .replace(/[（(][^)）]*[)）]$/g, '')
    .replace(/[x×*]$/i, '')
    .replace(
      /(?:零|一|二|两|三|四|五|六|七|八|九|十|半|\d+)(?:个|颗|枚|份|碗|袋|盒|杯|片|根|条|只|瓶|罐)$/,
      '',
    )
    .trim();
}

function buildParsedIngredient(
  sourceSegment: string,
  rawItemName: string,
  quantityToken: string,
  unit: string,
  estimateCaloriesForReference: (
    quantity: number,
    unit: string,
    reference: FoodReference | null,
  ) => number | null,
): ParsedIngredient | null {
  const quantity = parseChineseNumberToken(quantityToken);
  const itemName = normalizeIngredientName(rawItemName);

  if (!itemName || quantity === null || Number.isNaN(quantity)) {
    return null;
  }

  const matchedReference = findBestReference(itemName);

  return {
    sourceSegment,
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

function findBestReference(keyword: string): FoodReference | null {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const matches = refCaloriesRepository.searchByKeyword(keyword);

  if (matches.length === 0) {
    const fallbackMatch = refCaloriesRepository.listAll().find((match) => {
      const normalizedName = match.name.trim().toLowerCase();
      const normalizedBrand = match.brand.trim().toLowerCase();
      const combined = `${normalizedBrand} ${normalizedName}`.trim();

      return (
        normalizedKeyword.includes(normalizedName) ||
        normalizedName.includes(normalizedKeyword) ||
        (combined !== '' && normalizedKeyword.includes(combined)) ||
        (combined !== '' && combined.includes(normalizedKeyword))
      );
    });

    return fallbackMatch ?? null;
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
