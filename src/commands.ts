import {
  DIGEST_COMMANDS,
  SLASH_COMMANDS,
  START_HELP_COMMANDS,
} from './constants/commands';
import {
  disableDailyDigestTrigger,
  getDailyDigestTriggerStatus,
  installDailyDigestTrigger,
} from './services/daily/trigger';
import { sendDailyDigestMessage } from './services/daily/send';
import type {
  CommandHandlingResult,
  CommandLogFields,
  HandlingMode,
} from './types';
import { buildCommandLogFields } from './utils/log-meta';

const HELP_MESSAGE = `你好，我是清濑灰二。下面这份可以直接当速查表使用。

<b>📚 帮助</b>
${SLASH_COMMANDS.START} - 查看这份说明
${SLASH_COMMANDS.HELP} - 再看一遍所有指令
${SLASH_COMMANDS.DIGEST_ON} - 开启每天接近 23:30 的日报定时
${SLASH_COMMANDS.DIGEST_OFF} - 关闭日报定时
${SLASH_COMMANDS.DIGEST_STATUS} - 查看日报定时当前是否已开启
${SLASH_COMMANDS.DIGEST_TEST} - 立即手动发送一条测试日报
`;

function buildDigestCommandReply(command: string): string {
  if (command.startsWith(SLASH_COMMANDS.DIGEST_ON)) {
    const status = installDailyDigestTrigger();

    return status.enabled
      ? '✅ 日报定时已开启。我会在每天接近 23:30 自动发送一条日报。'
      : '日报定时开启失败。你可以稍后再试一次。';
  }

  if (command.startsWith(SLASH_COMMANDS.DIGEST_OFF)) {
    const status = disableDailyDigestTrigger();

    return status.enabled
      ? `日报定时仍存在 ${status.triggerCount} 个触发器，建议再检查一次。`
      : '🛑 日报定时已关闭，之后不会再自动发送。';
  }

  if (command.startsWith(SLASH_COMMANDS.DIGEST_TEST)) {
    sendDailyDigestMessage();
    return '🧪 测试日报已发送，请检查刚收到的日报消息。';
  }

  const status = getDailyDigestTriggerStatus();

  return status.enabled
    ? `日报定时当前已开启，现有 ${status.triggerCount} 个触发器，会在每天接近 23:30 自动发送。`
    : '日报定时当前未开启。你可以发送 /digeston 来安装。';
}

function isDigestTriggerAuthorizationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes('ScriptApp.getProjectTriggers') ||
    message.includes('ScriptApp.newTrigger') ||
    message.includes('script.scriptapp')
  );
}

function buildDigestAuthorizationReply(): string {
  return '日报定时需要额外授权后才能管理触发器。请在重新部署后，到 Apps Script 编辑器手动运行一次 digest 相关函数并完成授权，然后再试 /digeston。';
}

function buildDigestDeliveryFailureReply(): string {
  return '日报测试发送失败。我刚刚已经尝试发送错误告警；请查看 BOT_LOG 或刚收到的错误消息。';
}

export function handleCommand(
  text: string,
  _timestamp: Date,
): CommandHandlingResult {
  const normalizedText = text.trimStart();

  if (!normalizedText.startsWith('/')) {
    if (!normalizedText.trim()) {
      return buildResult(
        '嗯，我听到了。输入 /help 可以查看我可以为你做的事情。',
        'rule',
        'empty-message',
        'ignored',
        {
          resultCode: 'empty-message',
        },
      );
    }

    return buildResult(
      '当前版本只支持 slash command。输入 /help 可以查看可用指令。',
      'rule',
      'slash-command-only',
      'ignored',
      {
        resultCode: 'slash-command-only',
      },
    );
  }

  if (
    START_HELP_COMMANDS.some((command) => normalizedText.startsWith(command))
  ) {
    return buildResult(HELP_MESSAGE, 'command', 'help', 'success', {
      resultCode: 'help',
    });
  }

  if (DIGEST_COMMANDS.some((command) => normalizedText.startsWith(command))) {
    try {
      return buildResult(
        buildDigestCommandReply(normalizedText),
        'command',
        'digest-trigger-command',
        'success',
        {
          resultCode: 'digest-trigger-command',
        },
      );
    } catch (error) {
      if (isDigestTriggerAuthorizationError(error)) {
        return buildResult(
          buildDigestAuthorizationReply(),
          'command',
          'digest-trigger-auth-required',
          'failed',
          {
            resultCode: 'digest-trigger-auth-required',
          },
        );
      }

      if (normalizedText.startsWith(SLASH_COMMANDS.DIGEST_TEST)) {
        return buildResult(
          buildDigestDeliveryFailureReply(),
          'command',
          'digest-test-failed',
          'failed',
          {
            resultCode: 'digest-test-failed',
          },
        );
      }

      throw error;
    }
  }

  return buildResult(
    '嗯，我听到了。输入 /help 可以查看我可以为你做的事情。',
    'rule',
    'unknown-command',
    'ignored',
    {
      resultCode: 'unknown-command',
    },
  );
}

function buildResult(
  reply: string,
  handlingMode: HandlingMode,
  note = '',
  status: CommandHandlingResult['status'] = 'success',
  logFields?: Partial<CommandLogFields>,
): CommandHandlingResult {
  return {
    reply,
    handlingMode,
    status,
    note,
    ...buildCommandLogFields(undefined, {
      confirmationState: 'none',
      resultCode: status,
      ...logFields,
    }),
  };
}
