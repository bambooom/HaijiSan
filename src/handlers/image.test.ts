import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadTelegramFile: vi.fn(),
  extractHealthDataFromImage: vi.fn(),
  executeInsertData: vi.fn(),
  executeUpdateData: vi.fn(),
  executeFoodInsertWorkflow: vi.fn(),
  findReferenceRowByFoodName: vi.fn(),
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

vi.mock('../tables', () => ({
  refCaloriesTable: {
    findEntryRowByFoodName: mocks.findReferenceRowByFoodName,
  },
}));

import { handleIncomingImage } from './image';
import type { InsertDataRequest } from '../tools/types';

describe('handleIncomingImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.downloadTelegramFile.mockReturnValue({
      base64Data: 'encoded-image',
      mimeType: 'image/jpeg',
    });
    mocks.findReferenceRowByFoodName.mockReturnValue(null);
  });

  it('stores nutrition label OCR output into REF_CALORIES', () => {
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
    mocks.executeInsertData.mockReturnValue({
      tool: 'insertData',
      sheet: 'REF_CALORIES',
      record: { food_ref_id: 'ref_1' },
    });

    const result = handleIncomingImage(
      'file_123',
      '早餐营养标签',
      new Date('2026-04-08T10:00:00Z'),
    );

    const insertCall = mocks.executeInsertData.mock.calls[0];
    const insertRequest = insertCall?.[0] as InsertDataRequest | undefined;

    expect(insertCall?.[1]).toEqual(new Date('2026-04-08T10:00:00Z'));
    expect(insertRequest).toMatchObject({
      tool: 'insertData',
      sheet: 'REF_CALORIES',
    });
    expect(insertRequest?.record).toMatchObject({
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
    expect(result.reply).toBe('已记录热量参考：Greek Yogurt。');
    expect(result.resultCode).toBe('image-ocr-inserted');
  });

  it('updates an existing nutrition reference when the OCR food name already exists', () => {
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
    mocks.executeUpdateData.mockReturnValue({
      tool: 'updateData',
      sheet: 'REF_CALORIES',
      selector: { type: 'row-number', rowNumber: 5 },
      updates: { food_name: 'Greek Yogurt' },
    });

    const result = handleIncomingImage(
      'file_update',
      '早餐营养标签',
      new Date('2026-04-08T10:00:00Z'),
    );

    const updateCall = mocks.executeUpdateData.mock.calls[0];
    const updateRequest = updateCall?.[0] as
      | { updates: Record<string, unknown>; selector: { rowNumber: number } }
      | undefined;

    expect(updateCall?.[1]).toEqual(new Date('2026-04-08T10:00:00Z'));
    expect(updateRequest).toMatchObject({
      selector: { rowNumber: 5 },
    });
    expect(updateRequest?.updates).toMatchObject({
      food_name: 'Greek Yogurt',
      calories_kcal: 210,
    });
    expect(result.reply).toBe('已更新热量参考：Greek Yogurt。');
    expect(result.resultCode).toBe('image-ocr-updated');
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
    );

    const foodInsertCall = mocks.executeFoodInsertWorkflow.mock.calls[0];
    const foodInsertRequest = foodInsertCall?.[0] as InsertDataRequest | undefined;

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
    );

    expect(mocks.executeInsertData).not.toHaveBeenCalled();
    expect(result.resultCode).toBe('image-ocr-no-write');
  });
});
