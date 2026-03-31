import { handleAiMessage, handleCancelPendingAction } from './handlers/ai';
import { handleFoodCommand } from './handlers/food';
import { handleReferenceCommand } from './handlers/reference';
import { handleSleepCommand } from './handlers/sleep';
import { handleStatusCommand } from './handlers/status';
import { handleStockCommand } from './handlers/stock';
import { handleWorkoutCommand } from './handlers/workout';
import type { CommandHandlingResult, HandlingMode } from './types';

const HELP_MESSAGE =
  '你好，我是清濑灰二。下面这份可以直接当速查表使用。\n\n' +
  '<b>📚 帮助</b>\n' +
  '/start - 查看这份说明\n' +
  '/help - 再看一遍所有指令\n' +
  '/cancel - 取消当前待确认的 AI 写入\n\n' +
  '<b>🏃 身体与状态</b>\n' +
  '/weight 55 - 记录体重\n' +
  '例如：/weight 55.3\n\n' +
  '/poo - 记录排便情况\n' +
  '例如：/poo\n\n' +
  '/period - 记录经期开始或当天状态\n' +
  '例如：/period\n' +
  '例如：/period 2 量少\n\n' +
  '/symptom - 记录症状，可附周期天数\n' +
  '例如：/symptom 头痛\n' +
  '例如：/symptom 腹痛 day 2\n\n' +
  '<b>😴 睡眠</b>\n' +
  '/sleep - 记录入睡、醒来时间和睡眠质量\n' +
  '例如：/sleep 23:30 07:30 好\n' +
  '例如：/sleep 00:45 08:15 一般\n\n' +
  '<b>💪 运动</b>\n' +
  '/workout - 记录运动名称、时长和强度\n' +
  '例如：/workout 跑步 35 中等\n' +
  '例如：/workout 帕梅拉燃脂 20 高强度\n\n' +
  '<b>📦 库存</b>\n' +
  '/stock - 增加或扣减库存\n' +
  '例如：/stock 鸡蛋 +6个 盒马\n' +
  '例如：/stock 鸡蛋 -2个\n\n' +
  '/setstock - 直接校正库存\n' +
  '例如：/setstock 鸡蛋 12个 盒马\n\n' +
  '/check - 查看当前库存\n' +
  '例如：/check\n\n' +
  '<b>🍜 饮食</b>\n' +
  '/food - 记录一餐内容，支持居家称重或外食描述\n' +
  '例如：/food 早餐 280g西兰花+81g鸡小胸\n' +
  '例如：/food 中饭 一碗牛肉粉\n' +
  '餐次前缀可写：早餐/早饭/早，午餐/午饭/中饭/午/中，晚餐/晚饭/晚，加餐/夜宵/宵夜/零食\n\n' +
  '<b>📖 热量参考</b>\n' +
  '/ref - 查看热量参考表\n' +
  '例如：/ref\n' +
  '/ref 关键词 - 按名称或品牌搜索\n' +
  '例如：/ref 鸡蛋';

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
        '我刚才没能顺利处理这条消息。你也可以先继续使用 /help 里的命令。',
        'ai',
        `ai-error=${message}`.slice(0, 500),
        'failed',
      );
    }
  }

  if (
    normalizedText.startsWith('/start') ||
    normalizedText.startsWith('/help')
  ) {
    return buildResult(HELP_MESSAGE, 'command', 'help');
  }

  if (normalizedText.startsWith('/cancel')) {
    const cancelResult = handleCancelPendingAction(timestamp);

    return {
      ...cancelResult,
      handlingMode: 'command',
      note: `slash-cancel; ${cancelResult.note}`.slice(0, 500),
    };
  }

  if (
    normalizedText.startsWith('/weight') ||
    normalizedText.startsWith('/poo') ||
    normalizedText.startsWith('/period') ||
    normalizedText.startsWith('/symptom')
  ) {
    const statusResult = handleStatusCommand(normalizedText, timestamp);

    if (statusResult !== null) {
      return buildResult(statusResult, 'command', 'status-command');
    }
  }

  if (normalizedText.startsWith('/sleep')) {
    const sleepResult = handleSleepCommand(normalizedText, timestamp);

    if (sleepResult !== null) {
      return buildResult(sleepResult, 'command', 'sleep-command');
    }
  }

  if (normalizedText.startsWith('/workout')) {
    const workoutResult = handleWorkoutCommand(normalizedText, timestamp);

    if (workoutResult !== null) {
      return buildResult(workoutResult, 'command', 'workout-command');
    }
  }

  if (
    normalizedText.startsWith('/stock') ||
    normalizedText.startsWith('/setstock') ||
    normalizedText.startsWith('/check')
  ) {
    const stockResult = handleStockCommand(normalizedText, timestamp);

    if (stockResult !== null) {
      return buildResult(stockResult, 'command', 'stock-command');
    }
  }

  if (normalizedText.startsWith('/food')) {
    const foodResult = handleFoodCommand(normalizedText, timestamp);

    if (foodResult !== null) {
      return buildResult(foodResult, 'command', 'food-command');
    }
  }

  if (normalizedText.startsWith('/ref')) {
    const referenceResult = handleReferenceCommand(normalizedText);

    if (referenceResult !== null) {
      return buildResult(referenceResult, 'command', 'reference-command');
    }
  }

  return buildResult(
    '嗯，我听到了。输入 /help 可以查看我可以为你做的事情。',
    'rule',
    'unknown-command',
    'ignored',
  );
}
