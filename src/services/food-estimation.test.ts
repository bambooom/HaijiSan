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

import { estimateIngredientCalories } from './food-estimation';
import { spreadsheetService } from './spreadsheet';

describe('estimateIngredientCalories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(spreadsheetService, 'getTimestamp').mockReturnValue(
      '2026-04-09 12:00:00',
    );
  });

  it('requests JSON estimates for unresolved items and normalizes the response', () => {
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
                      items: [
                        {
                          itemName: '燕麦',
                          estimatedCalories: 150,
                          confidence: 'medium',
                          note: 'Assumed one bowl.',
                        },
                        {
                          itemName: '蓝莓',
                          estimatedCalories: '40',
                          confidence: 'high',
                          note: 'Assumed a small handful.',
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
    });

    const result = estimateIngredientCalories(
      [
        { itemName: '燕麦', quantity: 1, unit: 'bowl' },
        { itemName: '蓝莓', quantity: 1, unit: 'serving' },
      ],
      new Date('2026-04-09T04:00:00Z'),
    );

    const request = mocks.fetch.mock.calls[0]?.[1] as { payload: string };
    const payload = JSON.parse(request.payload) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ parts: Array<{ text?: string }> }>;
      generationConfig: { responseMimeType: string };
    };

    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Current local timestamp: 2026-04-09 12:00:00.',
    );
    expect(payload.contents[0]?.parts[0]?.text).toContain('燕麦');
    expect(payload.generationConfig.responseMimeType).toBe('application/json');
    expect(result).toEqual([
      {
        itemName: '燕麦',
        quantity: 1,
        unit: 'bowl',
        estimatedCalories: 150,
        confidence: 'medium',
        note: 'Assumed one bowl.',
      },
      {
        itemName: '蓝莓',
        quantity: 1,
        unit: 'serving',
        estimatedCalories: 40,
        confidence: 'high',
        note: 'Assumed a small handful.',
      },
    ]);
  });

  it('retries transient failures and falls back to low confidence on invalid labels', () => {
    mocks.fetch
      .mockReturnValueOnce({
        getResponseCode: () => 503,
        getContentText: () => 'busy',
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
                        items: [
                          {
                            estimatedCalories: null,
                            confidence: 'unknown',
                            note: null,
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
      });

    const result = estimateIngredientCalories(
      [{ itemName: '未知主食', quantity: 1, unit: 'serving' }],
      new Date('2026-04-09T04:00:00Z'),
    );

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        itemName: '未知主食',
        quantity: 1,
        unit: 'serving',
        estimatedCalories: null,
        confidence: 'low',
        note: '',
      },
    ]);
  });
});