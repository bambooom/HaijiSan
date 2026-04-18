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
  installDailyDigestTrigger: vi.fn(),
  disableDailyDigestTrigger: vi.fn(),
  getDailyDigestTriggerStatus: vi.fn(),
  sendDailyDigestMessage: vi.fn(),
}));

vi.mock('./services/daily/trigger', () => ({
  installDailyDigestTrigger: mocks.installDailyDigestTrigger,
  disableDailyDigestTrigger: mocks.disableDailyDigestTrigger,
  getDailyDigestTriggerStatus: mocks.getDailyDigestTriggerStatus,
}));

vi.mock('./services/daily/send', () => ({
  sendDailyDigestMessage: mocks.sendDailyDigestMessage,
}));

import { handleCommand } from './commands';

describe('handleCommand digest trigger commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('sends a manual test digest via slash command', () => {
    const result = handleCommand(
      '/digesttest',
      new Date('2026-04-02T12:00:00'),
    );

    expect(mocks.sendDailyDigestMessage).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    expect(result.resultCode).toBe('digest-trigger-command');
    expect(result.reply).toContain('测试日报已发送');
  });

  it('returns a controlled failure reply when manual digest delivery fails', () => {
    mocks.sendDailyDigestMessage.mockImplementation(() => {
      throw new Error('Telegram sendMessage request failed (400)');
    });

    const result = handleCommand(
      '/digesttest',
      new Date('2026-04-02T12:00:00'),
    );

    expect(result.status).toBe('failed');
    expect(result.resultCode).toBe('digest-test-failed');
    expect(result.reply).toContain('日报测试发送失败');
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

  it('ignores non-slash text in slash-command-only mode', () => {
    const result = handleCommand(
      '今天睡得不错',
      new Date('2026-04-02T12:00:00'),
    );

    expect(result.status).toBe('ignored');
    expect(result.resultCode).toBe('slash-command-only');
    expect(result.reply).toContain('只支持 slash command');
  });

  it('ignores unknown slash commands after business commands are removed', () => {
    const result = handleCommand(
      '/food 早餐 鸡蛋',
      new Date('2026-04-02T12:00:00'),
    );

    expect(result.status).toBe('ignored');
    expect(result.resultCode).toBe('unknown-command');
    expect(result.reply).toContain('/help');
  });
});
