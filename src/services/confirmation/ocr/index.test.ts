import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeInsertData: vi.fn(),
  executeUpdateData: vi.fn(),
  sendText: vi.fn(),
  editText: vi.fn(),
  answerCallbackQuery: vi.fn(),
  cacheGet: vi.fn(),
  cachePut: vi.fn(),
  cacheRemove: vi.fn(),
  getUuid: vi.fn(() => 'abc123def456'),
}));

vi.mock('../../../tools', () => ({
  executeInsertData: mocks.executeInsertData,
  executeUpdateData: mocks.executeUpdateData,
}));

vi.mock('../../telegram', () => ({
  sendText: mocks.sendText,
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
  createNutritionLabelConfirmation,
  handleOcrConfirmationCallback,
  handleOcrConfirmationReply,
} from './index';

describe('ocr-confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheGet.mockReturnValue(null);
    mocks.sendText.mockReturnValue(654);
  });

  it('creates a pending nutrition-label confirmation with buttons', () => {
    const result = createNutritionLabelConfirmation(
      'test-chat-id',
      'image_1',
      {
        tool: 'insertData',
        sheet: 'REF_CALORIES',
        record: {
          food_name: 'Greek Yogurt',
          calories_kcal: 210,
          protein_g: 12,
          fat_g: 7,
          carbs_g: 24,
        },
      },
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.cachePut).toHaveBeenCalledWith(
      'confirmation:abc123def456',
      expect.stringContaining('Greek Yogurt'),
      21600,
    );
    expect(result.confirmationState).toBe('pending');
    expect(result.telegramResponse?.replyMarkup).toMatchObject({
      inlineKeyboard: [
        [
          { text: '确认', callbackData: 'ocr:confirm:abc123def456' },
          { text: '取消', callbackData: 'ocr:cancel:abc123def456' },
          { text: '修正', callbackData: 'ocr:edit:abc123def456' },
        ],
      ],
    });
  });

  it('confirms a pending draft and writes it only on callback confirmation', () => {
    mocks.cacheGet.mockReturnValueOnce(
      JSON.stringify({
        id: 'abc123def456',
        kind: 'nutrition_label',
        chatId: 'test-chat-id',
        traceId: 'image_1',
        payload: {
          request: {
            tool: 'insertData',
            sheet: 'REF_CALORIES',
            record: {
              food_name: 'Greek Yogurt',
              calories_kcal: 210,
              protein_g: 12,
              fat_g: 7,
              carbs_g: 24,
            },
          },
          editPromptMessageId: null,
          awaitingField: null,
        },
        createdAtIso: '2026-04-08T10:00:00.000Z',
        previewMessageId: 321,
      }),
    );
    mocks.executeInsertData.mockReturnValue({
      tool: 'insertData',
      sheet: 'REF_CALORIES',
      record: { food_ref_id: 'ref_1', food_name: 'Greek Yogurt' },
    });

    const result = handleOcrConfirmationCallback(
      'test-chat-id',
      'cb_1',
      'ocr:confirm:abc123def456',
      321,
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.executeInsertData).toHaveBeenCalledWith(
      expect.objectContaining({ sheet: 'REF_CALORIES' }),
      new Date('2026-04-08T10:00:00Z'),
    );
    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith('cb_1', '已确认');
    expect(mocks.editText).toHaveBeenCalledWith(
      'test-chat-id',
      321,
      expect.stringContaining('状态：已确认'),
    );
    expect(result?.resultCode).toBe('image-ocr-confirmed');
  });

  it('prompts for a corrected calorie value and updates the pending draft on force reply', () => {
    mocks.cacheGet.mockReturnValueOnce(
      JSON.stringify({
        id: 'abc123def456',
        kind: 'nutrition_label',
        chatId: 'test-chat-id',
        traceId: 'image_1',
        payload: {
          request: {
            tool: 'insertData',
            sheet: 'REF_CALORIES',
            record: {
              food_name: 'Greek Yogurt',
              calories_kcal: 210,
            },
          },
          editPromptMessageId: null,
          awaitingField: null,
        },
        createdAtIso: '2026-04-08T10:00:00.000Z',
        previewMessageId: 321,
      }),
    );

    handleOcrConfirmationCallback(
      'test-chat-id',
      'cb_2',
      'ocr:field:calories_kcal:abc123def456',
      321,
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.sendText).toHaveBeenCalledWith(
      'test-chat-id',
      '请输入正确的热量（kcal）',
      {
        replyMarkup: {
          forceReply: true,
          inputFieldPlaceholder: '请输入正确的热量（kcal）',
        },
      },
    );

    mocks.cacheGet.mockReturnValueOnce('abc123def456').mockReturnValueOnce(
      JSON.stringify({
        id: 'abc123def456',
        kind: 'nutrition_label',
        chatId: 'test-chat-id',
        traceId: 'image_1',
        payload: {
          request: {
            tool: 'insertData',
            sheet: 'REF_CALORIES',
            record: {
              food_name: 'Greek Yogurt',
              calories_kcal: 210,
            },
          },
          editPromptMessageId: 654,
          awaitingField: 'calories_kcal',
        },
        createdAtIso: '2026-04-08T10:00:00.000Z',
        previewMessageId: 321,
      }),
    );

    const replyResult = handleOcrConfirmationReply(
      'test-chat-id',
      654,
      '220',
      new Date('2026-04-08T10:02:00Z'),
    );

    const editCalls = mocks.editText.mock.calls;
    const editCall = editCalls[editCalls.length - 1];
    const editOptions = editCall?.[3] as
      | { replyMarkup?: { inlineKeyboard?: unknown[][] } }
      | undefined;

    expect(editCall?.[0]).toBe('test-chat-id');
    expect(editCall?.[1]).toBe(321);
    expect(editCall?.[2]).toContain('220 kcal');
    expect(editOptions?.replyMarkup?.inlineKeyboard).toBeDefined();
    expect(replyResult?.resultCode).toBe('image-ocr-field-updated');
  });
});
