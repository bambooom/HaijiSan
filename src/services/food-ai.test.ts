import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(globalThis, {
    __APP_CONFIG__: {
      SHEET_ID: 'test-sheet',
      BOT_TOKEN: 'test-bot-token',
      MY_CHAT_ID: 'test-chat-id',
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_MODEL: 'test-gemini-model',
    },
  });
});

import { reconcileResolvedMealWithReferences } from './food-ai';
import type { MealResolutionResult } from '../types';

describe('reconcileResolvedMealWithReferences', () => {
  it('overrides AI-estimated items with local reference facts', () => {
    const resolvedMeal: MealResolutionResult = {
      mealType: 'lunch',
      mealText: '西葫芦一根（314g）+鸡小胸105g+凉拌鲜脆鱼皮200g',
      shouldPersist: true,
      estimatedCalories: 369,
      items: [
        {
          itemName: '西葫芦',
          quantity: 314,
          unit: 'g',
          estimatedCalories: 53.4,
          source: 'reference',
          linkedFoodRefId: 'ref_zucchini',
          note: '按表内参考 西葫芦 换算',
        },
        {
          itemName: '鸡小胸',
          quantity: 105,
          unit: 'g',
          estimatedCalories: 116,
          source: 'reference',
          linkedFoodRefId: 'ref_chicken',
          note: '按表内参考 鸡小胸 换算',
        },
        {
          itemName: '凉拌鲜脆鱼皮',
          quantity: 200,
          unit: 'g',
          estimatedCalories: 200,
          source: 'ai',
          note: '按经验估算',
        },
      ],
      note: '',
    };

    const reconciledMeal = reconcileResolvedMealWithReferences(resolvedMeal, [
      {
        referenceId: 'ref_fish_skin',
        itemName: '凉拌鲜脆鱼皮',
        servingSize: 100,
        unit: 'g',
        calories: 48.8,
        referenceName: '凉拌鲜脆鱼皮',
      },
    ]);

    expect(reconciledMeal.items[2]).toMatchObject({
      estimatedCalories: 97.6,
      source: 'reference',
      linkedFoodRefId: 'ref_fish_skin',
    });
    expect(reconciledMeal.estimatedCalories).toBe(267);
  });
});
