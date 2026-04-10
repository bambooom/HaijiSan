import type {
  CommandHandlingResult,
  PendingStockDeductionConfirmation,
  PendingStockDeductionDraft,
} from '../../../types';
import { foodLogTable, stockTable } from '../../../tables';
import {
  createConfirmationId,
  deletePendingConfirmation,
  loadPendingConfirmation,
  savePendingConfirmation,
} from '../core';
import {
  appendRemovalCancelledNote,
  buildCancelledNote,
  buildConfirmedNote,
  buildStockAudit,
  buildStockResult,
  updateFoodLogAfterDecision,
} from './helper';
import {
  appendFoodLogNote,
  buildStockCancelledText,
  buildStockConfirmedText,
  buildStockEditKeyboard,
  buildStockEditText,
  buildStockMainKeyboard,
  buildStockPreviewText,
  parseStockCallbackData,
} from './ui';
import { answerCallbackQuery, editText } from '../../telegram';

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

  return buildStockResult(pending, buildStockPreviewText(pending), {
    note: 'FOOD_LOG; stock deduction awaiting confirmation',
    confirmationState: 'pending',
    resultCode: 'food-stock-pending',
    telegramResponse: {
      pendingConfirmationId: pending.id,
      replyMarkup: buildStockMainKeyboard(pending.id),
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
  const parsed = parseStockCallbackData(data);

  if (!parsed) {
    return null;
  }

  const pending = loadPendingConfirmation<
    'stock_deduction',
    PendingStockDeductionDraft
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
        buildConfirmedNote(withMessage),
      );

      updateFoodLogAfterDecision(withMessage, {
        linked_stock_item_ids: nextIds.join(', '),
        note: nextNote,
      });

      answerCallbackQuery(callbackQueryId, '已确认扣减');
      editText(
        chatId,
        messageId,
        buildStockConfirmedText(withMessage, '已按确认内容更新库存。'),
      );
      deletePendingConfirmation(withMessage.id);

      return buildStockResult(withMessage, '已按确认内容更新库存。', {
        note: 'FOOD_LOG; stock deduction confirmed',
        confirmationState: 'confirmed',
        resultCode: 'food-stock-confirmed',
        audit: buildStockAudit(['linked_stock_item_ids', 'note']),
      });
    }
    case 'cancel': {
      const matchedRow = foodLogTable.findEntryRow(
        (entry) => entry.food_log_id === withMessage.payload.foodLogId,
      );
      updateFoodLogAfterDecision(withMessage, {
        note: appendFoodLogNote(
          matchedRow?.entry.note ?? '',
          buildCancelledNote(withMessage),
        ),
      });

      answerCallbackQuery(callbackQueryId, '已取消');
      editText(chatId, messageId, buildStockCancelledText(withMessage));
      deletePendingConfirmation(withMessage.id);

      return buildStockResult(withMessage, '已取消这次库存扣减。', {
        note: 'FOOD_LOG; stock deduction cancelled',
        confirmationState: 'cancelled',
        resultCode: 'food-stock-cancelled',
        audit: buildStockAudit(['note']),
      });
    }
    case 'edit':
      answerCallbackQuery(callbackQueryId, '请选择要移除的扣减项');
      editText(chatId, messageId, buildStockEditText(withMessage), {
        replyMarkup: buildStockEditKeyboard(withMessage),
      });

      return buildStockResult(withMessage, '进入库存扣减修正模式。', {
        note: 'FOOD_LOG; stock deduction editing',
        confirmationState: 'pending',
        resultCode: 'food-stock-editing',
      });
    case 'back':
      answerCallbackQuery(callbackQueryId, '已返回确认视图');
      editText(chatId, messageId, buildStockPreviewText(withMessage), {
        replyMarkup: buildStockMainKeyboard(withMessage.id),
      });

      return buildStockResult(withMessage, '已返回库存扣减确认视图。', {
        note: 'FOOD_LOG; stock deduction back to preview',
        confirmationState: 'pending',
        resultCode: 'food-stock-preview',
      });
    case 'remove': {
      const nextCandidates = withMessage.payload.candidates.filter(
        (_candidate, index) => index !== parsed.index,
      );

      if (nextCandidates.length === 0) {
        const cancelledPending: PendingStockDeductionConfirmation = {
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
          note: appendRemovalCancelledNote(withMessage),
        });

        return buildStockResult(cancelledPending, '已取消这次库存扣减。', {
          note: 'FOOD_LOG; stock deduction cancelled after removing all items',
          confirmationState: 'cancelled',
          resultCode: 'food-stock-cancelled',
          audit: buildStockAudit(['note']),
        });
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
      editText(chatId, messageId, buildStockEditText(nextPending), {
        replyMarkup: buildStockEditKeyboard(nextPending),
      });

      return buildStockResult(nextPending, '已更新待确认扣减项。', {
        note: 'FOOD_LOG; stock deduction candidate removed',
        confirmationState: 'pending',
        resultCode: 'food-stock-edited',
      });
    }
  }
}
