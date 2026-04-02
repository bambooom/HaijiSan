import { beforeAll, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

vi.mock('../repositories', () => ({
  bodyLogRepository: {
    getLatestWeight: vi.fn(),
  },
  foodItemsRepository: {
    listByFoodLogIds: vi.fn(),
  },
  foodLogRepository: {
    listByDate: vi.fn(),
  },
  refCaloriesRepository: {
    findByIds: vi.fn(),
  },
}));

let buildNutritionSummaryFromRecords: typeof import('./nutrition-summary').buildNutritionSummaryFromRecords;
let buildTodayNutritionReply: typeof import('./nutrition-summary').buildTodayNutritionReply;

beforeAll(async () => {
  const nutritionSummary = await import('./nutrition-summary');
  buildNutritionSummaryFromRecords =
    nutritionSummary.buildNutritionSummaryFromRecords;
  buildTodayNutritionReply = nutritionSummary.buildTodayNutritionReply;
});

describe('nutrition summary', () => {
  it('builds a deterministic today summary from meals, items, and references', () => {
    const summary = buildNutritionSummaryFromRecords({
      meals: [
        {
          food_log_id: 'food_1',
          logged_at: '2026-04-01 08:00:00',
          meal_type: 'breakfast',
          meal_text: '鸡蛋和菠菜',
          estimated_calories: 320,
          parse_status: 'parsed',
          note: '',
        },
        {
          food_log_id: 'food_2',
          logged_at: '2026-04-01 12:00:00',
          meal_type: 'lunch',
          meal_text: '鸡胸肉和西兰花',
          estimated_calories: 520,
          parse_status: 'parsed',
          note: '',
        },
      ],
      items: [
        {
          parent_food_log_id: 'food_1',
          item_name: '鸡蛋',
          quantity: 2,
          unit: '个',
          estimated_calories: 140,
          linked_food_ref_id: '',
          linked_stock_item_id: '',
          ai_confidence: null,
          note: '',
        },
        {
          parent_food_log_id: 'food_1',
          item_name: '菠菜',
          quantity: 200,
          unit: 'g',
          estimated_calories: 50,
          linked_food_ref_id: 'ref_spinach',
          linked_stock_item_id: '',
          ai_confidence: null,
          note: '',
        },
        {
          parent_food_log_id: 'food_2',
          item_name: '鸡胸肉',
          quantity: 150,
          unit: 'g',
          estimated_calories: 250,
          linked_food_ref_id: 'ref_chicken',
          linked_stock_item_id: '',
          ai_confidence: null,
          note: '',
        },
        {
          parent_food_log_id: 'food_2',
          item_name: '西兰花',
          quantity: 180,
          unit: 'g',
          estimated_calories: 60,
          linked_food_ref_id: 'ref_broccoli',
          linked_stock_item_id: '',
          ai_confidence: null,
          note: '',
        },
      ],
      references: [
        {
          id: 'ref_spinach',
          name: '菠菜',
          brand: '',
          servingSize: 100,
          unit: 'g',
          calories: 25,
          protein: 2.6,
          fat: 0.3,
          carbs: 3.6,
        },
        {
          id: 'ref_chicken',
          name: '鸡胸肉',
          brand: '',
          servingSize: 100,
          unit: 'g',
          calories: 167,
          protein: 31,
          fat: 3.6,
          carbs: 0,
        },
        {
          id: 'ref_broccoli',
          name: '西兰花',
          brand: '',
          servingSize: 100,
          unit: 'g',
          calories: 34,
          protein: 2.8,
          fat: 0.4,
          carbs: 6.6,
        },
      ],
      latestWeightKg: 55,
    });

    expect(summary.totalCalories).toBe(840);
    expect(summary.totalProtein).toBe(56.7);
    expect(summary.totalFat).toBe(6.7);
    expect(summary.totalCarbs).toBe(19.1);
    expect(summary.proteinStatus).toBe('low');
    expect(summary.vegetableStatus).toBe('enough');
    expect(summary.carbsStatus).toBe('moderate');
    expect(summary.carbCalorieShare).toBe(0.1);
    expect(summary.proteinTarget).toBe(66);
    expect(summary.totalVegetableGrams).toBe(380);
    expect(summary.proteinUnresolvedItems).toEqual(['鸡蛋']);
    expect(summary.mealSummaries).toHaveLength(2);
    expect(summary.mealSummaries[0]).toMatchObject({
      totalCalories: 320,
      totalProtein: 5.2,
      totalFat: 0.6,
      totalCarbs: 7.2,
      totalVegetableGrams: 200,
    });
    expect(summary.mealSummaries[1]).toMatchObject({
      totalCalories: 520,
      totalProtein: 51.5,
      totalFat: 6.1,
      totalCarbs: 11.9,
      totalVegetableGrams: 180,
    });

    const reply = buildTodayNutritionReply(summary);
    expect(reply).toContain('今天共记录 2 餐，热量约 840 kcal。');
    expect(reply).toContain(
      '蛋白：已识别约 56.7 g。按最近体重 55 kg，今天先按 66 g 看，还差约 9.3 g。',
    );
    expect(reply).toContain('宏量：脂肪约 6.7 g；碳水约 19.1 g。');
    expect(reply).toContain('蔬菜：已识别约 380 g，达到今天的基础目标。');
    expect(reply).toContain(
      '早餐 鸡蛋和菠菜：320 kcal；蛋白 5.2 g；脂肪 0.6 g；碳水 7.2 g；蔬菜 200 g。',
    );
    expect(reply).toContain(
      '午餐 鸡胸肉和西兰花：520 kcal；蛋白 51.5 g；脂肪 6.1 g；碳水 11.9 g；蔬菜 180 g。',
    );
    expect(reply).toContain('蛋白未纳入：鸡蛋。');
    expect(reply).toContain('脂肪未纳入：鸡蛋。');
    expect(reply).toContain('碳水未纳入：鸡蛋。');
  });
});
