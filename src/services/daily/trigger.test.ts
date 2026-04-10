import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  triggers: [] as Array<{ handler: string }>,
}));

function createTimeBasedBuilder(handler: string) {
  return {
    atHour: vi.fn().mockReturnThis(),
    nearMinute: vi.fn().mockReturnThis(),
    everyDays: vi.fn().mockReturnThis(),
    create: vi.fn(() => {
      state.triggers.push({ handler });
      return { getHandlerFunction: () => handler };
    }),
  };
}

Object.assign(globalThis, {
  ScriptApp: {
    getProjectTriggers: vi.fn(() =>
      state.triggers.map((trigger) => ({
        getHandlerFunction: () => trigger.handler,
      })),
    ),
    deleteTrigger: vi.fn((target: { getHandlerFunction: () => string }) => {
      const handler = target.getHandlerFunction();
      const index = state.triggers.findIndex(
        (trigger) => trigger.handler === handler,
      );

      if (index >= 0) {
        state.triggers.splice(index, 1);
      }
    }),
    newTrigger: vi.fn((handler: string) => ({
      timeBased: () => createTimeBasedBuilder(handler),
    })),
  },
});

import {
  disableDailyDigestTrigger,
  getDailyDigestTriggerStatus,
  installDailyDigestTrigger,
} from './trigger';

describe('digest trigger service', () => {
  beforeEach(() => {
    state.triggers.length = 0;
    vi.clearAllMocks();
  });

  it('installs a single daily digest trigger', () => {
    const status = installDailyDigestTrigger();

    expect(status).toEqual({ enabled: true, triggerCount: 1 });
    expect(getDailyDigestTriggerStatus()).toEqual({
      enabled: true,
      triggerCount: 1,
    });
  });

  it('replaces existing digest triggers on install', () => {
    state.triggers.push(
      { handler: 'sendDailyDigest' },
      { handler: 'sendDailyDigest' },
    );

    const status = installDailyDigestTrigger();

    expect(status).toEqual({ enabled: true, triggerCount: 1 });
  });

  it('disables all digest triggers', () => {
    state.triggers.push(
      { handler: 'sendDailyDigest' },
      { handler: 'sendDailyDigest' },
    );

    const status = disableDailyDigestTrigger();

    expect(status).toEqual({ enabled: false, triggerCount: 0 });
  });
});
