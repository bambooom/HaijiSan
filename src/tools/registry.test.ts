import { describe, expect, it, vi } from 'vitest';

vi.mock('../repositories', () => ({
  bodyLogRepository: {},
  refCaloriesRepository: {},
  sleepLogRepository: {},
  statusLogRepository: {},
  stockRepository: {},
  workoutLogRepository: {},
}));

vi.mock('../services/meal-recording', () => ({
  persistMealRecord: vi.fn(),
}));

vi.mock('../services/nutrition-summary', () => ({
  getTodayNutritionSummary: vi.fn(),
}));

import { getToolContract } from './registry';
import type { LogMealInput, ToolExecutionContext } from './schemas';
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
});
