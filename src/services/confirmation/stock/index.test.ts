import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TelegramInlineKeyboardButton,
  TelegramReplyMarkup,
} from '../../../types';

const mocks = vi.hoisted(() => ({
  adjustStock: vi.fn(),
  findFoodLogRow: vi.fn(),
  updateFoodLogAtRow: vi.fn(),
  editText: vi.fn(),
  sendText: vi.fn(),
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
  sendText: mocks.sendText,
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
  handleStockDeductionConfirmationReply,
} from './index';

function getInlineKeyboard(
  replyMarkup: TelegramReplyMarkup | undefined,
): TelegramInlineKeyboardButton[][] | undefined {
  if (!replyMarkup || !('inlineKeyboard' in replyMarkup)) {
    return undefined;
  }

  return replyMarkup.inlineKeyboard;
}

function getEditTextReplyMarkup(
  callIndex: number,
): TelegramReplyMarkup | undefined {
  const options = mocks.editText.mock.calls[callIndex]?.[3] as
    | { replyMarkup?: TelegramReplyMarkup }
    | undefined;

  return options?.replyMarkup;
}

describe('stock-deduction-confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheGet.mockReturnValue(null);
    mocks.sendText.mockReturnValue(654);
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
    expect(result.reply).toContain('餐食已记录，库存扣减待你确认');
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

  it('opens a force-reply prompt for a selected stock deduction candidate', () => {
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
      'cb_2',
      'stock:item:0:stockconfirm',
      321,
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith(
      'cb_2',
      '请输入新的扣减数量',
    );
    expect(mocks.sendText).toHaveBeenCalledWith(
      'test-chat-id',
      '请输入 牛奶 新的扣减数量（单位：l），例如 0.3；输入 0 可取消这一项。',
      {
        replyMarkup: {
          forceReply: true,
          inputFieldPlaceholder:
            '请输入新的扣减数量（l），例如 0.3；输入 0 可取消这一项',
        },
      },
    );
    expect(mocks.cachePut).toHaveBeenCalledWith(
      'confirmation:stockconfirm',
      expect.stringContaining('"awaitingCandidateIndex":0'),
      21600,
    );
    expect(mocks.cachePut).toHaveBeenCalledWith(
      'confirmation_prompt:test-chat-id:654',
      'stockconfirm',
      21600,
    );
    expect(result?.resultCode).toBe('food-stock-awaiting-input');
  });

  it('updates the target stock deduction quantity from a force-reply input', () => {
    mocks.cacheGet.mockImplementation((key: string) => {
      if (key === 'confirmation_prompt:test-chat-id:654') {
        return 'stockconfirm';
      }

      if (key === 'confirmation:stockconfirm') {
        return JSON.stringify({
          id: 'stockconfirm',
          kind: 'stock_deduction',
          chatId: 'test-chat-id',
          traceId: 'ai_1',
          createdAtIso: '2026-04-08T10:00:00.000Z',
          previewMessageId: 321,
          payload: {
            foodLogId: 'food_1',
            mealText: '牛奶',
            editPromptMessageId: 654,
            awaitingCandidateIndex: 0,
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
        });
      }

      return null;
    });

    const result = handleStockDeductionConfirmationReply(
      'test-chat-id',
      654,
      '0.4',
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.cacheRemove).toHaveBeenCalledWith(
      'confirmation_prompt:test-chat-id:654',
    );
    expect(mocks.cachePut).toHaveBeenCalledWith(
      'confirmation:stockconfirm',
      expect.stringContaining('"stockQuantity":0.4'),
      21600,
    );
    expect(mocks.editText).toHaveBeenCalledWith(
      'test-chat-id',
      321,
      expect.stringContaining('牛奶 扣减 0.4l'),
      expect.anything(),
    );
    expect(getInlineKeyboard(getEditTextReplyMarkup(0))).toBeDefined();
    expect(mocks.sendText).toHaveBeenCalledWith(
      'test-chat-id',
      '已更新扣减数量，请确认或继续修正。',
    );
    expect(result?.resultCode).toBe('food-stock-edited');
  });

  it('re-prompts when the edited stock deduction quantity is invalid', () => {
    mocks.cacheGet.mockImplementation((key: string) => {
      if (key === 'confirmation_prompt:test-chat-id:654') {
        return 'stockconfirm';
      }

      if (key === 'confirmation:stockconfirm') {
        return JSON.stringify({
          id: 'stockconfirm',
          kind: 'stock_deduction',
          chatId: 'test-chat-id',
          traceId: 'ai_1',
          createdAtIso: '2026-04-08T10:00:00.000Z',
          previewMessageId: 321,
          payload: {
            foodLogId: 'food_1',
            mealText: '牛奶',
            editPromptMessageId: 654,
            awaitingCandidateIndex: 0,
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
        });
      }

      return null;
    });
    mocks.sendText.mockReturnValueOnce(777);

    const result = handleStockDeductionConfirmationReply(
      'test-chat-id',
      654,
      'abc',
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.sendText).toHaveBeenCalledWith(
      'test-chat-id',
      '数量格式不对，请输入数字。单位是 l，例如 0.3；输入 0 可取消这一项。',
      {
        replyMarkup: {
          forceReply: true,
          inputFieldPlaceholder:
            '请输入新的扣减数量（l），例如 0.3；输入 0 可取消这一项',
        },
      },
    );
    expect(mocks.cachePut).toHaveBeenCalledWith(
      'confirmation_prompt:test-chat-id:777',
      'stockconfirm',
      21600,
    );
    expect(result?.resultCode).toBe('food-stock-invalid-input');
  });

  it('updates only the selected candidate when multiple stock deductions are pending', () => {
    mocks.cacheGet.mockImplementation((key: string) => {
      if (key === 'confirmation_prompt:test-chat-id:654') {
        return 'stockconfirm';
      }

      if (key === 'confirmation:stockconfirm') {
        return JSON.stringify({
          id: 'stockconfirm',
          kind: 'stock_deduction',
          chatId: 'test-chat-id',
          traceId: 'ai_1',
          createdAtIso: '2026-04-08T10:00:00.000Z',
          previewMessageId: 321,
          payload: {
            foodLogId: 'food_1',
            mealText: '牛奶和麦片',
            editPromptMessageId: 654,
            awaitingCandidateIndex: 1,
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
              {
                itemName: '麦片',
                itemQuantity: 80,
                itemUnit: 'g',
                stockItemId: 'stock_oats',
                stockItemName: '麦片',
                stockQuantity: 80,
                stockUnit: 'g',
                reason: 'matched stock item but requires manual confirmation',
              },
            ],
          },
        });
      }

      return null;
    });

    const result = handleStockDeductionConfirmationReply(
      'test-chat-id',
      654,
      '60',
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.cachePut).toHaveBeenCalledWith(
      'confirmation:stockconfirm',
      expect.stringContaining('"stockItemName":"牛奶","stockQuantity":0.3'),
      21600,
    );
    expect(mocks.cachePut).toHaveBeenCalledWith(
      'confirmation:stockconfirm',
      expect.stringContaining('"stockItemName":"麦片","stockQuantity":60'),
      21600,
    );
    expect(mocks.editText).toHaveBeenCalledTimes(1);
    expect(mocks.editText).toHaveBeenCalledWith(
      'test-chat-id',
      321,
      expect.stringContaining('1. 牛奶 扣减 0.3l'),
      expect.anything(),
    );
    expect(mocks.editText).toHaveBeenCalledWith(
      'test-chat-id',
      321,
      expect.stringContaining('2. 麦片 扣减 60g'),
      expect.anything(),
    );
    expect(getInlineKeyboard(getEditTextReplyMarkup(0))).toBeDefined();
    expect(result?.resultCode).toBe('food-stock-edited');
  });
});
