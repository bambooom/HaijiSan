import type {
  CommandHandlingResult,
  PendingStockDeductionConfirmation,
  PendingStockDeductionDraft,
  PendingStockDeductionPayload,
} from '../../../types';
import { foodLogTable, stockTable } from '../../../tables';
import {
  consumeConfirmationPromptMapping,
  createConfirmationId,
  deletePendingConfirmation,
  loadPendingConfirmation,
  saveConfirmationPromptMapping,
  savePendingConfirmation,
} from '../core';
import {
  appendEditCancelledNote,
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
  buildStockForceReplyMarkup,
  buildStockMainKeyboard,
  buildStockPreviewText,
  parseStockCallbackData,
} from './ui';
import { answerCallbackQuery, editText, sendText } from '../../telegram';
import { roundToOneDecimal } from '../../../utils/value';

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
    payload: {
      ...draft,
      editPromptMessageId: null,
      awaitingCandidateIndex: null,
    },
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
      answerCallbackQuery(callbackQueryId, '请选择要修改的扣减项');
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
    case 'item': {
      const targetCandidate = withMessage.payload.candidates[parsed.index];

      if (!targetCandidate) {
        answerCallbackQuery(callbackQueryId, '这项待扣减内容已不存在');

        return buildStockResult(withMessage, '库存扣减修正项不存在。', {
          note: 'FOOD_LOG; stock deduction candidate missing during edit',
          confirmationState: 'pending',
          resultCode: 'food-stock-edit-missing',
          status: 'failed',
        });
      }

      const promptMessageId = sendText(
        chatId,
        `请输入 ${targetCandidate.stockItemName} 新的扣减数量（单位：${targetCandidate.stockUnit}），例如 ${roundToOneDecimal(targetCandidate.stockQuantity)}；输入 0 可取消这一项。`,
        {
          replyMarkup: buildStockForceReplyMarkup(
            targetCandidate.stockUnit,
            roundToOneDecimal(targetCandidate.stockQuantity),
          ),
        },
      );
      const nextPending: PendingStockDeductionConfirmation = {
        ...withMessage,
        payload: {
          ...withMessage.payload,
          awaitingCandidateIndex: parsed.index,
          editPromptMessageId: promptMessageId,
        },
      };

      savePendingConfirmation(nextPending);
      answerCallbackQuery(callbackQueryId, '请输入新的扣减数量');

      if (promptMessageId !== null) {
        saveConfirmationPromptMapping(chatId, promptMessageId, nextPending.id);
      }

      return buildStockResult(nextPending, '等待库存扣减数量输入。', {
        note: 'FOOD_LOG; awaiting stock deduction quantity input',
        confirmationState: 'pending',
        resultCode: 'food-stock-awaiting-input',
      });
    }
  }
}

export function handleStockDeductionConfirmationReply(
  chatId: string,
  replyToMessageId: number,
  text: string,
  _timestamp: Date,
): CommandHandlingResult | null {
  const confirmationId = consumeConfirmationPromptMapping(
    chatId,
    replyToMessageId,
  );

  if (!confirmationId) {
    return null;
  }

  const pending = loadPendingConfirmation<
    'stock_deduction',
    PendingStockDeductionPayload
  >(confirmationId);

  if (
    !pending ||
    pending.chatId !== chatId ||
    pending.payload.awaitingCandidateIndex === null
  ) {
    return null;
  }

  const parsedQuantity = Number(text.trim());

  if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
    const candidate =
      pending.payload.candidates[pending.payload.awaitingCandidateIndex];
    const nextPromptId = sendText(
      chatId,
      `数量格式不对，请输入数字。单位是 ${candidate?.stockUnit ?? '当前库存单位'}，例如 ${candidate ? roundToOneDecimal(candidate.stockQuantity) : 1}；输入 0 可取消这一项。`,
      {
        replyMarkup: buildStockForceReplyMarkup(
          candidate?.stockUnit ?? '',
          candidate ? roundToOneDecimal(candidate.stockQuantity) : 1,
        ),
      },
    );

    if (nextPromptId !== null) {
      saveConfirmationPromptMapping(chatId, nextPromptId, pending.id);
    }

    savePendingConfirmation({
      ...pending,
      payload: {
        ...pending.payload,
        editPromptMessageId: nextPromptId,
      },
    });

    return buildStockResult(pending, '库存扣减数量输入无效。', {
      status: 'failed',
      note: 'FOOD_LOG; invalid stock deduction quantity input',
      confirmationState: 'pending',
      resultCode: 'food-stock-invalid-input',
    });
  }

  const nextQuantity = roundToOneDecimal(parsedQuantity);
  const nextCandidates = pending.payload.candidates.flatMap(
    (candidate, index) => {
      if (index !== pending.payload.awaitingCandidateIndex) {
        return [candidate];
      }

      if (nextQuantity <= 0) {
        return [];
      }

      return [
        {
          ...candidate,
          stockQuantity: nextQuantity,
        },
      ];
    },
  );

  if (nextCandidates.length === 0) {
    const cancelledPending: PendingStockDeductionConfirmation = {
      ...pending,
      payload: {
        ...pending.payload,
        candidates: [],
        awaitingCandidateIndex: null,
        editPromptMessageId: null,
      },
    };

    if (pending.previewMessageId !== null) {
      editText(
        chatId,
        pending.previewMessageId,
        '这次库存扣减的候选项数量都已调整为 0。\n\n状态：已取消',
      );
    }

    deletePendingConfirmation(pending.id);
    updateFoodLogAfterDecision(pending, {
      note: appendEditCancelledNote(pending),
    });

    return buildStockResult(cancelledPending, '已取消这次库存扣减。', {
      note: 'FOOD_LOG; stock deduction cancelled after editing all items to zero',
      confirmationState: 'cancelled',
      resultCode: 'food-stock-cancelled',
      audit: buildStockAudit(['note']),
    });
  }

  const nextPending: PendingStockDeductionConfirmation = {
    ...pending,
    payload: {
      ...pending.payload,
      candidates: nextCandidates,
      awaitingCandidateIndex: null,
      editPromptMessageId: null,
    },
  };

  savePendingConfirmation(nextPending);

  if (nextPending.previewMessageId !== null) {
    editText(
      chatId,
      nextPending.previewMessageId,
      buildStockPreviewText(nextPending),
      { replyMarkup: buildStockMainKeyboard(nextPending.id) },
    );
  }

  sendText(chatId, '已更新扣减数量，请确认或继续修正。');

  return buildStockResult(nextPending, '已更新扣减数量，请确认或继续修正。', {
    note: 'FOOD_LOG; stock deduction quantity updated',
    confirmationState: 'pending',
    resultCode: 'food-stock-edited',
  });
}
