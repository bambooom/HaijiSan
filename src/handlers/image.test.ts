import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TelegramInlineKeyboardButton,
  TelegramReplyMarkup,
} from '../types';

const mocks = vi.hoisted(() => ({
  downloadTelegramFile: vi.fn(),
  extractHealthDataFromImage: vi.fn(),
  executeInsertData: vi.fn(),
  executeUpdateData: vi.fn(),
  executeFoodInsertWorkflow: vi.fn(),
  findReferenceRowByFoodName: vi.fn(),
  createNutritionLabelConfirmation: vi.fn(),
}));

vi.mock('../services/telegram', () => ({
  downloadTelegramFile: mocks.downloadTelegramFile,
}));

vi.mock('../services/image-ocr', () => ({
  extractHealthDataFromImage: mocks.extractHealthDataFromImage,
}));

vi.mock('../tools', () => ({
  executeInsertData: mocks.executeInsertData,
  executeUpdateData: mocks.executeUpdateData,
}));

vi.mock('../services/food-workflow', () => ({
  executeFoodInsertWorkflow: mocks.executeFoodInsertWorkflow,
}));

vi.mock('../services/ocr-confirmation', () => ({
  createNutritionLabelConfirmation: mocks.createNutritionLabelConfirmation,
}));

vi.mock('../tables', () => ({
  refCaloriesTable: {
    findEntryRowByFoodName: mocks.findReferenceRowByFoodName,
  },
}));

import { handleIncomingImage } from './image';
import type { InsertDataRequest } from '../tools/types';

function getInlineKeyboard(
  replyMarkup: TelegramReplyMarkup | undefined,
): TelegramInlineKeyboardButton[][] | undefined {
  if (!replyMarkup || !('inlineKeyboard' in replyMarkup)) {
    return undefined;
  }

  return replyMarkup.inlineKeyboard;
}

