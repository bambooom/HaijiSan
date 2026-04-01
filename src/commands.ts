import { handleAiMessage, handleCancelPendingAction } from './handlers/ai';
import { SLASH_COMMANDS, START_HELP_COMMANDS } from './constants/commands';
import { executeCommandRoute } from './handlers/command-router';
import type { CommandHandlingResult, HandlingMode } from './types';
import { buildAiErrorReply } from './utils/ai-error';

const HELP_MESSAGE = `你好，我是清濑灰二。下面这份可以直接当速查表使用。

<b>📚 帮助</b>
${SLASH_COMMANDS.START} - 查看这份说明
${SLASH_COMMANDS.HELP} - 再看一遍所有指令
${SLASH_COMMANDS.CANCEL} - 取消当前待确认的 AI 写入

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
例如：${SLASH_COMMANDS.REFERENCE} 鸡蛋`;

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
      );
    }
  }

  if (
    START_HELP_COMMANDS.some((command) => normalizedText.startsWith(command))
  ) {
    return buildResult(HELP_MESSAGE, 'command', 'help');
  }

  if (normalizedText.startsWith(SLASH_COMMANDS.CANCEL)) {
    const cancelResult = handleCancelPendingAction(timestamp);

    return {
      ...cancelResult,
      handlingMode: 'command',
      note: `slash-cancel; ${cancelResult.note}`.slice(0, 500),
    };
  }

  const routedCommand = executeCommandRoute(normalizedText, timestamp);

  if (routedCommand) {
    return buildResult(routedCommand.reply, 'command', routedCommand.note);
  }

  return buildResult(
    '嗯，我听到了。输入 /help 可以查看我可以为你做的事情。',
    'rule',
    'unknown-command',
    'ignored',
  );
}

function buildResult(
  reply: string,
  handlingMode: HandlingMode,
  note = '',
  status: CommandHandlingResult['status'] = 'success',
): CommandHandlingResult {
  return {
    reply,
    handlingMode,
    status,
    note,
  };
}
