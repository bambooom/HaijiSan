import {
  foodItemsRepository,
  foodLogRepository,
  refCaloriesRepository,
} from '../repositories';
import type { FoodItemEntry, MealType, ParseStatus } from '../types';

type ParsedIngredient = {
  itemName: string;
  quantity: number;
  unit: string;
  estimatedCalories: number | null;
  linkedFoodRefId: string;
};

type ParsedFoodInput = {
  mealType: MealType;
  mealText: string;
  items: ParsedIngredient[];
  segmentCount: number;
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

function inferMealType(content: string): {
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
        mealText: match[1].trim(),
      };
    }
  }

  return {
    mealType: 'snack',
    mealText: trimmedContent,
  };
}

function estimateCalories(
  quantity: number,
  unit: string,
  linkedFoodRefId: string,
): number | null {
  if (unit.toLowerCase() !== 'g' || !linkedFoodRefId) {
    return null;
  }

  const foodReference = refCaloriesRepository.findById(linkedFoodRefId);

  if (!foodReference || foodReference.unit.toLowerCase() !== 'g') {
    return null;
  }

  return Number(((quantity * foodReference.calories) / 100).toFixed(1));
}

function parseWeightedIngredient(segment: string): ParsedIngredient | null {
  const trimmedSegment = segment.trim();

  if (!trimmedSegment) {
    return null;
  }

  const match = trimmedSegment.match(
    /^(\d+(?:\.\d+)?)(g|kg|ml|l|克|千克|毫升|升|个|颗|份|碗|袋|盒|杯|片|根|条)(.+)$/i,
  );

  if (!match) {
    return null;
  }

  const quantity = Number(match[1]);
  const unit = match[2];
  const itemName = match[3].trim();

  if (!itemName || Number.isNaN(quantity)) {
    return null;
  }

  const foodReference = refCaloriesRepository.findByKeyword(itemName);
  const linkedFoodRefId = foodReference?.id ?? '';

  return {
    itemName,
    quantity,
    unit,
    estimatedCalories: estimateCalories(quantity, unit, linkedFoodRefId),
    linkedFoodRefId,
  };
}

function parseWeightedIngredients(text: string): ParsedIngredient[] {
  return text
    .split(/[+,，,]/)
    .map((segment) => parseWeightedIngredient(segment))
    .filter((item): item is ParsedIngredient => item !== null);
}

function countMeaningfulSegments(text: string): number {
  return text
    .split(/[+,，,]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '').length;
}

function buildFoodItemEntries(
  foodLogId: string,
  items: ParsedIngredient[],
): FoodItemEntry[] {
  return items.map((item) => ({
    parent_food_log_id: foodLogId,
    item_name: item.itemName,
    quantity: item.quantity,
    unit: item.unit,
    estimated_calories: item.estimatedCalories,
    linked_food_ref_id: item.linkedFoodRefId,
    linked_stock_item_id: '',
    ai_confidence: null,
    note: '',
  }));
}

function parseFoodContent(text: string): ParsedFoodInput | null {
  const rawContent = text.slice('/food'.length).trim();

  if (!rawContent) {
    return null;
  }

  const { mealType, mealText } = inferMealType(rawContent);

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

function buildFoodSuccessMessage(
  parsedFoodInput: ParsedFoodInput,
  parseStatus: ParseStatus,
): string {
  if (parseStatus === 'parsed') {
    return `✅ 饮食已记录，共识别 ${parsedFoodInput.items.length} 个食材项目。`;
  }

  return '✅ 饮食已记录。我先帮你保存原始内容，后续再补充拆解。';
}

export function handleFoodCommand(
  text: string,
  timestamp: Date,
): string | null {
  if (!text.startsWith('/food')) {
    return null;
  }

  const parsedFoodInput = parseFoodContent(text);

  if (!parsedFoodInput) {
    return '格式错误。请使用：/food 早餐 280g西兰花+81g鸡小胸、/food 早 280g西兰花+81g鸡小胸，或 /food 晚饭 一碗牛肉粉';
  }

  const fullyParsed =
    parsedFoodInput.items.length > 0 &&
    parsedFoodInput.items.length === parsedFoodInput.segmentCount;
  const parseStatus: ParseStatus = fullyParsed ? 'parsed' : 'pending';
  const foodLogEntry = foodLogRepository.createMealEntry(
    timestamp,
    parsedFoodInput.mealType,
    parsedFoodInput.mealText,
    null,
    parseStatus,
    fullyParsed ? '' : 'Best-effort parsing; raw meal text preserved',
  );
  const foodItemEntries = buildFoodItemEntries(
    foodLogEntry.food_log_id,
    parsedFoodInput.items,
  );
  const estimatedCalories = foodItemEntries.reduce<number | null>(
    (sum, item) => {
      if (item.estimated_calories === null) {
        return sum;
      }

      return (sum ?? 0) + item.estimated_calories;
    },
    null,
  );

  foodLogRepository.append(foodLogEntry);

  if (
    estimatedCalories !== null ||
    parseStatus !== foodLogEntry.parse_status ||
    foodLogEntry.note !==
      (fullyParsed ? '' : 'Best-effort parsing; raw meal text preserved')
  ) {
    foodLogRepository.markParseStatus(foodLogEntry.food_log_id, parseStatus, {
      estimatedCalories,
      note: fullyParsed ? '' : 'Best-effort parsing; raw meal text preserved',
    });
  }

  if (foodItemEntries.length > 0) {
    foodItemsRepository.appendMany(foodItemEntries);
  }

  return buildFoodSuccessMessage(parsedFoodInput, parseStatus);
}
