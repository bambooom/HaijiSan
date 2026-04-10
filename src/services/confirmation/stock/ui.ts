import type {
  PendingStockDeductionCandidate,
  PendingStockDeductionConfirmation,
  StockCallbackData,
} from '../../../types';
import { buildForceReply, buildInlineKeyboard } from '../core';

export function buildStockMainKeyboard(id: string) {
  return buildInlineKeyboard([
    [
      { text: '确认扣减', callbackData: `stock:confirm:${id}` },
      { text: '取消', callbackData: `stock:cancel:${id}` },
      { text: '修正', callbackData: `stock:edit:${id}` },
    ],
  ]);
}

export function buildStockEditKeyboard(
  pending: PendingStockDeductionConfirmation,
) {
  return buildInlineKeyboard([
    ...pending.payload.candidates.map((candidate, index) => [
      {
        text: `修改 ${candidate.stockItemName}（当前 ${candidate.stockQuantity}${candidate.stockUnit}）`,
        callbackData: `stock:item:${index}:${pending.id}`,
      },
    ]),
    [
      { text: '返回', callbackData: `stock:back:${pending.id}` },
      { text: '取消', callbackData: `stock:cancel:${pending.id}` },
    ],
  ]);
}

export function buildStockPreviewText(
  pending: PendingStockDeductionConfirmation,
): string {
  const lines = [
    '餐食已记录，库存扣减待你确认。',
    `餐食：${pending.payload.mealText || '未命名餐食'}`,
    '',
    ...pending.payload.candidates.map(
      (candidate, index) =>
        `${index + 1}. ${candidate.stockItemName} 扣减 ${candidate.stockQuantity}${candidate.stockUnit}（来源：${candidate.itemName} ${candidate.itemQuantity}${candidate.itemUnit}）`,
    ),
  ];

  return lines.join('\n');
}

export function buildStockEditText(
  pending: PendingStockDeductionConfirmation,
): string {
  return `${buildStockPreviewText(pending)}\n\n请选择要修改数量的扣减项：`;
}

export function buildStockForceReplyMarkup(
  stockUnit: string,
  exampleQuantity: number,
) {
  return buildForceReply(
    `请输入新的扣减数量（${stockUnit}），例如 ${exampleQuantity}；输入 0 可取消这一项`,
  );
}

export function buildStockConfirmedText(
  pending: PendingStockDeductionConfirmation,
  reply: string,
): string {
  return `${buildStockPreviewText(pending)}\n\n状态：已确认\n${reply}`;
}

export function buildStockCancelledText(
  pending: PendingStockDeductionConfirmation,
): string {
  return `${buildStockPreviewText(pending)}\n\n状态：已取消`;
}

export function parseStockCallbackData(data: string): StockCallbackData | null {
  const parts = data.split(':');

  if (parts.length === 3 && parts[0] === 'stock') {
    const action = parts[1];

    if (
      action === 'confirm' ||
      action === 'cancel' ||
      action === 'edit' ||
      action === 'back'
    ) {
      return { action, id: parts[2] };
    }
  }

  if (parts.length === 4 && parts[0] === 'stock' && parts[1] === 'item') {
    const index = Number(parts[2]);

    if (Number.isInteger(index) && index >= 0) {
      return { action: 'item', index, id: parts[3] };
    }
  }

  return null;
}

export function appendFoodLogNote(
  existingNote: string,
  nextLine: string,
): string {
  return [existingNote.trim(), nextLine].filter(Boolean).join('\n');
}

export function formatStockCandidateSummary(
  candidate: PendingStockDeductionCandidate,
): string {
  return `${candidate.stockItemName} -${candidate.stockQuantity}${candidate.stockUnit}`;
}