describe('handleIncomingImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.downloadTelegramFile.mockReturnValue({
      base64Data: 'encoded-image',
      mimeType: 'image/jpeg',
    });
    mocks.findReferenceRowByFoodName.mockReturnValue(null);
    mocks.createNutritionLabelConfirmation.mockImplementation(
      (
        _chatId: string,
        _traceId: string,
        _request: InsertDataRequest | { updates: Record<string, unknown> },
      ) => ({
        reply: '请确认这条营养参考：',
        handlingMode: 'ai',
        status: 'success',
        note: 'REF_CALORIES; awaiting confirmation',
        traceId: 'image_1',
        intent: 'image-ocr',
        tool: 'insertData',
        confirmationState: 'pending',
        resultCode: 'image-ocr-pending',
      }),
    );
  });

  it('creates a pending confirmation for nutrition label OCR output', () => {
    mocks.extractHealthDataFromImage.mockReturnValue({
      kind: 'nutrition_label',
      appSource: 'camera',
      occurredAt: null,
      recognizedText: 'Greek Yogurt 200g 210 kcal',
      summary: 'Nutrition label for yogurt.',
      foodName: 'Greek Yogurt',
      brand: 'Example Brand',
      servingSize: 200,
      servingUnit: 'g',
      caloriesKcal: 210,
      proteinG: 12,
      fatG: 7,
      carbsG: 24,
      confidence: 0.91,
      note: '',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      avgHr: null,
      maxHr: null,
      minHr: null,
      workoutCaloriesKcal: null,
    });
    const result = handleIncomingImage(
      'file_123',
      '早餐营养标签',
      new Date('2026-04-08T10:00:00Z'),
      'test-chat-id',
    );

    expect(mocks.createNutritionLabelConfirmation).toHaveBeenCalledWith(
      'test-chat-id',
      expect.stringMatching(/^image_/),
      expect.objectContaining({
        tool: 'insertData',
        sheet: 'REF_CALORIES',
      }),
      new Date('2026-04-08T10:00:00Z'),
    );
    const confirmationRequest = mocks.createNutritionLabelConfirmation.mock
      .calls[0]?.[2] as InsertDataRequest | undefined;

    expect(confirmationRequest).toMatchObject({
      tool: 'insertData',
      sheet: 'REF_CALORIES',
    });
    expect(confirmationRequest?.record).toMatchObject({
      food_name: 'Greek Yogurt',
      brand: 'Example Brand',
      serving_size: 200,
      serving_unit: 'g',
      calories_kcal: 210,
      protein_g: 12,
      fat_g: 7,
      carbs_g: 24,
      source: 'nutrition_label',
    });
    expect(mocks.executeInsertData).not.toHaveBeenCalled();
    expect(result.reply).toBe('请确认这条营养参考：');
    expect(result.resultCode).toBe('image-ocr-pending');
  });

  it('creates a pending confirmation for an existing nutrition reference update', () => {
    mocks.findReferenceRowByFoodName.mockReturnValue({
      rowNumber: 5,
      entry: {
        food_ref_id: 'ref_1',
      },
    });
    mocks.extractHealthDataFromImage.mockReturnValue({
      kind: 'nutrition_label',
      appSource: 'camera',
      occurredAt: null,
      recognizedText: 'Greek Yogurt 200g 210 kcal',
      summary: 'Nutrition label for yogurt.',
      foodName: 'Greek Yogurt',
      brand: 'Example Brand',
      servingSize: 200,
      servingUnit: 'g',
      caloriesKcal: 210,
      proteinG: 12,
      fatG: 7,
      carbsG: 24,
      confidence: 0.91,
      note: '',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      avgHr: null,
      maxHr: null,
      minHr: null,
      workoutCaloriesKcal: null,
    });
    const result = handleIncomingImage(
      'file_update',
      '早餐营养标签',
      new Date('2026-04-08T10:00:00Z'),
      'test-chat-id',
    );

    const updateRequest = mocks.createNutritionLabelConfirmation.mock
      .calls[0]?.[2] as
      | { updates: Record<string, unknown>; selector: { rowNumber: number } }
      | undefined;

    expect(updateRequest).toMatchObject({
      selector: { rowNumber: 5 },
    });
    expect(updateRequest?.updates).toMatchObject({
      food_name: 'Greek Yogurt',
      calories_kcal: 210,
    });
    expect(mocks.executeUpdateData).not.toHaveBeenCalled();
    expect(result.resultCode).toBe('image-ocr-pending');
  });

  it('routes food photo OCR into the FOOD_LOG workflow', () => {
    mocks.extractHealthDataFromImage.mockReturnValue({
      kind: 'food_photo',
      appSource: 'camera',
      occurredAt: null,
      recognizedText: 'Chicken salad',
      summary: 'Chicken salad with avocado',
      foodName: 'Chicken salad',
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.8,
      note: '',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      avgHr: null,
      maxHr: null,
      minHr: null,
      workoutCaloriesKcal: null,
    });
    mocks.executeFoodInsertWorkflow.mockReturnValue({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: { food_log_id: 'food_1' },
    });

    const result = handleIncomingImage(
      'food_photo_1',
      '午餐',
      new Date('2026-04-08T10:00:00Z'),
      'test-chat-id',
    );

    const foodInsertCall = mocks.executeFoodInsertWorkflow.mock.calls[0];
    const foodInsertRequest = foodInsertCall?.[0] as
      | InsertDataRequest
      | undefined;

    expect(foodInsertCall?.[1]).toEqual(new Date('2026-04-08T10:00:00Z'));
    expect(foodInsertRequest).toMatchObject({
      tool: 'insertData',
      sheet: 'FOOD_LOG',
    });
    expect(foodInsertRequest?.record).toMatchObject({
      meal_type: 'lunch',
      meal_text: 'Chicken salad with avocado',
    });
    expect(result.reply).toBe('已记录餐食图片。');
  });

  it('returns a pending stock confirmation for uncertain FOOD_LOG stock deductions', () => {
    mocks.extractHealthDataFromImage.mockReturnValue({
      kind: 'food_photo',
      appSource: 'camera',
      occurredAt: null,
      recognizedText: 'Milk',
      summary: 'Milk',
      foodName: 'Milk',
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.8,
      note: '',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      avgHr: null,
      maxHr: null,
      minHr: null,
      workoutCaloriesKcal: null,
    });
    mocks.executeFoodInsertWorkflow.mockReturnValue({
      insertResult: {
        tool: 'insertData',
        sheet: 'FOOD_LOG',
        record: { food_log_id: 'food_1' },
      },
      pendingStockDeduction: {
        foodLogId: 'food_1',
        mealText: 'Milk',
        candidates: [
          {
            itemName: 'Milk',
            itemQuantity: 250,
            itemUnit: 'ml',
            stockItemId: 'stock_milk',
            stockItemName: 'Milk',
            stockQuantity: 0.3,
            stockUnit: 'l',
            reason: 'converted 250 ml to 0.3 l; requires confirmation',
          },
        ],
      },
    });

    const result = handleIncomingImage(
      'food_photo_pending',
      '午餐',
      new Date('2026-04-08T10:00:00Z'),
      'test-chat-id',
    );

    expect(result.confirmationState).toBe('pending');
    expect(result.resultCode).toBe('food-stock-pending');
    const inlineKeyboard = getInlineKeyboard(
      result.telegramResponse?.replyMarkup,
    );

    expect(inlineKeyboard?.[0]?.[0]?.text).toBe('确认扣减');
    expect(inlineKeyboard?.[0]?.[0]?.callbackData).toMatch(/^stock:confirm:/);
    expect(inlineKeyboard?.[0]?.[1]?.text).toBe('取消');
    expect(inlineKeyboard?.[0]?.[1]?.callbackData).toMatch(/^stock:cancel:/);
    expect(inlineKeyboard?.[0]?.[2]?.text).toBe('修正');
    expect(inlineKeyboard?.[0]?.[2]?.callbackData).toMatch(/^stock:edit:/);
  });

  it('stores workout screenshots into WORKOUT_LOG', () => {
    mocks.extractHealthDataFromImage.mockReturnValue({
      kind: 'workout_summary',
      appSource: 'Apple Fitness',
      occurredAt: '2026-04-08 07:15:00',
      recognizedText: 'Outdoor Walk 42 min Avg HR 128',
      summary: 'Morning workout.',
      foodName: null,
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.87,
      note: '',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: 'Outdoor Walk',
      durationMin: 42,
      workoutLevel: 'medium',
      avgHr: 128,
      maxHr: 152,
      minHr: 88,
      workoutCaloriesKcal: 286,
    });
    mocks.executeInsertData.mockReturnValue({
      tool: 'insertData',
      sheet: 'WORKOUT_LOG',
      record: { workout_id: 'workout_1' },
    });

    const result = handleIncomingImage(
      'file_456',
      '',
      new Date('2026-04-08T10:00:00Z'),
      'test-chat-id',
    );

    const insertCall = mocks.executeInsertData.mock.calls[0];
    const insertRequest = insertCall?.[0] as InsertDataRequest | undefined;

    expect(insertCall?.[1]).toEqual(new Date('2026-04-08T10:00:00Z'));
    expect(insertRequest).toMatchObject({
      tool: 'insertData',
      sheet: 'WORKOUT_LOG',
    });
    expect(insertRequest?.record).toMatchObject({
      occurred_at: '2026-04-08 07:15:00',
      workout_name: 'Outdoor Walk',
      workout_level: 'medium',
      duration_min: 42,
      avg_hr: 128,
      max_hr: 152,
      min_hr: 88,
      calories_kcal: 286,
    });
    expect(result.reply).toBe('已记录运动截图数据。');
  });

  it('returns a no-write reply when OCR output is unsupported', () => {
    mocks.extractHealthDataFromImage.mockReturnValue({
      kind: 'unsupported',
      appSource: '',
      occurredAt: null,
      recognizedText: 'unknown image',
      summary: '',
      foodName: null,
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: null,
      note: '',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      avgHr: null,
      maxHr: null,
      minHr: null,
      workoutCaloriesKcal: null,
    });

    const result = handleIncomingImage(
      'file_789',
      '',
      new Date('2026-04-08T10:00:00Z'),
      'test-chat-id',
    );

    expect(mocks.executeInsertData).not.toHaveBeenCalled();
    expect(result.resultCode).toBe('image-ocr-no-write');
  });
});
