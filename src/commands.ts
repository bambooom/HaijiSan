import { bodyLogRepository, statusLogRepository } from './repositories';
import { handleStockCommand } from './handlers/stock';

const HELP_MESSAGE =
  '你好，我是清濑灰二。很高兴能协助你管理状态。目前支持：\n\n' +
  '<b>🏃 身体记录</b>\n' +
  '/weight 55 - 记录体重\n' +
  '/poo - 记录代谢情况\n\n' +
  '<b>📦 物资管理</b>\n' +
  '/stock 鸡蛋 +6个 盒马 - 增加库存\n' +
  '/stock 鸡蛋 -2个 - 扣减库存\n' +
  '/setstock 鸡蛋 12个 盒马 - 手动校正库存\n' +
  '/check - 查看当前冰箱库存\n\n' +
  '<b>📖 参考</b>\n' +
  '/ref - 查看热量参考表\n\n' +
  '你可以直接点击指令或输入对应文字。';

function appendBodyStatus(timestamp: Date, weight: string): string {
  bodyLogRepository.logWeight(timestamp, weight);
  return `✅ 体重 ${weight}kg 已记录。稳住节奏，清晨的空气正适合奔跑。`;
}

function appendMetabolismStatus(timestamp: Date): string {
  statusLogRepository.logBowel(timestamp);
  return '✅ 代谢记录完毕。身体越轻盈，心情也会越透彻。';
}

export function handleCommand(text: string, timestamp: Date): string {
  if (text.startsWith('/start') || text.startsWith('/help')) {
    return HELP_MESSAGE;
  }

  if (text.startsWith('/weight') || text.includes('体重')) {
    const weight = text.match(/\d+(\.\d+)?/);

    if (!weight) {
      return '请输入正确的体重数字，例如：/weight 55';
    }

    return appendBodyStatus(timestamp, weight[0]);
  }

  if (text.startsWith('/poo') || text.includes('拉屎')) {
    return appendMetabolismStatus(timestamp);
  }

  const stockResult = handleStockCommand(text, timestamp);

  if (stockResult !== null) {
    return stockResult;
  }

  return '嗯，我听到了。输入 /help 可以查看我可以为你做的事情。';
}
