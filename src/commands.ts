import {
  bodyLogRepository,
  stockRepository,
  statusLogRepository,
} from './repositories';
import type { StockAdjustResult, StockListItem } from './repositories';

type ParsedStockCommand = {
  name: string;
  quantity: string;
  unit?: string;
  purchaseChannel?: string;
};

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

function parseStockCommand(
  text: string,
  command: '/stock' | '/setstock',
): ParsedStockCommand | null {
  const rawContent = text.slice(command.length).trim();

  if (!rawContent) {
    return null;
  }

  const parts = rawContent.split(/\s+/);

  if (parts.length < 2) {
    return null;
  }

  const quantityIndex = parts.findIndex((part) => {
    return /^[+-]?\d+(\.\d+)?(.*)?$/.test(part);
  });

  if (quantityIndex <= 0) {
    return null;
  }

  const quantityMatch = parts[quantityIndex].match(/^([+-]?\d+(\.\d+)?)(.*)$/);

  if (!quantityMatch) {
    return null;
  }

  const quantityToken = quantityMatch[1];
  const name = parts.slice(0, quantityIndex).join(' ');
  const attachedUnit = quantityMatch[3]?.trim() ?? '';
  const trailingParts = parts.slice(quantityIndex + 1);

  let unit = attachedUnit || undefined;
  let purchaseChannel: string | undefined;

  if (!unit) {
    const separatedUnit = trailingParts[0]?.trim();

    if (!separatedUnit) {
      return null;
    }

    unit = separatedUnit;
    purchaseChannel = trailingParts.slice(1).join(' ').trim() || undefined;
  } else {
    purchaseChannel = trailingParts.join(' ').trim() || undefined;
  }

  return {
    name,
    quantity: quantityToken,
    unit,
    purchaseChannel,
  };
}

function appendStock(
  timestamp: Date,
  name: string,
  amount: string,
  unit?: string,
  purchaseChannel?: string,
): string {
  const delta = Number(amount);
  const result = stockRepository.adjustStock(
    timestamp,
    name,
    delta,
    unit,
    purchaseChannel,
  );

  return buildStockAdjustMessage(name, amount, result, purchaseChannel);
}

function setStock(
  timestamp: Date,
  name: string,
  amount: string,
  unit?: string,
  purchaseChannel?: string,
): string {
  const quantity = Number(amount);
  const result = stockRepository.setStock(
    timestamp,
    name,
    quantity,
    unit,
    purchaseChannel,
  );

  return buildSetStockMessage(name, amount, result, purchaseChannel);
}

function buildStockAdjustMessage(
  name: string,
  amount: string,
  result: StockAdjustResult,
  purchaseChannel?: string,
): string {
  if (!result.ok) {
    if (result.reason === 'not-found') {
      return `❌ ${name} 目前不存在，不能直接扣减。请先使用正数库存创建它。`;
    }

    if (result.reason === 'negative-stock') {
      return `❌ ${name} 库存不足，当前只有 ${result.currentQuantity ?? 0}，不能变成负数。`;
    }

    return '❌ 库存变更格式错误。请使用：/stock 鸡蛋 +6 或 /stock 鸡蛋 -2';
  }

  if (result.operation === 'create') {
    return `✅ ${name} 已创建，当前库存 ${result.quantity}${result.entry.unit}${buildPurchaseChannelSuffix(purchaseChannel)}。`;
  }

  return `✅ ${name} ${amount} 已记录，当前库存 ${result.quantity}${result.entry.unit}${buildPurchaseChannelSuffix(purchaseChannel)}。`;
}

function buildSetStockMessage(
  name: string,
  amount: string,
  result: StockAdjustResult,
  purchaseChannel?: string,
): string {
  if (!result.ok) {
    if (result.reason === 'invalid-quantity') {
      return '❌ 校正库存必须是大于等于 0 的数字。请使用：/setstock 鸡蛋 12 个';
    }

    return '❌ 库存校正格式错误。请使用：/setstock 鸡蛋 12 个';
  }

  return `✅ ${name} 库存已校正为 ${amount}${result.entry.unit}${buildPurchaseChannelSuffix(purchaseChannel)}。`;
}

function buildPurchaseChannelSuffix(purchaseChannel?: string): string {
  if (!purchaseChannel) {
    return '';
  }

  return `，购买渠道已记为 ${purchaseChannel}`;
}

function buildStockList(): string {
  const entries = stockRepository
    .listStock()
    .map((item: StockListItem) => `• ${item.name}: ${item.amount}`);

  if (entries.length === 0) {
    return '仓库目前是空的，需要去超市采购吗？';
  }

  return `📦 当前库存清单：\n${entries.join('\n')}`;
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

  if (text.startsWith('/stock') || text.startsWith('库存')) {
    const normalizedText = text.startsWith('库存')
      ? text.replace(/^库存\s*/, '/stock ')
      : text;
    const parsed = parseStockCommand(normalizedText, '/stock');

    if (!parsed) {
      return '格式错误。请使用：/stock 鸡蛋 +6个 盒马 或 /stock 鸡蛋 -2个';
    }

    if (!/^[+-]\d+(\.\d+)?$/.test(parsed.quantity)) {
      return '格式错误。请使用带符号的数量，例如：/stock 鸡蛋 +6个 盒马 或 /stock 鸡蛋 -2个';
    }

    return appendStock(
      timestamp,
      parsed.name,
      parsed.quantity,
      parsed.unit,
      parsed.purchaseChannel,
    );
  }

  if (text.startsWith('/setstock')) {
    const parsed = parseStockCommand(text, '/setstock');

    if (!parsed) {
      return '格式错误。请使用：/setstock 鸡蛋 12个 盒马';
    }

    if (!/^\d+(\.\d+)?$/.test(parsed.quantity)) {
      return '格式错误。请使用非负数字，例如：/setstock 鸡蛋 12个 盒马';
    }

    return setStock(
      timestamp,
      parsed.name,
      parsed.quantity,
      parsed.unit,
      parsed.purchaseChannel,
    );
  }

  if (text.startsWith('/check')) {
    return buildStockList();
  }

  return '嗯，我听到了。输入 /help 可以查看我可以为你做的事情。';
}
