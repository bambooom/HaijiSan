import { stockRepository } from '../repositories';
import {
  buildSetStockMessage,
  buildStockAdjustMessage,
  buildStockListMessage,
  parseStockCommand,
} from '../utils/stock-command';

export function handleStockCommand(
  text: string,
  timestamp: Date,
): string | null {
  const normalizedText = text.trimStart();

  if (normalizedText.startsWith('/stock')) {
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

  if (normalizedText.startsWith('/setstock')) {
    const parsed = parseStockCommand(normalizedText, '/setstock');

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

  if (normalizedText.startsWith('/check')) {
    return buildStockListMessage();
  }

  return null;
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
