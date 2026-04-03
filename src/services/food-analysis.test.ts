import { beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

const mocks = vi.hoisted(() => ({
  searchByKeyword: vi.fn(),
  listAll: vi.fn(),
}));

vi.mock('../repositories/ref-calories', () => ({
  refCaloriesRepository: {
    searchByKeyword: mocks.searchByKeyword,
    listAll: mocks.listAll,
  },
}));

import { estimateMealCalories } from './food-analysis';

describe('food analysis reference matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const zucchini = {
      id: 'ref_zucchini',
      name: '西葫芦',
      brand: '',
      servingSize: 100,
      unit: 'g',
      calories: 17,
      protein: null,
      fat: null,
      carbs: null,
    };
    const chicken = {
      id: 'ref_chicken',
      name: '鸡小胸',
      brand: '',
      servingSize: 100,
      unit: 'g',
      calories: 110.5,
      protein: null,
      fat: null,
      carbs: null,
    };
    const fishSkin = {
      id: 'ref_fish_skin',
      name: '凉拌鲜脆鱼皮',
      brand: '盒马工坊',
      servingSize: 100,
      unit: 'g',
      calories: 48.8,
      protein: null,
      fat: null,
      carbs: null,
    };

    mocks.searchByKeyword.mockImplementation((keyword: string) => {
      const normalized = keyword.trim();

      if (normalized === '西葫芦') {
        return [zucchini];
      }

      if (normalized === '鸡小胸') {
        return [chicken];
      }

      if (normalized === '凉拌鲜脆鱼皮') {
        return [fishSkin];
      }

      return [];
    });
    mocks.listAll.mockReturnValue([zucchini, chicken, fishSkin]);
  });

  it('matches references for suffix quantity and parenthesized gram patterns', () => {
    const result = estimateMealCalories(
      '中饭吃的 西葫芦一根（314g）+鸡小胸x105g+凉拌鲜脆鱼皮 200g',
    );

    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(3);
    expect(result?.items.map((item) => item.itemName)).toEqual([
      '西葫芦',
      '鸡小胸',
      '凉拌鲜脆鱼皮',
    ]);
    expect(result?.items.map((item) => item.linkedFoodRefId)).toEqual([
      'ref_zucchini',
      'ref_chicken',
      'ref_fish_skin',
    ]);
    expect(result?.items[0]?.estimatedCalories).toBe(53.4);
    expect(result?.items[1]?.estimatedCalories).toBe(116);
    expect(result?.items[2]?.estimatedCalories).toBe(97.6);
  });

  it('matches references when item name and weight are written without separators', () => {
    const result = estimateMealCalories(
      '中饭吃的 西葫芦一根（314g）+鸡小胸105g+凉拌鲜脆鱼皮200g',
    );

    expect(result).not.toBeNull();
    expect(result?.items.map((item) => item.itemName)).toEqual([
      '西葫芦',
      '鸡小胸',
      '凉拌鲜脆鱼皮',
    ]);
    expect(result?.items.map((item) => item.linkedFoodRefId)).toEqual([
      'ref_zucchini',
      'ref_chicken',
      'ref_fish_skin',
    ]);
    expect(result?.items[2]?.estimatedCalories).toBe(97.6);
  });
});
