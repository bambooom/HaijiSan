import { executeInsertData, executeUpdateData } from '../../../tools';
import type {
  CommandHandlingResult,
  NutritionRequest,
  PendingOcrConfirmation,
  PendingOcrPayload,
} from '../../../types';
import {
  consumeConfirmationPromptMapping,
  createConfirmationId,
  deletePendingConfirmation,
  loadPendingConfirmation,
  saveConfirmationPromptMapping,
  savePendingConfirmation,
} from '../core';
import { buildOcrAudit, buildOcrResult, updatePendingCalories } from './helper';
import {
  buildOcrCancelledText,
  buildOcrConfirmedText,
  buildOcrEditKeyboard,
  buildOcrEditText,
  buildOcrForceReplyMarkup,
  buildOcrMainKeyboard,
  buildOcrPreviewText,
  getFoodName,
  parseOcrCallbackData,
} from './ui';
import { answerCallbackQuery, editText, sendText } from '../../telegram';
import { validateNutritionRequest } from '../../validation/domain';

export function createNutritionLabelConfirmation(
  chatId: string,
  traceId: string,
  request: NutritionRequest,
  timestamp: Date,
): CommandHandlingResult {
  const pending: PendingOcrConfirmation = {
    id: createConfirmationId(),
    kind: 'nutrition_label',
    chatId,
    traceId,
    createdAtIso: timestamp.toISOString(),
    previewMessageId: null,
    payload: {
      request,
      editPromptMessageId: null,
      awaitingField: null,
    },
  };

  savePendingConfirmation(pending);

  return buildOcrResult(pending, buildOcrPreviewText(pending), {
    note: `${request.sheet}; awaiting confirmation`,
    confirmationState: 'pending',
    resultCode: 'image-ocr-pending',
    telegramResponse: {
      pendingConfirmationId: pending.id,
      replyMarkup: buildOcrMainKeyboard(pending.id),
    },
  });
}

