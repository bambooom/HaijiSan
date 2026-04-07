import { SLASH_COMMANDS } from '../constants/commands';
import {
  persistMealRecord,
  enrichParsedIngredientsWithFallback,
} from '../services/meal-recording';
import { parseFoodContent } from '../services/food-analysis';
import type { ParsedFoodInput } from '../types/food-analysis';

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
  const enrichedItems = enrichParsedIngredientsWithFallback({
    mealType: parsedFoodInput.mealType,
    mealText: parsedFoodInput.mealText,
    shouldPersist: true,
    estimatedCalories: null,
    items: parsedFoodInput.items.map((item) => ({
      itemName: item.itemName,
      quantity: item.quantity,
      unit: item.unit,
      estimatedCalories: item.estimatedCalories,
      source: item.matchedReference ? 'reference' : 'ai',
      linkedFoodRefId: item.linkedFoodRefId,
      note: '',
    })),
    note: '',
  });

  persistMealRecord({
    timestamp,
    mealType: parsedFoodInput.mealType,
    mealText: parsedFoodInput.mealText,
    note: fullyParsed ? '' : 'Best-effort parsing; raw meal text preserved',
    items: enrichedItems,
  });

  return buildFoodSuccessMessage(parsedFoodInput, fullyParsed);
}

function buildFoodSuccessMessage(
  parsedFoodInput: ParsedFoodInput,
  fullyParsed: boolean,
): string {
  if (fullyParsed) {
    return `✅ 饮食已记录，共识别 ${parsedFoodInput.items.length} 个食材项目。`;
  }

  return '✅ 饮食已记录。我先帮你保存原始内容，后续再补充拆解。';
}
