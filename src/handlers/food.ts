import { SLASH_COMMANDS } from '../constants/commands';
import {
  persistMealRecord,
  buildFoodItemEntriesFromParsed,
} from '../services/meal-recording';
import type { ParseStatus } from '../types';
import { parseFoodContent } from '../services/food-analysis';
import type { ParsedFoodInput } from '../types/food-analysis';

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
  if (!text.startsWith(SLASH_COMMANDS.FOOD)) {
    return null;
  }

  const parsedFoodInput = parseFoodContent(
    text.slice(SLASH_COMMANDS.FOOD.length).trim(),
  );

  if (!parsedFoodInput) {
    return '格式错误。请使用：/food 早餐 280g西兰花+81g鸡小胸、/food 早 280g西兰花+81g鸡小胸，或 /food 晚饭 一碗牛肉粉';
  }

  const fullyParsed =
    parsedFoodInput.items.length > 0 &&
    parsedFoodInput.items.length === parsedFoodInput.segmentCount;
  const parseStatus: ParseStatus = fullyParsed ? 'parsed' : 'pending';
  const foodItemEntries = buildFoodItemEntriesFromParsed(
    '',
    parsedFoodInput.items,
    new Map(),
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

  persistMealRecord({
    timestamp,
    mealType: parsedFoodInput.mealType,
    mealText: parsedFoodInput.mealText,
    estimatedCalories,
    parseStatus,
    note: fullyParsed ? '' : 'Best-effort parsing; raw meal text preserved',
    items: foodItemEntries,
  });

  return buildFoodSuccessMessage(parsedFoodInput, parseStatus);
}
