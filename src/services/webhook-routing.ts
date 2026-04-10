import { handleIncomingImageMessage, handleIncomingText } from '../handlers';
import { enqueueImageOcrJob } from './image-ocr-queue';
import {
  attachConfirmationPreviewMessage,
  handleConfirmationCallback,
  handleConfirmationReply,
} from './confirmation';
import { sendChatAction, sendText } from './telegram';
import { getImageFileId, type TelegramUpdate } from './telegram-update';
import { setCachedUpdateState } from './webhook-dedupe';
import {
  buildWebhookIgnoredResult,
  logWebhookTrace,
  withWebhookMeta,
} from './webhook-log';
import { botLogTable } from '../tables';
import type { CommandHandlingResult } from '../types';

export type WebhookContext = {
  update: TelegramUpdate;
  rawLogText: string;
  timestamp: Date;
  chatId: string;
  dedupeKey: string | null;
};

export type RouteOutcome = 'handled' | 'handled-and-completed' | 'unhandled';

export function appendWebhookLog(
  timestamp: Date,
  rawLogText: string,
  result: CommandHandlingResult,
  update: TelegramUpdate | null,
): void {
  botLogTable.appendMessageLog(
    timestamp,
    rawLogText,
    withWebhookMeta(result, update),
  );
}

export function appendIgnoredWebhookLog(
  timestamp: Date,
  rawLogText: string,
  message: string,
  resultCode: string,
  update: TelegramUpdate | null,
): void {
  appendWebhookLog(
    timestamp,
    rawLogText,
    buildWebhookIgnoredResult(message, resultCode),
    update,
  );
}

export function markUpdateDone(dedupeKey: string | null): void {
  if (!dedupeKey) {
    return;
  }

  setCachedUpdateState(dedupeKey, 'done');
}

export function reportTypingFailure(
  context: WebhookContext,
  error: unknown,
): void {
  const message =
    error instanceof Error ? error.message : `typing failed: ${String(error)}`;

  try {
    appendIgnoredWebhookLog(
      context.timestamp,
      context.rawLogText,
      message,
      'webhook-typing-failed',
      context.update,
    );
  } catch {
    // Ignore secondary logging failures for non-critical typing actions.
  }
}

export function handleImageRoute(context: WebhookContext): RouteOutcome {
  const imageFileId = context.update.message
    ? getImageFileId(context.update.message)
    : null;

  if (!imageFileId) {
    return 'unhandled';
  }

  const placeholderMessageId = sendText(context.chatId, '正在识别，请稍后。', {
    replyMarkup: undefined,
  });

  if (placeholderMessageId === null) {
    throw new Error('Telegram did not return a placeholder message id');
  }

  const queuedResult = enqueueImageOcrJob(
    context.chatId,
    imageFileId,
    context.update.message?.caption ?? '',
    context.rawLogText,
    placeholderMessageId,
    context.timestamp,
  );

  logWebhookTrace('image_queued', {
    dedupeKey: context.dedupeKey,
    chatId: context.chatId,
    imageFileId,
    placeholderMessageId,
    rawLogText: context.rawLogText,
  });

  appendWebhookLog(
    context.timestamp,
    context.rawLogText,
    queuedResult,
    context.update,
  );

  return 'handled-and-completed';
}

export function handleCallbackRoute(context: WebhookContext): RouteOutcome {
  if (
    !context.update.callback_query?.id ||
    !context.update.callback_query.data
  ) {
    return 'unhandled';
  }

  const result = handleConfirmationCallback(
    context.chatId,
    context.update.callback_query.id,
    context.update.callback_query.data,
    context.update.callback_query.message?.message_id ?? 0,
    context.timestamp,
  );

  if (result) {
    appendWebhookLog(
      context.timestamp,
      `[callback] ${context.update.callback_query.data}`,
      result,
      context.update,
    );

    return 'handled-and-completed';
  }

  return 'handled';
}

export function handleReplyRoute(context: WebhookContext): RouteOutcome {
  if (
    !context.update.message?.text ||
    typeof context.update.message.reply_to_message?.message_id !== 'number'
  ) {
    return 'unhandled';
  }

  const result = handleConfirmationReply(
    context.chatId,
    context.update.message.reply_to_message.message_id,
    context.update.message.text,
    context.timestamp,
  );

  if (!result) {
    return 'unhandled';
  }

  appendWebhookLog(
    context.timestamp,
    context.update.message.text,
    result,
    context.update,
  );

  return 'handled-and-completed';
}

export function handleDefaultRoute(context: WebhookContext): void {
  const imageFileId = context.update.message
    ? getImageFileId(context.update.message)
    : null;
  const result = imageFileId
    ? handleIncomingImageMessage(
        imageFileId,
        context.update.message?.caption ?? '',
        context.timestamp,
        context.chatId,
      )
    : handleIncomingText(
        context.update.message?.text ?? '',
        context.timestamp,
        context.chatId,
      );

  const sentMessageId = sendText(context.chatId, result.reply, {
    replyMarkup: result.telegramResponse?.replyMarkup,
  });

  if (
    sentMessageId !== null &&
    typeof result.telegramResponse?.pendingConfirmationId === 'string'
  ) {
    attachConfirmationPreviewMessage(
      result.telegramResponse.pendingConfirmationId,
      sentMessageId,
    );
  }

  appendWebhookLog(
    context.timestamp,
    context.rawLogText,
    result,
    context.update,
  );
}

export function sendTyping(chatId: string): void {
  sendChatAction(chatId, 'typing');
}
