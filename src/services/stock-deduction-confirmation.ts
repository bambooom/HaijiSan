import type {
  CommandAuditFields,
  CommandHandlingResult,
  PendingStockDeductionDraft,
} from '../types';
import { foodLogTable, stockTable } from '../tables';
import {
  buildInlineKeyboard,
  createConfirmationId,
  deletePendingConfirmation,
  loadPendingConfirmation,
  savePendingConfirmation,
  type PendingConfirmation,
} from './confirmation-framework';
import { answerCallbackQuery, editText } from './telegram';

type PendingStockDeductionPayload = PendingStockDeductionDraft;

type PendingStockDeductionConfirmation = PendingConfirmation<
  'stock_deduction',
  PendingStockDeductionPayload
>;

function buildAudit(changedFields: string[]): CommandAuditFields {
  return {
    toolCallCount: 1,
    readCount: 0,
    insertCount: 0,
    updateCount: 1,
    readSheetNames: [],
    writeSheetNames: ['FOOD_LOG', 'STOCK'],
    primaryAction: 'updateData',
    primaryTargetSheet: 'FOOD_LOG',
    primarySelectorType: 'row-number',
    primarySelectorValue: '',
    changedFields,
  };
}

function buildResult(
  pending: PendingStockDeductionConfirmation,
  reply: string,
  timestamp: Date,
  overrides?: Partial<CommandHandlingResult>,
): CommandHandlingResult {
  return {
    reply,
    handlingMode: overrides?.handlingMode ?? 'ai',
    status: overrides?.status ?? 'success',
    note: overrides?.note ?? '',
    audit: overrides?.audit,
    traceId: pending.traceId,
    intent: 'food-stock-confirmation',
    tool: 'updateData',
    confirmationState: overrides?.confirmationState ?? 'pending',
    resultCode: overrides?.resultCode ?? 'food-stock-pending',
    telegramResponse: overrides?.telegramResponse,
  };
}

function buildMainKeyboard(id: string) {
  return buildInlineKeyboard([
    [
      { text: '确认扣减', callbackData: `stock:confirm:${id}` },
      { text: '取消', callbackData: `stock:cancel:${id}` },
      { text: '修正', callbackData: `stock:edit:${id}` },
    ],
  ]);
}

function buildEditKeyboard(pending: PendingStockDeductionConfirmation) {
  return buildInlineKeyboard([
    ...pending.payload.candidates.map((candidate, index) => [
      {
        text: `移除 ${candidate.stockItemName}`,
        callbackData: `stock:remove:${index}:${pending.id}`,
      },
    ]),
    [
      { text: '返回', callbackData: `stock:back:${pending.id}` },
      { text: '取消', callbackData: `stock:cancel:${pending.id}` },
    ],
  ]);
}

function buildPreviewText(pending: PendingStockDeductionConfirmation): string {
  const lines = [
    '这条餐食涉及待确认的库存扣减：',
    `餐食：${pending.payload.mealText || '未命名餐食'}`,
    '',
    ...pending.payload.candidates.map(
      (candidate, index) =>
        `${index + 1}. ${candidate.stockItemName} 扣减 ${candidate.stockQuantity}${candidate.stockUnit}（来源：${candidate.itemName} ${candidate.itemQuantity}${candidate.itemUnit}）`,
    ),
  ];

  return lines.join('\n');
}

function buildEditText(pending: PendingStockDeductionConfirmation): string {
  return `${buildPreviewText(pending)}\n\n请选择要移除的扣减项：`;
}

function buildConfirmedText(
  pending: PendingStockDeductionConfirmation,
  reply: string,
): string {
  return `${buildPreviewText(pending)}\n\n状态：已确认\n${reply}`;
}

function buildCancelledText(
  pending: PendingStockDeductionConfirmation,
): string {
  return `${buildPreviewText(pending)}\n\n状态：已取消`;
}

function parseCallbackData(
  data: string,
):
  | { action: 'confirm' | 'cancel' | 'edit' | 'back'; id: string }
  | { action: 'remove'; id: string; index: number }
  | null {
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

  if (parts.length === 4 && parts[0] === 'stock' && parts[1] === 'remove') {
    const index = Number(parts[2]);

    if (Number.isInteger(index) && index >= 0) {
      return { action: 'remove', index, id: parts[3] };
    }
  }

  return null;
}

