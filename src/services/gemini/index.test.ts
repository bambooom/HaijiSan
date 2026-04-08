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

    const result = startAiResponse('你能做什么？');

    expect(result).toMatchObject({
      mode: 'reply',
      reply: '可以，告诉我你要记录什么。',
    });

    const request = mocks.fetch.mock.calls[0]?.[1] as { payload: string };
    const payload = JSON.parse(request.payload) as {
      systemInstruction: { parts: Array<{ text: string }> };
      tools: Array<{ functionDeclarations: Array<{ name: string }> }>;
    };

    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'personal health, nutrition, and logging assistant',
    );
    expect(payload.systemInstruction.parts[0]?.text).toContain(
      'prefer calling readData first before answering',
    );
    expect(
      payload.tools[0]?.functionDeclarations.map((tool) => tool.name),
    ).toEqual(['readData', 'insertData', 'updateData']);
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

    expect(payload.contents).toHaveLength(3);
    expect(payload.contents[2]?.parts[0]?.functionResponse).toEqual({
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
