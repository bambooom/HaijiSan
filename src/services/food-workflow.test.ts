import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByFoodName: vi.fn(),
  executeInsertData: vi.fn(),
}));

vi.mock('../tables', () => ({
  refCaloriesTable: {
    findByFoodName: mocks.findByFoodName,
  },
}));

vi.mock('../tools', () => ({
  executeInsertData: mocks.executeInsertData,
}));

import {
  buildMealStructure,
  enrichFoodInsertRecord,
  executeFoodInsertWorkflow,
  resolveMealFromReferences,
} from './food-workflow';

describe('food-workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByFoodName.mockReturnValue(null);
  });

  it('builds a multi-item meal draft from meal_text separators', () => {
    const result = buildMealStructure({
      meal_type: 'dinner',
      meal_text: ' 鸡蛋 和 菠菜，牛奶 ',
    });

    expect(result).toEqual({
      mealType: 'dinner',
      mealText: '鸡蛋 和 菠菜，牛奶',
      shouldPersist: true,
      items: [
        {
          itemName: '鸡蛋',
          quantity: 1,
          unit: 'serving',
        },
        {
          itemName: '菠菜',
          quantity: 1,
          unit: 'serving',
        },
        {
          itemName: '牛奶',
          quantity: 1,
          unit: 'serving',
        },
      ],
      note: 'food-workflow: multi-item draft from meal_text',
    });
  });

  it('resolves and aggregates local REF_CALORIES matches per item', () => {
    mocks.findByFoodName.mockImplementation((itemName: string) => {
      if (itemName === '鸡蛋') {
        return {
          food_ref_id: 'ref_egg',
          food_name: '鸡蛋',
          brand: '',
          serving_size: 1,
          serving_unit: 'piece',
          calories_kcal: 78,
          protein_g: 6.3,
          fat_g: 5.3,
          carbs_g: 0.6,
          source: 'manual_entry',
          updated_at: '2026-04-08 10:00:00',
          note: '',
        };
      }

      if (itemName === '菠菜') {
        return {
          food_ref_id: 'ref_spinach',
          food_name: '菠菜',
          brand: '',
          serving_size: 100,
          serving_unit: 'g',
          calories_kcal: 23,
          protein_g: 2.9,
          fat_g: 0.4,
          carbs_g: 3.6,
          source: 'manual_entry',
          updated_at: '2026-04-08 10:00:00',
          note: '',
        };
      }

      return null;
    });

    const result = resolveMealFromReferences(
      buildMealStructure({
        meal_type: 'breakfast',
        meal_text: '鸡蛋和菠菜',
      }),
    );

    expect(result.estimatedCalories).toBe(101);
    expect(result.proteinG).toBe(9.2);
    expect(result.fatG).toBe(5.7);
    expect(result.carbsG).toBe(4.2);
    expect(result.linkedFoodRefIds).toEqual(['ref_egg', 'ref_spinach']);
    expect(result.items[0]).toMatchObject({
      source: 'reference',
      linkedFoodRefId: 'ref_egg',
    });
    expect(result.items[1]).toMatchObject({
      source: 'reference',
      linkedFoodRefId: 'ref_spinach',
    });
    expect(result.note).toBe(
      'food-workflow: enriched all items from local REF_CALORIES',
    );
  });

  it('keeps unmatched items while aggregating matched nutrition fields', () => {
    mocks.findByFoodName.mockImplementation((itemName: string) => {
      if (itemName === '鸡蛋') {
        return {
          food_ref_id: 'ref_egg',
          food_name: '鸡蛋',
          brand: '',
          serving_size: 1,
          serving_unit: 'piece',
          calories_kcal: 78,
          protein_g: 6.3,
          fat_g: 5.3,
          carbs_g: 0.6,
          source: 'manual_entry',
          updated_at: '2026-04-08 10:00:00',
          note: '',
        };
      }

      return null;
    });

    const result = resolveMealFromReferences(
      buildMealStructure({
        meal_type: 'breakfast',
        meal_text: '鸡蛋和未知配菜',
      }),
    );

    expect(result.estimatedCalories).toBe(78);
    expect(result.proteinG).toBe(6.3);
    expect(result.linkedFoodRefIds).toEqual(['ref_egg']);
    expect(result.items[0]).toMatchObject({ source: 'reference' });
    expect(result.items[1]).toMatchObject({
      source: 'ai',
      estimatedCalories: null,
    });
    expect(result.note).toBe(
      'food-workflow: partially enriched from local REF_CALORIES',
    );
  });

  it('fills missing nutrition fields from a local reference match without overwriting explicit values', () => {
    mocks.findByFoodName.mockReturnValue({
      food_ref_id: 'ref_yogurt',
      food_name: '原味酸奶',
      brand: '',
      serving_size: 1,
      serving_unit: 'cup',
      calories_kcal: 96,
      protein_g: 8,
      fat_g: 2.5,
      carbs_g: 11,
      source: 'manual_entry',
      updated_at: '2026-04-08 10:00:00',
      note: '',
    });

    const result = enrichFoodInsertRecord({
      occurred_at: '2026-04-08 12:30:00',
      meal_type: 'breakfast',
      meal_text: '原味酸奶',
      calories_kcal: 110,
    });

    expect(result).toMatchObject({
      meal_text: '原味酸奶',
      calories_kcal: 110,
      protein_g: 8,
      fat_g: 2.5,
      carbs_g: 11,
      linked_food_ref_ids: 'ref_yogurt',
    });
  });

  it('executes the FOOD_LOG insert with the enriched record', () => {
    mocks.findByFoodName.mockReturnValue({
      food_ref_id: 'ref_yogurt',
      food_name: '原味酸奶',
      brand: '',
      serving_size: 1,
      serving_unit: 'cup',
      calories_kcal: 96,
      protein_g: 8,
      fat_g: 2.5,
      carbs_g: 11,
      source: 'manual_entry',
      updated_at: '2026-04-08 10:00:00',
      note: '',
    });
    mocks.executeInsertData.mockReturnValue({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: {
        food_log_id: 'food_1',
      },
    });

    const timestamp = new Date('2026-04-08T10:00:00Z');
    const result = executeFoodInsertWorkflow(
      {
        tool: 'insertData',
        sheet: 'FOOD_LOG',
        record: {
          occurred_at: '2026-04-08 12:30:00',
          meal_type: 'breakfast',
          meal_text: '原味酸奶',
        },
      },
      timestamp,
    );

    expect(mocks.executeInsertData).toHaveBeenCalledWith(
      {
        tool: 'insertData',
        sheet: 'FOOD_LOG',
        record: {
          occurred_at: '2026-04-08 12:30:00',
          meal_type: 'breakfast',
          meal_text: '原味酸奶',
          calories_kcal: 96,
          protein_g: 8,
          fat_g: 2.5,
          carbs_g: 11,
          linked_food_ref_ids: 'ref_yogurt',
        },
      },
      timestamp,
    );
    expect(result).toEqual({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: {
        food_log_id: 'food_1',
      },
    });
  });
});