function appendFoodLogNote(existingNote: string, nextLine: string): string {
  return [existingNote.trim(), nextLine].filter(Boolean).join('\n');
}

function updateFoodLogAfterDecision(
  pending: PendingStockDeductionConfirmation,
  updates: Record<string, unknown>,
): number | null {
  const matchedRow = foodLogTable.findEntryRow(
    (entry) => entry.food_log_id === pending.payload.foodLogId,
  );

  if (!matchedRow) {
    return null;
  }

  foodLogTable.updateAtRow(matchedRow.rowNumber, updates);
  return matchedRow.rowNumber;
}

export function createStockDeductionConfirmation(
  chatId: string,
  traceId: string,
  draft: PendingStockDeductionDraft,
  timestamp: Date,
): CommandHandlingResult {
  const pending: PendingStockDeductionConfirmation = {
    id: createConfirmationId(),
    kind: 'stock_deduction',
    chatId,
    traceId,
    createdAtIso: timestamp.toISOString(),
    previewMessageId: null,
    payload: draft,
  };

  savePendingConfirmation(pending);

  return buildResult(pending, buildPreviewText(pending), timestamp, {
    note: `FOOD_LOG; stock deduction awaiting confirmation`,
    confirmationState: 'pending',
    resultCode: 'food-stock-pending',
    telegramResponse: {
      pendingConfirmationId: pending.id,
      replyMarkup: buildMainKeyboard(pending.id),
    },
  });
}

