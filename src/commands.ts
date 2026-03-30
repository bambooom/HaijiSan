import { handleFoodCommand } from './handlers/food';
import { handleSleepCommand } from './handlers/sleep';
import { handleStatusCommand } from './handlers/status';
import { handleStockCommand } from './handlers/stock';
import { handleWorkoutCommand } from './handlers/workout';

const HELP_MESSAGE =
  '你好，我是清濑灰二。很高兴能协助你管理状态。目前支持：\n\n' +
  '<b>🏃 身体记录</b>\n' +
  '/weight 55 - 记录体重\n' +
  '/poo - 记录代谢情况\n\n' +
  '<b>😴 睡眠记录</b>\n' +
  '/sleep 23:30 07:30 好 - 记录睡眠\n\n' +
  '<b>💪 运动记录</b>\n' +
  '/workout 跑步 35 中等 - 记录运动\n\n' +
  '<b>🩺 状态记录</b>\n' +
  '/period - 记录经期开始\n' +
  '/period 2 - 记录经期第 2 天\n' +
  '/symptom 头痛 - 记录症状\n\n' +
  '<b>📦 物资管理</b>\n' +
  '/stock 鸡蛋 +6个 盒马 - 增加库存\n' +
  '/stock 鸡蛋 -2个 - 扣减库存\n' +
  '/setstock 鸡蛋 12个 盒马 - 手动校正库存\n' +
  '/check - 查看当前冰箱库存\n\n' +
  '<b>🍜 饮食记录</b>\n' +
  '/food 早餐 280g西兰花+81g鸡小胸 - 记录居家饮食\n' +
  '/food 中饭 一碗牛肉粉 - 记录外食描述\n' +
  '/food 夜宵 一杯酸奶 - 记录加餐或宵夜\n' +
  '餐次前缀可写：早餐/早饭/早，午餐/午饭/中饭/午/中，晚餐/晚饭/晚，加餐/夜宵/宵夜/零食\n\n' +
  '<b>📖 参考</b>\n' +
  '/ref - 查看热量参考表\n\n' +
  '你可以直接点击指令或输入对应斜杠命令。';

export function handleCommand(text: string, timestamp: Date): string {
  const normalizedText = text.trimStart();

  if (!normalizedText.startsWith('/')) {
    return '嗯，我听到了。输入 /help 可以查看我可以为你做的事情。';
  }

  if (
    normalizedText.startsWith('/start') ||
    normalizedText.startsWith('/help')
  ) {
    return HELP_MESSAGE;
  }

  if (
    normalizedText.startsWith('/weight') ||
    normalizedText.startsWith('/poo') ||
    normalizedText.startsWith('/period') ||
    normalizedText.startsWith('/symptom')
  ) {
    const statusResult = handleStatusCommand(normalizedText, timestamp);

    if (statusResult !== null) {
      return statusResult;
    }
  }

  if (normalizedText.startsWith('/sleep')) {
    const sleepResult = handleSleepCommand(normalizedText, timestamp);

    if (sleepResult !== null) {
      return sleepResult;
    }
  }

  if (normalizedText.startsWith('/workout')) {
    const workoutResult = handleWorkoutCommand(normalizedText, timestamp);

    if (workoutResult !== null) {
      return workoutResult;
    }
  }

  if (
    normalizedText.startsWith('/stock') ||
    normalizedText.startsWith('/setstock') ||
    normalizedText.startsWith('/check')
  ) {
    const stockResult = handleStockCommand(normalizedText, timestamp);

    if (stockResult !== null) {
      return stockResult;
    }
  }

  if (normalizedText.startsWith('/food')) {
    const foodResult = handleFoodCommand(normalizedText, timestamp);

    if (foodResult !== null) {
      return foodResult;
    }
  }

  return '嗯，我听到了。输入 /help 可以查看我可以为你做的事情。';
}
