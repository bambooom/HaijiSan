import { beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  Utilities: {
    getUuid: vi.fn(() => 'trace-test'),
  },
});

const mocks = vi.hoisted(() => ({
  handlePendingAiAction: vi.fn(() => null),
  retrievePlanningContext: vi.fn(() => ({
    recentMeals: [],
    recentWorkouts: [],
    recentBodyMetrics: [],
    recentSleep: [],
    recentStatus: [],
    stockCandidates: [],
    referenceCandidates: [],
  })),
  formatPlanningContext: vi.fn(() => ''),
  planMessage: vi.fn(),
  validateAiPlanAgainstTool: vi.fn(),
}));

vi.mock('../../services/context-retrieval', () => ({
  retrievePlanningContext: mocks.retrievePlanningContext,
  formatPlanningContext: mocks.formatPlanningContext,
}));

vi.mock('../../services/gemini', () => ({
  geminiService: {
    planMessage: mocks.planMessage,
  },
}));

vi.mock('../../tools/registry', () => ({
  validateAiPlanAgainstTool: mocks.validateAiPlanAgainstTool,
}));

vi.mock('./pending', () => ({
  handlePendingAiAction: mocks.handlePendingAiAction,
}));

import { resolveAiTurn } from './turn';

describe('resolveAiTurn target date inference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planMessage.mockReturnValue({
      mode: 'command',
      intent: 'sleep',
      reply: '我知道你的意思了。',
      sleepStart: '02:42',
      sleepEnd: '08:20',
      sleepQuality: 'normal',
      confidence: 0.9,
    });
    mocks.validateAiPlanAgainstTool.mockReturnValue({
      toolName: 'logSleep',
      input: {
        sleepStart: '02:42',
        sleepEnd: '08:20',
        sleepQuality: 'normal',
      },
      validation: {
        ok: true,
        issues: [],
      },
    });
  });

  it('fills targetDate from source text when the model omits it', () => {
    const resolution = resolveAiTurn(
      '更新4月2号的睡眠 2:42-8:20，一般',
      new Date('2026-04-03T10:00:00.000Z'),
    );

    expect(resolution.kind).toBe('turn');

    if (resolution.kind !== 'turn') {
      return;
    }

    expect(resolution.turn.plan.targetDate).toBe('2026-04-02');
  });
});
