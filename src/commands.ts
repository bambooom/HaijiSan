import { handleAiMessage, handleCancelPendingAction } from './handlers/ai';
import {
  DIGEST_COMMANDS,
  SLASH_COMMANDS,
  START_HELP_COMMANDS,
} from './constants/commands';
import { executeCommandRoute } from './handlers/command-router';
import {
  disableDailyDigestTrigger,
  getDailyDigestTriggerStatus,
  installDailyDigestTrigger,
} from './services/digest-trigger';
import type {
  CommandHandlingResult,
  CommandLogFields,
  HandlingMode,
} from './types';
import { buildAiErrorReply } from './utils/ai-error';
import { buildCommandLogFields } from './utils/log-meta';

const HELP_MESSAGE = `你好，我是清濑灰二。下面这份可以直接当速查表使用。

<b>📚 帮助</b>
${SLASH_COMMANDS.START} - 查看这份说明
${SLASH_COMMANDS.HELP} - 再看一遍所有指令
${SLASH_COMMANDS.CANCEL} - 取消当前待确认的 AI 写入
${SLASH_COMMANDS.DIGEST_ON} - 开启每天接近 23:30 的日报定时
${SLASH_COMMANDS.DIGEST_OFF} - 关闭日报定时
${SLASH_COMMANDS.DIGEST_STATUS} - 查看日报定时当前是否已开启

<b>🏃 身体与状态</b>
${SLASH_COMMANDS.WEIGHT} 55 - 记录体重
例如：${SLASH_COMMANDS.WEIGHT} 55.3

${SLASH_COMMANDS.POO} - 记录排便情况
例如：${SLASH_COMMANDS.POO}

${SLASH_COMMANDS.PERIOD} - 记录经期开始或当天状态
例如：${SLASH_COMMANDS.PERIOD}
例如：${SLASH_COMMANDS.PERIOD} 2 量少

${SLASH_COMMANDS.SYMPTOM} - 记录症状，可附周期天数
例如：${SLASH_COMMANDS.SYMPTOM} 头痛
例如：${SLASH_COMMANDS.SYMPTOM} 腹痛 day 2

<b>😴 睡眠</b>
${SLASH_COMMANDS.SLEEP} - 记录入睡、醒来时间和睡眠质量
例如：${SLASH_COMMANDS.SLEEP} 23:30 07:30 好
例如：${SLASH_COMMANDS.SLEEP} 00:45 08:15 一般

<b>💪 运动</b>
${SLASH_COMMANDS.WORKOUT} - 记录运动名称、时长和强度
例如：${SLASH_COMMANDS.WORKOUT} 跑步 35 中等
例如：${SLASH_COMMANDS.WORKOUT} 帕梅拉燃脂 20 高强度

<b>📦 库存</b>
${SLASH_COMMANDS.STOCK} - 增加或扣减库存
例如：${SLASH_COMMANDS.STOCK} 鸡蛋 +6个 盒马
例如：${SLASH_COMMANDS.STOCK} 鸡蛋 -2个

${SLASH_COMMANDS.SET_STOCK} - 直接校正库存
例如：${SLASH_COMMANDS.SET_STOCK} 鸡蛋 12个 盒马

${SLASH_COMMANDS.CHECK} - 查看当前库存
例如：${SLASH_COMMANDS.CHECK}

<b>🍜 饮食</b>
${SLASH_COMMANDS.FOOD} - 记录一餐内容，支持居家称重或外食描述
例如：${SLASH_COMMANDS.FOOD} 早餐 280g西兰花+81g鸡小胸
例如：${SLASH_COMMANDS.FOOD} 中饭 一碗牛肉粉
餐次前缀可写：早餐/早饭/早，午餐/午饭/中饭/午/中，晚餐/晚饭/晚，加餐/夜宵/宵夜/零食

<b>📖 热量参考</b>
${SLASH_COMMANDS.REFERENCE} - 查看热量参考表
例如：${SLASH_COMMANDS.REFERENCE}
${SLASH_COMMANDS.REFERENCE} 关键词 - 按名称或品牌搜索
例如：${SLASH_COMMANDS.REFERENCE} 鸡蛋
也可以直接发商品包装营养成分表的照片，或体重/运动/睡眠类 App 截图，我会尽量提取并写入对应记录。`;

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

export function handleCommand(
  text: string,
  timestamp: Date,
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

    try {
      return handleAiMessage(normalizedText, timestamp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return buildResult(
        buildAiErrorReply(message),
        'ai',
        `ai-error=${message}`.slice(0, 500),
        'failed',
        {
          resultCode: 'ai-error',
        },
      );
    }
  }

  if (
    START_HELP_COMMANDS.some((command) => normalizedText.startsWith(command))
  ) {
    return buildResult(HELP_MESSAGE, 'command', 'help', 'success', {
      resultCode: 'help',
    });
  }

  if (normalizedText.startsWith(SLASH_COMMANDS.CANCEL)) {
    const cancelResult = handleCancelPendingAction(timestamp);

    return {
      ...cancelResult,
      handlingMode: 'command',
      note: `slash-cancel; ${cancelResult.note}`.slice(0, 500),
      resultCode: cancelResult.resultCode || 'cancelled',
    };
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

      throw error;
    }
  }

  const routedCommand = executeCommandRoute(normalizedText, timestamp);

  if (routedCommand) {
    return buildResult(
      routedCommand.reply,
      'command',
      routedCommand.note,
      'success',
      {
        resultCode: routedCommand.note,
      },
    );
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