export function handleStockDeductionConfirmationCallback(
  chatId: string,
  callbackQueryId: string,
  data: string,
  messageId: number,
  timestamp: Date,
): CommandHandlingResult | null {
  const parsed = parseCallbackData(data);

  if (!parsed) {
    return null;
  }

  const pending = loadPendingConfirmation<
    'stock_deduction',
    PendingStockDeductionPayload
  >(parsed.id);

  if (
    !pending ||
    pending.kind !== 'stock_deduction' ||
    pending.chatId !== chatId
  ) {
    answerCallbackQuery(callbackQueryId, '这条确认已失效。');

    return {
      reply: '确认已失效。',
      handlingMode: 'ai',
      status: 'failed',
      note: 'pending stock deduction confirmation not found',
      traceId: '',
      intent: 'food-stock-confirmation',
      tool: 'updateData',
      confirmationState: 'failed',
      resultCode: 'food-stock-confirmation-missing',
    };
  }

  const withMessage =
    pending.previewMessageId === messageId
      ? pending
      : { ...pending, previewMessageId: messageId };
  savePendingConfirmation(withMessage);

  switch (parsed.action) {
    case 'confirm': {
      const adjustedIds: string[] = [];

      withMessage.payload.candidates.forEach((candidate) => {
        const result = stockTable.adjustStock(
          timestamp,
          candidate.stockItemName,
          -candidate.stockQuantity,
          candidate.stockUnit,
          undefined,
          undefined,
        );

        if (result.ok) {
          adjustedIds.push(candidate.stockItemId);
        }
      });

      const matchedRow = foodLogTable.findEntryRow(
        (entry) => entry.food_log_id === withMessage.payload.foodLogId,
      );
      const existingIds = matchedRow?.entry.linked_stock_item_ids
        ? matchedRow.entry.linked_stock_item_ids
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      const nextIds = Array.from(new Set(existingIds.concat(adjustedIds)));
      const nextNote = appendFoodLogNote(
        matchedRow?.entry.note ?? '',
        `库存扣减已确认：${withMessage.payload.candidates
          .map(
            (candidate) =>
              `${candidate.stockItemName} -${candidate.stockQuantity}${candidate.stockUnit}`,
          )
          .join('；')}`,
      );

      updateFoodLogAfterDecision(withMessage, {
        linked_stock_item_ids: nextIds.join(', '),
        note: nextNote,
      });

      answerCallbackQuery(callbackQueryId, '已确认扣减');
      editText(
        chatId,
        messageId,
        buildConfirmedText(withMessage, '已按确认内容更新库存。'),
      );
      deletePendingConfirmation(withMessage.id);

      return buildResult(withMessage, '已按确认内容更新库存。', timestamp, {
        note: 'FOOD_LOG; stock deduction confirmed',
        confirmationState: 'confirmed',
        resultCode: 'food-stock-confirmed',
        audit: buildAudit(['linked_stock_item_ids', 'note']),
      });
    }
    case 'cancel': {
      const matchedRow = foodLogTable.findEntryRow(
        (entry) => entry.food_log_id === withMessage.payload.foodLogId,
      );
      updateFoodLogAfterDecision(withMessage, {
        note: appendFoodLogNote(
          matchedRow?.entry.note ?? '',
          `库存扣减已取消：${withMessage.payload.candidates
            .map(
              (candidate) =>
                `${candidate.stockItemName} -${candidate.stockQuantity}${candidate.stockUnit}`,
            )
            .join('；')}`,
        ),
      });

      answerCallbackQuery(callbackQueryId, '已取消');
      editText(chatId, messageId, buildCancelledText(withMessage));
      deletePendingConfirmation(withMessage.id);

      return buildResult(withMessage, '已取消这次库存扣减。', timestamp, {
        note: 'FOOD_LOG; stock deduction cancelled',
        confirmationState: 'cancelled',
        resultCode: 'food-stock-cancelled',
        audit: buildAudit(['note']),
      });
    }
    case 'edit':
      answerCallbackQuery(callbackQueryId, '请选择要移除的扣减项');
      editText(chatId, messageId, buildEditText(withMessage), {
        replyMarkup: buildEditKeyboard(withMessage),
      });

      return buildResult(withMessage, '进入库存扣减修正模式。', timestamp, {
        note: 'FOOD_LOG; stock deduction editing',
        confirmationState: 'pending',
        resultCode: 'food-stock-editing',
      });
    case 'back':
      answerCallbackQuery(callbackQueryId, '已返回确认视图');
      editText(chatId, messageId, buildPreviewText(withMessage), {
        replyMarkup: buildMainKeyboard(withMessage.id),
      });

      return buildResult(withMessage, '已返回库存扣减确认视图。', timestamp, {
        note: 'FOOD_LOG; stock deduction back to preview',
        confirmationState: 'pending',
        resultCode: 'food-stock-preview',
      });
    case 'remove': {
      const nextCandidates = withMessage.payload.candidates.filter(
        (_candidate, index) => index !== parsed.index,
      );

      if (nextCandidates.length === 0) {
        const cancelledPending = {
          ...withMessage,
          payload: {
            ...withMessage.payload,
            candidates: nextCandidates,
          },
        };

        answerCallbackQuery(callbackQueryId, '已移除全部待扣减项');
        editText(
          chatId,
          messageId,
          '这次库存扣减的候选项已全部移除。\n\n状态：已取消',
        );
        deletePendingConfirmation(withMessage.id);
        updateFoodLogAfterDecision(withMessage, {
          note: appendFoodLogNote(
            foodLogTable.findEntryRow(
              (entry) => entry.food_log_id === withMessage.payload.foodLogId,
            )?.entry.note ?? '',
            '库存扣减已取消：用户移除了全部待确认项',
          ),
        });

        return buildResult(
          cancelledPending,
          '已取消这次库存扣减。',
          timestamp,
          {
            note: 'FOOD_LOG; stock deduction cancelled after removing all items',
            confirmationState: 'cancelled',
            resultCode: 'food-stock-cancelled',
            audit: buildAudit(['note']),
          },
        );
      }

      const nextPending: PendingStockDeductionConfirmation = {
        ...withMessage,
        payload: {
          ...withMessage.payload,
          candidates: nextCandidates,
        },
      };

      savePendingConfirmation(nextPending);
      answerCallbackQuery(callbackQueryId, '已移除该扣减项');
      editText(chatId, messageId, buildEditText(nextPending), {
        replyMarkup: buildEditKeyboard(nextPending),
      });

      return buildResult(nextPending, '已更新待确认扣减项。', timestamp, {
        note: 'FOOD_LOG; stock deduction candidate removed',
        confirmationState: 'pending',
        resultCode: 'food-stock-edited',
      });
    }
  }
}
