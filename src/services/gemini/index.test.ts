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

describe('Gemini native function calling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const result = startAiResponse('你能做什么？', [
      {
        loggedAt: '2026-04-08 09:00:00',
        userText: '昨天早餐吃了酸奶',
        assistantText: '我记住了。',
      },
    ]);

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
      "extract the event time from the user's natural-language meaning",
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'For FOOD_LOG, map Chinese meal words into the schema enum values: 早餐 or 早饭 -> breakfast; 午餐 or 午饭 -> lunch; 晚餐 or 晚饭 -> dinner; 加餐, 零食, 下午茶, 夜宵 -> snack',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'Schema constraints summary:',
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
    expect(payload.systemInstruction.parts[0]?.text).not.toContain(
      'Available sheets and fields:',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'prefer calling readData first before answering',
    );
    expect(
      payload.tools[0]?.functionDeclarations.map((tool) => tool.name),
    ).toEqual(['readData', 'insertData', 'updateData']);
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

    const result = startAiResponse('最近吃了什么');

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

    const result = startAiResponse('现在怎么样？');

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

    expect(() => startAiResponse('坏请求')).toThrow(
      'Gemini request failed (400): Bad Request',
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
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
