import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adjustStock: vi.fn(),
  findFoodLogRow: vi.fn(),
  updateFoodLogAtRow: vi.fn(),
  editText: vi.fn(),
  answerCallbackQuery: vi.fn(),
  cacheGet: vi.fn(),
  cachePut: vi.fn(),
  cacheRemove: vi.fn(),
  getUuid: vi.fn(() => 'stockconfirm123'),
}));

vi.mock('../../../tables', () => ({
  stockTable: {
    adjustStock: mocks.adjustStock,
  },
  foodLogTable: {
    findEntryRow: mocks.findFoodLogRow,
    updateAtRow: mocks.updateFoodLogAtRow,
  },
}));

vi.mock('../../telegram', () => ({
  editText: mocks.editText,
  answerCallbackQuery: mocks.answerCallbackQuery,
}));

Object.assign(globalThis, {
  CacheService: {
    getScriptCache: () => ({
      get: mocks.cacheGet,
      put: mocks.cachePut,
      remove: mocks.cacheRemove,
    }),
  },
  Utilities: {
    getUuid: mocks.getUuid,
  },
});

import {
  createStockDeductionConfirmation,
  handleStockDeductionConfirmationCallback,
} from './index';

describe('stock-deduction-confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheGet.mockReturnValue(null);
    mocks.findFoodLogRow.mockReturnValue({
      rowNumber: 8,
      entry: {
        food_log_id: 'food_1',
        linked_stock_item_ids: 'stock_auto',
        note: '库存扣减待确认：牛奶 -0.3l',
      },
    });
    mocks.adjustStock.mockReturnValue({
      ok: true,
      entry: {
        stock_item_id: 'stock_milk',
      },
      quantity: 1.7,
      operation: 'adjust',
    });
  });

  it('creates a pending stock deduction confirmation with buttons', () => {
    const result = createStockDeductionConfirmation(
      'test-chat-id',
      'ai_1',
      {
        foodLogId: 'food_1',
        mealText: '牛奶',
        candidates: [
          {
            itemName: '牛奶',
            itemQuantity: 250,
            itemUnit: 'ml',
            stockItemId: 'stock_milk',
            stockItemName: '牛奶',
            stockQuantity: 0.3,
            stockUnit: 'l',
            reason: 'converted 250 ml to 0.3 l; requires confirmation',
          },
        ],
      },
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.cachePut).toHaveBeenCalledWith(
      'confirmation:stockconfirm',
      expect.stringContaining('food_1'),
      21600,
    );
    expect(result.confirmationState).toBe('pending');
    expect(result.telegramResponse?.replyMarkup).toMatchObject({
      inlineKeyboard: [
        [
          { text: '确认扣减', callbackData: 'stock:confirm:stockconfirm' },
          { text: '取消', callbackData: 'stock:cancel:stockconfirm' },
          { text: '修正', callbackData: 'stock:edit:stockconfirm' },
        ],
      ],
    });
  });

  it('confirms a pending stock deduction and updates FOOD_LOG', () => {
    mocks.cacheGet.mockReturnValueOnce(
      JSON.stringify({
        id: 'stockconfirm',
        kind: 'stock_deduction',
        chatId: 'test-chat-id',
        traceId: 'ai_1',
        createdAtIso: '2026-04-08T10:00:00.000Z',
        previewMessageId: 321,
        payload: {
          foodLogId: 'food_1',
          mealText: '牛奶',
          candidates: [
            {
              itemName: '牛奶',
              itemQuantity: 250,
              itemUnit: 'ml',
              stockItemId: 'stock_milk',
              stockItemName: '牛奶',
              stockQuantity: 0.3,
              stockUnit: 'l',
              reason: 'converted 250 ml to 0.3 l; requires confirmation',
            },
          ],
        },
      }),
    );

    const result = handleStockDeductionConfirmationCallback(
      'test-chat-id',
      'cb_1',
      'stock:confirm:stockconfirm',
      321,
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.adjustStock).toHaveBeenCalledWith(
      new Date('2026-04-08T10:00:00Z'),
      '牛奶',
      -0.3,
      'l',
      undefined,
      undefined,
    );
    expect(mocks.updateFoodLogAtRow).toHaveBeenCalledWith(
      8,
      expect.any(Object),
    );
    const updateFoodLogCall = mocks.updateFoodLogAtRow.mock.calls[0];
    const updatePayload = updateFoodLogCall?.[1] as
      | Record<string, unknown>
      | undefined;

    expect(updatePayload?.linked_stock_item_ids).toBe('stock_auto, stock_milk');
    expect(updatePayload?.note).toEqual(
      expect.stringContaining('库存扣减已确认'),
    );
    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith(
      'cb_1',
      '已确认扣减',
    );
    expect(result?.resultCode).toBe('food-stock-confirmed');
  });
});
