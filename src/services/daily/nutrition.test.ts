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

vi.mock('../../tables', () => ({
  foodLogTable: {
    listByDate: vi.fn(),
  },
}));

let buildNutritionSummaryFromRecords: typeof import('./nutrition').buildNutritionSummaryFromRecords;
let buildTodayNutritionReply: typeof import('./nutrition').buildTodayNutritionReply;

beforeAll(async () => {
  const nutritionSummary = await import('./nutrition');
  buildNutritionSummaryFromRecords =
    nutritionSummary.buildNutritionSummaryFromRecords;
  buildTodayNutritionReply = nutritionSummary.buildTodayNutritionReply;
});

describe('nutrition summary', () => {
  it('builds a deterministic today summary from aggregated meal rows', () => {
    const summary = buildNutritionSummaryFromRecords({
      meals: [
        {
          food_log_id: 'food_1',
          logged_at: '2026-04-01 08:00:00',
          occurred_at: '2026-04-01 07:40:00',
          meal_type: 'breakfast',
          meal_text: '鸡蛋和菠菜',
          calories_kcal: 320,
          protein_g: 5.2,
          fat_g: 0.6,
          carbs_g: 7.2,
          vegetable_g: 200,
          linked_food_ref_ids: 'ref_spinach',
          linked_stock_item_ids: 'stock_egg, stock_spinach',
          note: '',
        },
        {
          food_log_id: 'food_2',
          logged_at: '2026-04-01 12:00:00',
          occurred_at: '2026-04-01 11:50:00',
          meal_type: 'lunch',
          meal_text: '鸡胸肉和西兰花',
          calories_kcal: 520,
          protein_g: 51.5,
          fat_g: 6.1,
          carbs_g: 11.9,
          vegetable_g: 180,
          linked_food_ref_ids: 'ref_chicken, ref_broccoli',
          linked_stock_item_ids: 'stock_chicken, stock_broccoli',
          note: '',
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
  });
});
