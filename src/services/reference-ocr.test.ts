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
  extractNutritionLabelReference: vi.fn(),
  extractHealthScreenshot: vi.fn(),
  logReference: vi.fn(),
  logMetrics: vi.fn(),
  logSleep: vi.fn(),
  logWorkout: vi.fn(),
}));

vi.mock('../repositories', () => ({
  bodyLogRepository: {
    logMetrics: mocks.logMetrics,
  },
  refCaloriesRepository: {
    logReference: mocks.logReference,
  },
  sleepLogRepository: {
    logSleep: mocks.logSleep,
  },
  workoutLogRepository: {
    logWorkout: mocks.logWorkout,
  },
}));

vi.mock('./gemini', () => ({
  geminiService: {
    extractNutritionLabelReference: mocks.extractNutritionLabelReference,
    extractHealthScreenshot: mocks.extractHealthScreenshot,
  },
}));

import {
  importHealthDataPhoto,
  importReferenceFromNutritionLabelPhoto,
} from './reference-ocr';

const baseInput = {
  base64Data: 'abc123',
  mimeType: 'image/png',
  caption: 'from app',
};

const timestamp = new Date('2026-04-02T12:00:00.000Z');

describe('reference OCR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports a nutrition label when required fields are valid', () => {
    mocks.extractNutritionLabelReference.mockReturnValue({
      foodName: '燕麦棒',
      brand: 'Test Brand',
      servingSize: 45,
      servingUnit: 'g',
      caloriesKcal: 190,
      proteinG: 6,
      fatG: 7,
      carbsG: 24,
      confidence: 0.91,
      note: 'nutrition label',
    });
    mocks.logReference.mockReturnValue({
      food_ref_id: 'ref_1',
      food_name: '燕麦棒',
      brand: 'Test Brand',
      serving_size: 45,
      serving_unit: 'g',
      calories_kcal: 190,
      protein_g: 6,
      fat_g: 7,
      carbs_g: 24,
      source: 'nutrition_label',
      updated_at: '2026-04-02 12:00:00',
      note: '',
    });

    const result = importReferenceFromNutritionLabelPhoto(baseInput, timestamp);

    expect(mocks.logReference).toHaveBeenCalledTimes(1);
    expect(mocks.logReference).toHaveBeenCalledWith(
      timestamp,
      expect.objectContaining({
        foodName: '燕麦棒',
        caloriesKcal: 190,
        source: 'nutrition_label',
      }),
    );
    expect(result.status).toBe('success');
    expect(result.resultCode).toBe('photo-reference-imported');
    expect(result.reply).toContain('已写入热量参考');
  });

  it('rejects a nutrition label with absurd numeric values', () => {
    mocks.extractNutritionLabelReference.mockReturnValue({
      foodName: '能量饮料',
      brand: '',
      servingSize: 250,
      servingUnit: 'ml',
      caloriesKcal: 6200,
      proteinG: 0,
      fatG: 0,
      carbsG: 1500,
      confidence: 0.96,
      note: 'bad numbers',
    });

    const result = importReferenceFromNutritionLabelPhoto(baseInput, timestamp);

    expect(mocks.logReference).not.toHaveBeenCalled();
    expect(result.status).toBe('ignored');
    expect(result.resultCode).toBe('photo-low-confidence');
    expect(result.reply).toContain('暂时不敢直接写入');
  });

  it('imports body metrics when values are within a reasonable range', () => {
    mocks.extractHealthScreenshot.mockReturnValue({
      kind: 'body_metrics',
      appSource: 'smart_scale',
      weightKg: 54.8,
      bmi: 20.2,
      bodyFatPct: 22.4,
      leanBodyMassKg: 42.5,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      workoutCaloriesKcal: null,
      foodName: null,
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.89,
      note: 'scale screenshot',
    });
    mocks.logMetrics.mockReturnValue({
      body_log_id: 'body_1',
      logged_at: '2026-04-02 12:00:00',
      weight_kg: 54.8,
      bmi: 20.2,
      body_fat_pct: 22.4,
      lean_body_mass_kg: 42.5,
      source: 'smart_scale',
      note: '',
    });

    const result = importHealthDataPhoto(baseInput, timestamp);

    expect(mocks.logMetrics).toHaveBeenCalledTimes(1);
    expect(mocks.logMetrics).toHaveBeenCalledWith(
      timestamp,
      expect.objectContaining({
        weightKg: 54.8,
        source: 'smart_scale',
      }),
    );
    expect(result.status).toBe('success');
    expect(result.resultCode).toBe('photo-body-imported');
  });

  it('rejects body metrics when extracted values are out of range', () => {
    mocks.extractHealthScreenshot.mockReturnValue({
      kind: 'body_metrics',
      appSource: 'smart_scale',
      weightKg: 600,
      bmi: 120,
      bodyFatPct: 95,
      leanBodyMassKg: 300,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      workoutCaloriesKcal: null,
      foodName: null,
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.88,
      note: 'nonsense screenshot',
    });

    const result = importHealthDataPhoto(baseInput, timestamp);

    expect(mocks.logMetrics).not.toHaveBeenCalled();
    expect(result.status).toBe('ignored');
    expect(result.resultCode).toBe('photo-unsupported');
  });

  it('rejects sleep summaries with implausible duration', () => {
    mocks.extractHealthScreenshot.mockReturnValue({
      kind: 'sleep_summary',
      appSource: 'autosleep',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: '2026-04-01 01:00',
      sleepEnd: '2026-04-02 23:30',
      sleepHours: 46.5,
      sleepQuality: 'good',
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      workoutCaloriesKcal: null,
      foodName: null,
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.93,
      note: 'bad sleep',
    });

    const result = importHealthDataPhoto(baseInput, timestamp);

    expect(mocks.logSleep).not.toHaveBeenCalled();
    expect(result.status).toBe('ignored');
    expect(result.resultCode).toBe('photo-unsupported');
  });

  it('imports an overnight sleep summary and maps app source', () => {
    mocks.extractHealthScreenshot.mockReturnValue({
      kind: 'sleep_summary',
      appSource: 'autosleep',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: '23:30',
      sleepEnd: '07:10',
      sleepHours: null,
      sleepQuality: 'good',
      workoutName: null,
      durationMin: null,
      workoutLevel: null,
      workoutCaloriesKcal: null,
      foodName: null,
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.92,
      note: 'good sleep',
    });

    const result = importHealthDataPhoto(baseInput, timestamp);

    expect(mocks.logSleep).toHaveBeenCalledTimes(1);
    expect(mocks.logSleep).toHaveBeenCalledWith(
      timestamp,
      expect.any(Date),
      expect.any(Date),
      7.7,
      'good',
      expect.stringContaining('app=autosleep'),
      'ios_health',
    );
    expect(result.status).toBe('success');
    expect(result.resultCode).toBe('photo-sleep-imported');
  });

  it('rejects workouts with invalid duration', () => {
    mocks.extractHealthScreenshot.mockReturnValue({
      kind: 'workout_summary',
      appSource: 'ios_health',
      weightKg: null,
      bmi: null,
      bodyFatPct: null,
      leanBodyMassKg: null,
      sleepStart: null,
      sleepEnd: null,
      sleepHours: null,
      sleepQuality: null,
      workoutName: '跑步',
      durationMin: 0,
      workoutLevel: 'medium',
      workoutCaloriesKcal: 260,
      foodName: null,
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.94,
      note: 'invalid duration',
    });

    const result = importHealthDataPhoto(baseInput, timestamp);

    expect(mocks.logWorkout).not.toHaveBeenCalled();
    expect(result.status).toBe('ignored');
    expect(result.resultCode).toBe('photo-unsupported');
  });
});
