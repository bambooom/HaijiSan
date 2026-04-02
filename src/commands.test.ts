import { beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

const mocks = vi.hoisted(() => ({
  handleAiMessage: vi.fn(),
  handleCancelPendingAction: vi.fn(),
  executeCommandRoute: vi.fn(),
  installDailyDigestTrigger: vi.fn(),
  disableDailyDigestTrigger: vi.fn(),
  getDailyDigestTriggerStatus: vi.fn(),
}));

vi.mock('./handlers/ai', () => ({
  handleAiMessage: mocks.handleAiMessage,
  handleCancelPendingAction: mocks.handleCancelPendingAction,
}));

vi.mock('./handlers/command-router', () => ({
  executeCommandRoute: mocks.executeCommandRoute,
}));

vi.mock('./services/digest-trigger', () => ({
  installDailyDigestTrigger: mocks.installDailyDigestTrigger,
  disableDailyDigestTrigger: mocks.disableDailyDigestTrigger,
  getDailyDigestTriggerStatus: mocks.getDailyDigestTriggerStatus,
}));

import { handleCommand } from './commands';

describe('handleCommand digest trigger commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeCommandRoute.mockReturnValue(null);
  });

  it('enables the daily digest trigger via slash command', () => {
    mocks.installDailyDigestTrigger.mockReturnValue({
      enabled: true,
      triggerCount: 1,
    });

    const result = handleCommand('/digeston', new Date('2026-04-02T12:00:00'));

    expect(mocks.installDailyDigestTrigger).toHaveBeenCalledTimes(1);
    expect(result.reply).toContain('日报定时已开启');
    expect(result.resultCode).toBe('digest-trigger-command');
  });

  it('disables the daily digest trigger via slash command', () => {
    mocks.disableDailyDigestTrigger.mockReturnValue({
      enabled: false,
      triggerCount: 0,
    });

    const result = handleCommand('/digestoff', new Date('2026-04-02T12:00:00'));

    expect(mocks.disableDailyDigestTrigger).toHaveBeenCalledTimes(1);
    expect(result.reply).toContain('日报定时已关闭');
  });

  it('shows the current digest trigger status', () => {
    mocks.getDailyDigestTriggerStatus.mockReturnValue({
      enabled: false,
      triggerCount: 0,
    });

    const result = handleCommand(
      '/digeststatus',
      new Date('2026-04-02T12:00:00'),
    );

    expect(mocks.getDailyDigestTriggerStatus).toHaveBeenCalledTimes(1);
    expect(result.reply).toContain('日报定时当前未开启');
  });

  it('returns a reauthorization hint when digest trigger scope is missing', () => {
    mocks.installDailyDigestTrigger.mockImplementation(() => {
      throw new Error(
        'You do not have permission to call ScriptApp.getProjectTriggers. Required permissions: https://www.googleapis.com/auth/script.scriptapp.',
      );
    });

    const result = handleCommand('/digeston', new Date('2026-04-02T12:00:00'));

    expect(result.status).toBe('failed');
    expect(result.resultCode).toBe('digest-trigger-auth-required');
    expect(result.reply).toContain('需要额外授权');
  });
});
