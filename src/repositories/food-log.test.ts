import { beforeAll, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

let FoodLogRepository: typeof import('./food-log').FoodLogRepository;

beforeAll(async () => {
  ({ FoodLogRepository } = await import('./food-log'));
});

describe('FoodLogRepository', () => {
  it('matches Date-valued logged_at cells against the script-local day', () => {
    const spreadsheet = {
      getTimestamp: vi
        .fn()
        .mockReturnValueOnce('2026-04-02 12:00:00')
        .mockReturnValueOnce('2026-04-02 08:30:00'),
      getDataRows: vi.fn(() => [
        {
          rowNumber: 2,
          values: [
            'food_1',
            new Date('2026-04-02T00:30:00.000Z'),
            'breakfast',
            '鸡蛋和燕麦',
            360,
            'parsed',
            '',
          ],
        },
      ]),
    } as unknown as ConstructorParameters<typeof FoodLogRepository>[0];

    const repository = new FoodLogRepository(spreadsheet);

    expect(repository.listByDate(new Date('2026-04-02T12:00:00.000Z'))).toEqual(
      [
        {
          food_log_id: 'food_1',
          logged_at: '2026-04-02 08:30:00',
          meal_type: 'breakfast',
          meal_text: '鸡蛋和燕麦',
          estimated_calories: 360,
          parse_status: 'parsed',
          note: '',
        },
      ],
    );
  });
});
