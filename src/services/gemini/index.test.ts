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

import { generateFinalAiReply, startAiResponse } from './index';
import { spreadsheetService } from '../spreadsheet';

describe('Gemini native function calling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(spreadsheetService, 'getTimestamp').mockReturnValue(
      '2026-04-08 18:00:00',
    );
  });

  it('starts with a direct reply when Gemini returns plain text', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    text: '可以，告诉我你要记录什么。',
                  },
                ],
              },
            },
          ],
        }),
    });

    const result = startAiResponse(
      '你能做什么？',
      [
        {
          loggedAt: '2026-04-08 09:00:00',
          userText: '昨天早餐吃了酸奶',
          assistantText: '我记住了。',
        },
      ],
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(result).toMatchObject({
      mode: 'reply',
      reply: '可以，告诉我你要记录什么。',
    });

    const request = mocks.fetch.mock.calls[0]?.[1] as { payload: string };
    const payload = JSON.parse(request.payload) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      systemInstruction: { parts: Array<{ text: string }> };
      tools: Array<{ functionDeclarations: Array<{ name: string }> }>;
    };

    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'personal health, nutrition, and logging assistant',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'calm, steady, observant, and dependable',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'never use Markdown. Use only the simplest Telegram HTML tags',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Current local timestamp for interpreting relative dates: 2026-04-08 18:00:00.',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Treat the latest user message as the primary source of truth.',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Never invent a distant year or unrelated calendar date when the user gave a relative date like 今天.',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      "extract the event time from the user's natural-language meaning",
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'All timestamp fields must use the exact format yyyy-MM-dd HH:mm:ss.',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Do not output natural-language timestamp strings such as today 08:55',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'For FOOD_LOG, map Chinese meal words into the schema enum values: 早餐 or 早饭 -> breakfast; 午餐 or 午饭 -> lunch; 晚餐 or 晚饭 -> dinner; 加餐, 零食, 下午茶, 夜宵 -> snack',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'For SLEEP_LOG, route sleep-related statements into SLEEP_LOG rather than FOOD_LOG.',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'For STATUS_LOG menstruation entries, entry_type should be menstruation, cycle_day should be the numeric cycle day such as 3 for 第3天, value should hold the main status such as light, medium, or heavy bleeding',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Schema constraints summary:',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Field meaning summary:',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'FOOD_LOG | ops=read,insert,update',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'insert-required=occurred_at,meal_type,meal_text',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'auto=food_log_id',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'immutable=logged_at',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'enums=meal_type = breakfast | lunch | dinner | snack',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'BOT_LOG | ops=read',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'STATUS_LOG field meanings: occurred_at = When the status event actually happened.; entry_type = Status category: bowel movement, menstruation, symptom, or medication.; value = Primary recorded value. For menstruation, use a short status such as light, medium, or heavy bleeding rather than copying the full user sentence.; unit = Unit only when value is numeric, such as mg or times.; note = Optional extra detail that does not fit in the main value.; cycle_day = Menstrual cycle day number, such as 3 for 经期第3天.',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'SLEEP_LOG field meanings: sleep_start_at = When the sleep period started.; sleep_end_at = When the sleep period ended.; sleep_hours = Total sleep duration in hours when known.; sleep_quality = Overall sleep quality as good, normal, or poor.; source = Where the sleep data came from.; note = Optional extra detail about the sleep record.',
    );
    expect(payload.systemInstruction.parts[0]?.text).not.toContain(
      'Available sheets and fields:',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'prefer calling readData first before answering',
    );
    expect(
      payload.tools[0]?.functionDeclarations.map((tool) => tool.name),
    ).toEqual(['readData', 'insertData', 'insertFoodLog', 'updateData']);
    expect(payload.contents).toEqual([
      {
        role: 'user',
        parts: [{ text: '昨天早餐吃了酸奶' }],
      },
      {
        role: 'model',
        parts: [{ text: '我记住了。' }],
      },
      {
        role: 'user',
        parts: [{ text: '你能做什么？' }],
      },
    ]);
  });

  it('maps Gemini functionCall to a GenericToolRequest', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      id: 'call-1',
                      name: 'readData',
                      args: {
                        sheet: 'FOOD_LOG',
                        selectorType: 'recent',
                        limit: 3,
                        fields: ['meal_text'],
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
    });

    const result = startAiResponse(
      '最近吃了什么',
      [],
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(result).toMatchObject({
      mode: 'tool',
      request: {
        tool: 'readData',
        sheet: 'FOOD_LOG',
        selector: {
          type: 'recent',
          limit: 3,
        },
        fields: ['meal_text'],
      },
      functionCall: {
        id: 'call-1',
        name: 'readData',
      },
    });
  });

  it('maps Gemini insertFoodLog calls to a structured FOOD_LOG request', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      id: 'call-food-1',
                      name: 'insertFoodLog',
                      args: {
                        record: {
                          occurred_at: '2026-04-08 12:30:00',
                          meal_type: 'lunch',
                          meal_text: '鸡蛋和菠菜',
                        },
                        items: [
                          {
                            itemName: '鸡蛋',
                            quantity: 2,
                            unit: 'piece',
                          },
                          {
                            itemName: '菠菜',
                            quantity: 100,
                            unit: 'g',
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
    });

    const result = startAiResponse(
      '午餐吃了两个鸡蛋和100克菠菜',
      [],
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(result).toMatchObject({
      mode: 'tool',
      request: {
        tool: 'insertFoodLog',
        sheet: 'FOOD_LOG',
        record: {
          occurred_at: '2026-04-08 12:30:00',
          meal_type: 'lunch',
          meal_text: '鸡蛋和菠菜',
        },
        items: [
          {
            itemName: '鸡蛋',
            quantity: 2,
            unit: 'piece',
          },
          {
            itemName: '菠菜',
            quantity: 100,
            unit: 'g',
          },
        ],
      },
      functionCall: {
        id: 'call-food-1',
        name: 'insertFoodLog',
      },
    });
  });

  it('retries transient Gemini 503 responses before succeeding', () => {
    mocks.fetch
      .mockReturnValueOnce({
        getResponseCode: () => 503,
        getContentText: () =>
          'This model is currently experiencing high demand',
      })
      .mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: '重试后成功。' }],
                },
              },
            ],
          }),
      });

    const result = startAiResponse(
      '现在怎么样？',
      [],
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(result).toMatchObject({
      mode: 'reply',
      reply: '重试后成功。',
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable Gemini errors', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 400,
      getContentText: () => 'Bad Request',
    });

    expect(() =>
      startAiResponse('坏请求', [], new Date('2026-04-08T10:00:00Z')),
    ).toThrow('Gemini request failed (400): Bad Request');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('tells insertData to use exact timestamp strings instead of natural-language timestamps', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: '可以。' }],
              },
            },
          ],
        }),
    });

    startAiResponse('帮我记录早餐', [], new Date('2026-04-08T10:00:00Z'));

    const request = mocks.fetch.mock.calls[0]?.[1] as { payload: string };
    const payload = JSON.parse(request.payload) as {
      tools: Array<{
        functionDeclarations: Array<{
          name: string;
          description?: string;
          parameters: {
            properties: {
              record: { description: string };
              items?: { description: string };
            };
          };
        }>;
      }>;
    };

    const insertDeclaration = payload.tools[0]?.functionDeclarations.find(
      (tool) => tool.name === 'insertData',
    );

    expect(
      insertDeclaration?.parameters.properties.record.description,
    ).toContain(
      'All timestamp values must use the exact format yyyy-MM-dd HH:mm:ss.',
    );
    expect(
      insertDeclaration?.parameters.properties.record.description,
    ).toContain(
      'Never pass natural-language timestamp strings like today 08:55.',
    );
    expect(
      insertDeclaration?.parameters.properties.record.description,
    ).toContain(
      'Do not use insertData for FOOD_LOG; use insertFoodLog instead.',
    );

    const insertFoodLogDeclaration =
      payload.tools[0]?.functionDeclarations.find(
        (tool) => tool.name === 'insertFoodLog',
      );

    expect(insertFoodLogDeclaration?.description).toContain(
      'structured meal items',
    );
    expect(
      insertFoodLogDeclaration?.parameters.properties.items?.description,
    ).toContain("Preserve the user's quantity and unit");
    expect(
      insertFoodLogDeclaration?.parameters.properties.record.description,
    ).toContain(
      'meal_type must be exactly one of breakfast, lunch, dinner, snack.',
    );
    expect(
      insertDeclaration?.parameters.properties.record.description,
    ).toContain(
      'For SLEEP_LOG, put the sleep interval into sleep_start_at and sleep_end_at',
    );
  });

  it('sends functionResponse back to Gemini for the final answer', () => {
    mocks.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    text: '根据你最近的饮食记录，早餐以酸奶为主，整体较清淡。',
                  },
                ],
              },
            },
          ],
        }),
    });

    const reply = generateFinalAiReply({
      userText: '最近吃了什么',
      conversationHistory: [
        {
          loggedAt: '2026-04-08 09:00:00',
          userText: '昨天早餐吃了酸奶',
          assistantText: '我记住了。',
        },
      ],
      referenceTimestamp: new Date('2026-04-08T10:00:00Z'),
      firstTurn: {
        mode: 'tool',
        request: {
          tool: 'readData',
          sheet: 'FOOD_LOG',
          selector: {
            type: 'recent',
            limit: 3,
          },
        },
        functionCall: {
          id: 'call-1',
          name: 'readData',
          args: {
            sheet: 'FOOD_LOG',
            selectorType: 'recent',
            limit: 3,
          },
        },
        modelContent: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-1',
                name: 'readData',
                args: {
                  sheet: 'FOOD_LOG',
                  selectorType: 'recent',
                  limit: 3,
                },
              },
            },
          ],
        },
      },
      toolResult: {
        tool: 'readData',
        sheet: 'FOOD_LOG',
        selector: {
          type: 'recent',
          limit: 3,
        },
        rows: [
          {
            rowNumber: 3,
            record: {
              meal_text: '酸奶',
            },
          },
        ],
      },
    });

    expect(reply).toContain('酸奶');

    const request = mocks.fetch.mock.calls[0]?.[1] as { payload: string };
    const payload = JSON.parse(request.payload) as {
      contents: Array<{
        parts: Array<{
          text?: string;
          functionResponse?: {
            id?: string;
            name: string;
            response: Record<string, unknown>;
          };
        }>;
      }>;
      toolConfig: {
        functionCallingConfig: {
          mode: string;
        };
      };
    };

    expect(payload.contents).toHaveLength(5);
    expect(payload.contents[0]).toEqual({
      role: 'user',
      parts: [{ text: '昨天早餐吃了酸奶' }],
    });
    expect(payload.contents[1]).toEqual({
      role: 'model',
      parts: [{ text: '我记住了。' }],
    });
    expect(payload.contents[4]?.parts[0]?.functionResponse).toEqual({
      id: 'call-1',
      name: 'readData',
      response: {
        result: {
          tool: 'readData',
          sheet: 'FOOD_LOG',
          selector: {
            type: 'recent',
            limit: 3,
          },
          rows: [
            {
              rowNumber: 3,
              record: {
                meal_text: '酸奶',
              },
            },
          ],
        },
      },
    });
    expect(payload.toolConfig.functionCallingConfig.mode).toBe('NONE');
  });
});
