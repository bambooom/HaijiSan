import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appConfig: Object.assign(globalThis, {
    __APP_CONFIG__: {
      SHEET_ID: 'test-sheet',
      BOT_TOKEN: 'test-bot-token',
      MY_CHAT_ID: 'test-chat-id',
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_MODEL: 'test-gemini-model',
    },
  }),
  fetch: vi.fn(),
}));

Object.assign(globalThis, {
  UrlFetchApp: {
    fetch: mocks.fetch,
  },
  Utilities: {
    sleep: vi.fn(),
  },
});

import { extractHealthDataFromImage } from './index';
import { spreadsheetService } from '../spreadsheet';

describe('extractHealthDataFromImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(spreadsheetService, 'getTimestamp').mockReturnValue(
      '2026-04-08 18:00:00',
    );
  });

  it('sends a multimodal Gemini request and parses nutrition label output', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      kind: 'nutrition_label',
                      appSource: 'camera',
                      recognizedText:
                        'Energy 210 kcal Protein 12g Fat 7g Carbs 24g',
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
                    }),
                  },
                ],
              },
            },
          ],
        }),
    });

    const result = extractHealthDataFromImage({
      base64Data: 'encoded-image',
      mimeType: 'image/jpeg',
      referenceTimestamp: new Date('2026-04-08T10:00:00Z'),
      userPrompt: 'This may be a food nutrition label.',
    });

    const request = mocks.fetch.mock.calls[0]?.[1] as { payload: string };
    const payload = JSON.parse(request.payload) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{
        parts: Array<{
          text?: string;
          inline_data?: { mime_type: string; data: string };
        }>;
      }>;
      generationConfig: { responseMimeType: string };
    };

    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Current local timestamp: 2026-04-08 18:00:00.',
    );
    expect(payload.contents[0]?.parts[0]?.text).toContain(
      'This may be a food nutrition label.',
    );
    expect(payload.contents[0]?.parts[1]?.inline_data).toEqual({
      mime_type: 'image/jpeg',
      data: 'encoded-image',
    });
    expect(payload.generationConfig.responseMimeType).toBe('application/json');
    expect(result).toMatchObject({
      kind: 'nutrition_label',
      foodName: 'Greek Yogurt',
      caloriesKcal: 210,
      proteinG: 12,
      fatG: 7,
      carbsG: 24,
      recognizedText: 'Energy 210 kcal Protein 12g Fat 7g Carbs 24g',
    });
  });

  it('normalizes body and workout metrics from JSON text', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"kind":"workout_summary","appSource":"Apple Fitness","occurredAt":"2026-04-08 07:15:00","recognizedText":"Outdoor Walk 42 min Avg HR 128 Max 152 Calories 286","summary":"Morning outdoor walk.","workoutName":"Outdoor Walk","durationMin":42,"workoutLevel":"medium","avgHr":128,"maxHr":152,"minHr":88,"workoutCaloriesKcal":286,"confidence":0.87}',
                  },
                ],
              },
            },
          ],
        }),
    });

    const result = extractHealthDataFromImage({
      base64Data: 'encoded-image',
      mimeType: 'image/png',
    });

    expect(result).toMatchObject({
      kind: 'workout_summary',
      appSource: 'Apple Fitness',
      occurredAt: '2026-04-08 07:15:00',
      workoutName: 'Outdoor Walk',
      durationMin: 42,
      workoutLevel: 'medium',
      avgHr: 128,
      maxHr: 152,
      minHr: 88,
      workoutCaloriesKcal: 286,
    });
  });

  it('supports food photo classification for downstream FOOD_LOG workflow use', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      kind: 'food_photo',
                      appSource: 'camera',
                      occurredAt: null,
                      recognizedText: 'Chicken salad',
                      summary: 'Chicken salad with avocado.',
                      foodName: 'Chicken salad',
                      caloriesKcal: 420,
                      proteinG: 24,
                      fatG: 28,
                      carbsG: 12,
                      confidence: 0.78,
                    }),
                  },
                ],
              },
            },
          ],
        }),
    });

    const result = extractHealthDataFromImage({
      base64Data: 'encoded-image',
      mimeType: 'image/jpeg',
    });

    expect(result).toMatchObject({
      kind: 'food_photo',
      foodName: 'Chicken salad',
      summary: 'Chicken salad with avocado.',
      recognizedText: 'Chicken salad',
      caloriesKcal: 420,
      proteinG: 24,
      fatG: 28,
      carbsG: 12,
    });
  });

  it('retries transient failures and normalizes unsupported output fields', () => {
    mocks.fetch
      .mockReturnValueOnce({
        getResponseCode: () => 503,
        getContentText: () => 'high demand',
      })
      .mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        kind: 'random_kind',
                        appSource: 'Health App',
                        occurredAt: '',
                        recognizedText: 'Weight 55.2 BMI 20.6',
                        summary: 'Body metrics screenshot.',
                        weightKg: '55.2',
                        bmi: '20.6',
                        bodyFatPct: null,
                        leanBodyMassKg: 'abc',
                        sleepQuality: 'great',
                        confidence: '0.8',
                        note: null,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
      });

    const result = extractHealthDataFromImage({
      base64Data: 'encoded-image',
      mimeType: 'image/png',
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      kind: 'unsupported',
      appSource: 'Health App',
      occurredAt: null,
      recognizedText: 'Weight 55.2 BMI 20.6',
      summary: 'Body metrics screenshot.',
      foodName: null,
      brand: '',
      servingSize: null,
      servingUnit: '',
      caloriesKcal: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      confidence: 0.8,
      note: '',
      weightKg: 55.2,
      bmi: 20.6,
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
  });
});
