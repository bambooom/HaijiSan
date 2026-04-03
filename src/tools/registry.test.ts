import { describe, expect, it, vi } from 'vitest';

import { AI_INTENTS } from '../constants/ai';

const mocks = vi.hoisted(() => ({
  logSleep: vi.fn(),
  getTodayNutritionSummary: vi.fn(),
}));

vi.mock('../repositories', () => ({
  bodyLogRepository: {},
  refCaloriesRepository: {},
  sleepLogRepository: {
    logSleep: mocks.logSleep,
  },
  statusLogRepository: {},
  stockRepository: {},
  workoutLogRepository: {},
}));

vi.mock('../services/meal-recording', () => ({
  persistMealRecord: vi.fn(),
}));

vi.mock('../services/nutrition-summary', () => ({
  getTodayNutritionSummary: mocks.getTodayNutritionSummary,
}));

import { buildToolInputFromAiPlan, getToolContract } from './registry';
import type {
  LogMealInput,
  LogSleepInput,
  ToolExecutionContext,
} from './schemas';
import { TOOL_NAMES } from './schemas';

function getMealContract(): {
  validate: (
    input: LogMealInput,
    context: ToolExecutionContext,
  ) => {
    ok: boolean;
    shouldClarify?: boolean;
    issues: Array<{ message: string }>;
  };
} {
  return getToolContract(TOOL_NAMES.LOG_MEAL) as {
    validate: (
      input: LogMealInput,
      context: ToolExecutionContext,
    ) => {
      ok: boolean;
      shouldClarify?: boolean;
      issues: Array<{ message: string }>;
    };
  };
}

describe('tool registry meal validation', () => {
  it('does not clarify AI meal plans before the food executor parses them', () => {
    const validation = getMealContract().validate(
      {
        sourceText: '晚饭140g娃娃菜+66g蛤蜊+81g虾仁+1个金桔（50g）',
        mealText: '晚饭140g娃娃菜+66g蛤蜊+81g虾仁+1个金桔（50g）',
        mealType: 'dinner',
        estimatedCalories: null,
        parseStatus: 'pending',
      },
      {
        timestamp: new Date('2026-04-02T19:00:00.000Z'),
        source: 'ai-plan',
        traceId: 'test-trace',
      },
    );

    expect(validation).toEqual({
      ok: true,
      issues: [],
    });
  });

  it('still clarifies slash-command meals without parsed items or calories', () => {
    const validation = getMealContract().validate(
      {
        sourceText: '晚饭 一些菜',
        mealText: '一些菜',
        mealType: 'dinner',
        estimatedCalories: null,
        parseStatus: 'pending',
      },
      {
        timestamp: new Date('2026-04-02T19:00:00.000Z'),
        source: 'slash-command',
        traceId: 'test-trace',
      },
    );

    expect(validation.ok).toBe(false);
    expect(validation.shouldClarify).toBe(true);
    expect(validation.issues[0]?.message).toBe(
      '我知道你想记录内容，但关键信息还不够。再补一句具体数值或时间就可以。',
    );
  });

  it('passes targetDate through to sleep tool input', () => {
    expect(
      buildToolInputFromAiPlan(
        TOOL_NAMES.LOG_SLEEP,
        {
          mode: 'command',
          intent: AI_INTENTS.SLEEP,
          reply: '',
          targetDate: '2026-04-02',
          sleepStart: '02:42',
          sleepEnd: '08:20',
          sleepQuality: 'normal',
        },
        '更新4月2号的睡眠 2:42-8:20，一般',
      ),
    ).toEqual({
      targetDate: '2026-04-02',
      sleepStart: '02:42',
      sleepEnd: '08:20',
      sleepQuality: 'normal',
      note: undefined,
    });
  });

  it('writes sleep logged_at with the actual record time while backfilling sleep_start_at and sleep_end_at', () => {
    const execute = getToolContract(TOOL_NAMES.LOG_SLEEP).execute as
      | ((input: LogSleepInput, context: ToolExecutionContext) => unknown)
      | undefined;

    if (!execute) {
      throw new Error('log sleep execute is missing');
    }

    execute(
      {
        targetDate: '2026-04-02',
        sleepStart: '02:42',
        sleepEnd: '08:20',
        sleepQuality: 'normal',
      },
      {
        timestamp: new Date('2026-04-03T10:00:00.000Z'),
        source: 'ai-plan',
      },
    );

    expect(mocks.logSleep).toHaveBeenCalledTimes(1);
    expect(mocks.logSleep.mock.calls[0]?.[0]).toEqual(
      new Date('2026-04-03T10:00:00.000Z'),
    );
    expect(mocks.logSleep.mock.calls[0]?.[1]).toEqual(
      new Date(2026, 3, 2, 2, 42, 0, 0),
    );
    expect(mocks.logSleep.mock.calls[0]?.[2]).toEqual(
      new Date(2026, 3, 2, 8, 20, 0, 0),
    );
  });
});