export function handleOcrConfirmationCallback(
  chatId: string,
  callbackQueryId: string,
  data: string,
  messageId: number,
  timestamp: Date,
): CommandHandlingResult | null {
  const parsed = parseOcrCallbackData(data);

  if (!parsed) {
    return null;
  }

  const pending = loadPendingConfirmation<'nutrition_label', PendingOcrPayload>(
    parsed.id,
  );

  if (!pending || pending.chatId !== chatId) {
    answerCallbackQuery(callbackQueryId, '这条确认已失效。');

    return {
      reply: '确认已失效。',
      handlingMode: 'ai',
      status: 'failed',
      note: 'pending OCR confirmation not found',
      traceId: '',
      intent: 'image-ocr',
      tool: '',
      confirmationState: 'failed',
      resultCode: 'image-ocr-confirmation-missing',
    };
  }

  const withMessage =
    pending.previewMessageId === messageId
      ? pending
      : { ...pending, previewMessageId: messageId };
  savePendingConfirmation(withMessage);

  switch (parsed.action) {
    case 'confirm': {
      const validationErrors = validateNutritionRequest(
        withMessage.payload.request,
      );

      if (validationErrors.length > 0) {
        answerCallbackQuery(callbackQueryId, '校验失败，请先修正数据');

        return buildOcrResult(withMessage, '确认前校验失败，请先修正数据。', {
          status: 'failed',
          note: `${withMessage.payload.request.sheet}; validation failed; ${validationErrors.join('; ')}`,
          confirmationState: 'pending',
          resultCode: 'image-ocr-validation-failed',
        });
      }

      const committedReply =
        withMessage.payload.request.tool === 'updateData'
          ? `已更新热量参考：${getFoodName(withMessage.payload.request)}。`
          : `已记录热量参考：${getFoodName(withMessage.payload.request)}。`;

      if (withMessage.payload.request.tool === 'updateData') {
        const executionResult = executeUpdateData(
          withMessage.payload.request,
          timestamp,
        );

        answerCallbackQuery(callbackQueryId, '已确认');
        editText(
          chatId,
          messageId,
          buildOcrConfirmedText(withMessage, committedReply),
        );
        deletePendingConfirmation(withMessage.id);

        return buildOcrResult(withMessage, committedReply, {
          note: `${withMessage.payload.request.sheet}; confirmed`,
          confirmationState: 'confirmed',
          resultCode: 'image-ocr-confirmed',
          audit: buildOcrAudit(
            withMessage.payload.request,
            Object.keys(executionResult.updates).sort(),
          ),
        });
      }

      const executionResult = executeInsertData(
        withMessage.payload.request,
        timestamp,
      );

      answerCallbackQuery(callbackQueryId, '已确认');
      editText(
        chatId,
        messageId,
        buildOcrConfirmedText(withMessage, committedReply),
      );
      deletePendingConfirmation(withMessage.id);

      return buildOcrResult(withMessage, committedReply, {
        note: `${withMessage.payload.request.sheet}; confirmed`,
        confirmationState: 'confirmed',
        resultCode: 'image-ocr-confirmed',
        audit: buildOcrAudit(
          withMessage.payload.request,
          Object.keys(executionResult.record).sort(),
        ),
      });
    }
    case 'cancel':
      answerCallbackQuery(callbackQueryId, '已取消');
      editText(chatId, messageId, buildOcrCancelledText(withMessage));
      deletePendingConfirmation(withMessage.id);

      return buildOcrResult(withMessage, '已取消这条 OCR 结果。', {
        note: `${withMessage.payload.request.sheet}; cancelled`,
        confirmationState: 'cancelled',
        resultCode: 'image-ocr-cancelled',
      });
    case 'edit':
      answerCallbackQuery(callbackQueryId, '请选择要修正的字段');
      editText(chatId, messageId, buildOcrEditText(withMessage), {
        replyMarkup: buildOcrEditKeyboard(withMessage.id),
      });

      return buildOcrResult(withMessage, '进入修正模式。', {
        note: `${withMessage.payload.request.sheet}; editing`,
        confirmationState: 'pending',
        resultCode: 'image-ocr-editing',
      });
    case 'back':
      answerCallbackQuery(callbackQueryId, '已返回确认视图');
      editText(chatId, messageId, buildOcrPreviewText(withMessage), {
        replyMarkup: buildOcrMainKeyboard(withMessage.id),
      });

      return buildOcrResult(withMessage, '已返回确认视图。', {
        note: `${withMessage.payload.request.sheet}; back to preview`,
        confirmationState: 'pending',
        resultCode: 'image-ocr-preview',
      });
    case 'field': {
      answerCallbackQuery(callbackQueryId, '请输入正确的热量');
      const promptMessageId = sendText(chatId, '请输入正确的热量（kcal）', {
        replyMarkup: buildOcrForceReplyMarkup(),
      });
      const nextPending: PendingOcrConfirmation = {
        ...withMessage,
        payload: {
          ...withMessage.payload,
          awaitingField: parsed.field,
          editPromptMessageId: promptMessageId,
        },
      };

      savePendingConfirmation(nextPending);

      if (promptMessageId !== null) {
        saveConfirmationPromptMapping(chatId, promptMessageId, nextPending.id);
      }

      return buildOcrResult(nextPending, '等待热量输入。', {
        note: `${withMessage.payload.request.sheet}; awaiting calories correction`,
        confirmationState: 'pending',
        resultCode: 'image-ocr-awaiting-field-input',
      });
    }
  }
}

export function handleOcrConfirmationReply(
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

  const pending = loadPendingConfirmation<'nutrition_label', PendingOcrPayload>(
    confirmationId,
  );

  if (
    !pending ||
    pending.chatId !== chatId ||
    pending.payload.awaitingField !== 'calories_kcal'
  ) {
    return null;
  }

  const calories = Number(text.trim());

  if (!Number.isFinite(calories) || calories < 0) {
    const nextPromptId = sendText(
      chatId,
      '热量格式不对，请输入数字，例如 210',
      {
        replyMarkup: buildOcrForceReplyMarkup(),
      },
    );

    if (nextPromptId !== null) {
      saveConfirmationPromptMapping(chatId, nextPromptId, pending.id);
      savePendingConfirmation({
        ...pending,
        payload: {
          ...pending.payload,
          editPromptMessageId: nextPromptId,
        },
      });
    }

    return buildOcrResult(pending, '热量输入无效。', {
      status: 'failed',
      note: `${pending.payload.request.sheet}; invalid calories input`,
      confirmationState: 'pending',
      resultCode: 'image-ocr-invalid-field-input',
    });
  }

  const nextPending = updatePendingCalories(pending, calories);
  savePendingConfirmation(nextPending);

  if (nextPending.previewMessageId !== null) {
    editText(
      chatId,
      nextPending.previewMessageId,
      buildOcrPreviewText(nextPending),
      { replyMarkup: buildOcrMainKeyboard(nextPending.id) },
    );
  }

  sendText(chatId, '已更新热量，请确认或继续修正。');

  return buildOcrResult(nextPending, '已更新热量，请确认或继续修正。', {
    note: `${nextPending.payload.request.sheet}; calories updated`,
    confirmationState: 'pending',
    resultCode: 'image-ocr-field-updated',
  });
}
