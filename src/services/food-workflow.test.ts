import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByFoodName: vi.fn(),
  findStockByName: vi.fn(),
  adjustStock: vi.fn(),
  executeInsertData: vi.fn(),
  estimateIngredientCalories: vi.fn(),
}));

vi.mock('../tables', () => ({
  refCaloriesTable: {
    findByFoodName: mocks.findByFoodName,
  },
  stockTable: {
    findByName: mocks.findStockByName,
    adjustStock: mocks.adjustStock,
  },
}));

vi.mock('../tools', () => ({
  executeInsertData: mocks.executeInsertData,
}));

vi.mock('./food-estimation', () => ({
  estimateIngredientCalories: mocks.estimateIngredientCalories,
}));

import {
  buildMealStructure,
  enrichFoodInsertRecord,
  executeFoodInsertWorkflow,
  resolveMealFromReferences,
} from './food-workflow';
import type { InsertDataRequest } from '../tools/types';

describe('food-workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByFoodName.mockReturnValue(null);
    mocks.findStockByName.mockReturnValue(null);
    mocks.adjustStock.mockImplementation(
      (_timestamp: Date, _name: string, delta: number) => ({
        ok: true,
        entry: {
          stock_item_id: 'stock_1',
          item_name: 'default',
          quantity: Math.max(0, 5 + delta),
          unit: '个/份',
          purchased_at: '2026-04-08 08:00:00',
          updated_at: '2026-04-08 10:00:00',
          purchase_channel: '',
          linked_food_ref_id: '',
          note: 'keep me',
        },
        quantity: Math.max(0, 5 + delta),
        operation: 'adjust',
      }),
    );
    mocks.estimateIngredientCalories.mockReturnValue([]);
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
    mocks.findStockByName.mockReturnValue({
      stock_item_id: 'stock_yogurt',
      item_name: '原味酸奶',
      quantity: 3,
      unit: '个/份',
      purchased_at: '2026-04-08 08:00:00',
      updated_at: '2026-04-08 08:00:00',
      purchase_channel: '',
      linked_food_ref_id: 'ref_yogurt',
      note: 'keep me',
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
          linked_stock_item_ids: 'stock_yogurt',
        },
      },
      timestamp,
    );
    expect(mocks.adjustStock).toHaveBeenCalledWith(
      timestamp,
      '原味酸奶',
      -1,
      '个/份',
      undefined,
      undefined,
    );
    expect(result).toEqual({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: {
        food_log_id: 'food_1',
      },
    });
  });

  it('uses AI fallback estimates for unresolved items during insert execution', () => {
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
    mocks.estimateIngredientCalories.mockReturnValue([
      {
        itemName: '未知配菜',
        quantity: 1,
        unit: 'serving',
        estimatedCalories: 35,
        confidence: 'low',
        note: 'Assumed one small side serving.',
      },
    ]);
    mocks.executeInsertData.mockReturnValue({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: {
        food_log_id: 'food_2',
      },
    });

    executeFoodInsertWorkflow(
      {
        tool: 'insertData',
        sheet: 'FOOD_LOG',
        record: {
          occurred_at: '2026-04-08 12:30:00',
          meal_type: 'lunch',
          meal_text: '鸡蛋和未知配菜',
        },
      },
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.estimateIngredientCalories).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          itemName: '未知配菜',
          quantity: 1,
          unit: 'serving',
        }),
      ],
      new Date('2026-04-08T10:00:00Z'),
    );
    const insertCall = mocks.executeInsertData.mock.calls[0];
    const insertRequest = insertCall?.[0] as InsertDataRequest | undefined;

    expect(insertCall?.[1]).toEqual(new Date('2026-04-08T10:00:00Z'));
    expect(insertRequest?.record).toMatchObject({
      meal_text: '鸡蛋和未知配菜',
      calories_kcal: 113,
      protein_g: 6.3,
      fat_g: 5.3,
      carbs_g: 0.6,
      linked_food_ref_ids: 'ref_egg',
    });
  });

  it('links and deducts stock only for safe exact stock matches', () => {
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
    mocks.findStockByName.mockImplementation((itemName: string) => {
      if (itemName === '鸡蛋') {
        return {
          stock_item_id: 'stock_egg',
          item_name: '鸡蛋',
          quantity: 6,
          unit: '个/份',
          purchased_at: '2026-04-08 08:00:00',
          updated_at: '2026-04-08 08:00:00',
          purchase_channel: '',
          linked_food_ref_id: 'ref_egg',
          note: 'keep me',
        };
      }

      if (itemName === '菠菜') {
        return {
          stock_item_id: 'stock_spinach',
          item_name: '菠菜',
          quantity: 2,
          unit: 'g',
          purchased_at: '2026-04-08 08:00:00',
          updated_at: '2026-04-08 08:00:00',
          purchase_channel: '',
          linked_food_ref_id: 'ref_spinach',
          note: 'keep me',
        };
      }

      return null;
    });
    mocks.executeInsertData.mockReturnValue({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: {
        food_log_id: 'food_4',
      },
    });

    executeFoodInsertWorkflow(
      {
        tool: 'insertData',
        sheet: 'FOOD_LOG',
        record: {
          occurred_at: '2026-04-08 12:30:00',
          meal_type: 'lunch',
          meal_text: '鸡蛋和菠菜',
        },
      },
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.adjustStock).toHaveBeenCalledTimes(1);
    expect(mocks.adjustStock).toHaveBeenCalledWith(
      new Date('2026-04-08T10:00:00Z'),
      '鸡蛋',
      -1,
      '个/份',
      undefined,
      undefined,
    );
    const insertCall = mocks.executeInsertData.mock.calls[0];
    const insertRequest = insertCall?.[0] as InsertDataRequest | undefined;

    expect(insertRequest?.record.linked_stock_item_ids).toBe('stock_egg');
  });

  it('falls back to local-only enrichment when AI estimation fails', () => {
    mocks.findByFoodName.mockReturnValue(null);
    mocks.estimateIngredientCalories.mockImplementation(() => {
      throw new Error('Gemini unavailable');
    });
    mocks.executeInsertData.mockReturnValue({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: {
        food_log_id: 'food_3',
      },
    });

    executeFoodInsertWorkflow(
      {
        tool: 'insertData',
        sheet: 'FOOD_LOG',
        record: {
          occurred_at: '2026-04-08 12:30:00',
          meal_type: 'lunch',
          meal_text: '未知配菜',
        },
      },
      new Date('2026-04-08T10:00:00Z'),
    );

    const insertCall = mocks.executeInsertData.mock.calls[0];
    const insertRequest = insertCall?.[0] as InsertDataRequest | undefined;

    expect(insertCall?.[1]).toEqual(new Date('2026-04-08T10:00:00Z'));
    expect(insertRequest?.record.meal_text).toBe('未知配菜');
    expect(insertRequest?.record.calories_kcal).toBeUndefined();
  });
});
