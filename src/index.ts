import { MY_CHAT_ID } from './app-config';
import { handleIncomingImageMessage, handleIncomingText } from './handlers';
import {
  enqueueImageOcrJob,
  processPendingImageOcrJobs,
} from './services/image-ocr-queue';
import {
  attachConfirmationPreviewMessage,
  handleOcrConfirmationCallback,
  handleOcrConfirmationReply,
} from './services/ocr-confirmation';
import { buildDailySummaryMessage } from './services/daily-summary';
import {
  disableDailyDigestTrigger as disableDailyDigestTriggerService,
  installDailyDigestTrigger as installDailyDigestTriggerService,
} from './services/digest-trigger';
import { sendChatAction, sendText } from './services/telegram';
import { botLogTable } from './tables';
import { CommandHandlingResult } from './types';

const WEBHOOK_PROCESSING_TTL_SECONDS = 90;
const WEBHOOK_DONE_TTL_SECONDS = 6 * 60 * 60;

type WebhookUpdateState = 'processing' | 'done';

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    chat: {
      id: number | string;
    };
    reply_to_message?: {
      message_id?: number;
      from?: {
        is_bot?: boolean;
      };
    };
    text?: string;
    caption?: string;
    photo?: Array<{
      file_id?: string;
    }>;
    document?: {
      file_id?: string;
      mime_type?: string;
    };
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: {
      message_id?: number;
      chat: {
        id: number | string;
      };
    };
  };
}

function getImageFileId(
  message: NonNullable<TelegramUpdate['message']>,
): string | null {
  const photoEntries = message.photo;
  const photoFileId =
    photoEntries && photoEntries.length > 0
      ? photoEntries[photoEntries.length - 1]?.file_id?.trim()
      : undefined;

  if (photoFileId) {
    return photoFileId;
  }

  const documentFileId = message.document?.file_id?.trim();
  const mimeType = message.document?.mime_type?.trim().toLowerCase() ?? '';

  if (documentFileId && mimeType.startsWith('image/')) {
    return documentFileId;
  }

  return null;
}

function getRawMessageText(
  message: NonNullable<TelegramUpdate['message']>,
): string {
  const text = message.text?.trim();

  if (text) {
    return text;
  }

  const caption = message.caption?.trim();

  if (caption) {
    return `[image] ${caption}`;
  }

  return '[image]';
}

function createOkResponse(): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput('ok');
}

function getUpdateChatId(update: TelegramUpdate): string | null {
  const messageChatId = update.message?.chat?.id;

  if (typeof messageChatId === 'string' || typeof messageChatId === 'number') {
    return String(messageChatId);
  }

  const callbackChatId = update.callback_query?.message?.chat?.id;

  if (
    typeof callbackChatId === 'string' ||
    typeof callbackChatId === 'number'
  ) {
    return String(callbackChatId);
  }

  return null;
}

function parseUpdate(e: GoogleAppsScript.Events.DoPost): TelegramUpdate | null {
  const contents = e.postData?.contents;

  if (!contents) {
    return null;
  }

  return JSON.parse(contents) as TelegramUpdate;
}

function getWebhookCache(): GoogleAppsScript.Cache.Cache | null {
  if (
    typeof CacheService === 'undefined' ||
    typeof CacheService.getScriptCache !== 'function'
  ) {
    return null;
  }

  return CacheService.getScriptCache();
}

function getUpdateDedupeKey(updateId: number | undefined): string | null {
  return typeof updateId === 'number' ? `telegram_update:${updateId}` : null;
}

function getCachedUpdateState(key: string): WebhookUpdateState | null {
  const value = getWebhookCache()?.get(key);

  return value === 'processing' || value === 'done' ? value : null;
}

function setCachedUpdateState(key: string, state: WebhookUpdateState): void {
  const ttlSeconds =
    state === 'done'
      ? WEBHOOK_DONE_TTL_SECONDS
      : WEBHOOK_PROCESSING_TTL_SECONDS;

  getWebhookCache()?.put(key, state, ttlSeconds);
}

function clearCachedUpdateState(key: string): void {
  getWebhookCache()?.remove(key);
}

function buildWebhookFailureResult(message: string): CommandHandlingResult {
  return {
    reply: '系统异常，未完成处理。',
    handlingMode: 'ai',
    status: 'failed',
    note: message,
    traceId: '',
    intent: 'webhook-error',
    tool: '',
    confirmationState: 'failed',
    resultCode: 'webhook-error',
  };
}

function buildWebhookIgnoredResult(
  message: string,
  resultCode: string,
): CommandHandlingResult {
  return {
    reply: '请求已忽略。',
    handlingMode: 'rule',
    status: 'ignored',
    note: message,
    traceId: '',
    intent: 'webhook-ignore',
    tool: '',
    confirmationState: 'none',
    resultCode,
  };
}

function doPost(
  e: GoogleAppsScript.Events.DoPost,
): GoogleAppsScript.Content.TextOutput {
  let rawLogText = '[unparsed update]';
  let dedupeKey: string | null = null;
  let processingMarked = false;

  try {
    const update = parseUpdate(e);

    if (!update?.message && !update?.callback_query) {
      botLogTable.appendMessageLog(
        new Date(),
        '[empty update]',
        buildWebhookIgnoredResult(
          'empty update payload',
          'webhook-empty-update',
        ),
      );
      return createOkResponse();
    }

    rawLogText = update.callback_query?.data
      ? `[callback] ${update.callback_query.data}`
      : update.message
        ? getRawMessageText(update.message)
        : '[unknown update]';

    dedupeKey = getUpdateDedupeKey(update.update_id);

    if (dedupeKey) {
      const cachedState = getCachedUpdateState(dedupeKey);

      if (cachedState === 'done' || cachedState === 'processing') {
        return createOkResponse();
      }

      setCachedUpdateState(dedupeKey, 'processing');
      processingMarked = true;
    }

    const chatId = getUpdateChatId(update);
    const timestamp = new Date();

    if (!chatId) {
      botLogTable.appendMessageLog(
        timestamp,
        rawLogText,
        buildWebhookIgnoredResult('missing chat id', 'webhook-missing-chat'),
      );
      return createOkResponse();
    }

    if (chatId !== MY_CHAT_ID) {
      sendText(chatId, '抱歉，由于职责所在，我目前只能专注管理某一位队员。');
      botLogTable.appendMessageLog(
        timestamp,
        rawLogText,
        buildWebhookIgnoredResult(
          `ignored unauthorized chat: ${chatId}`,
          'webhook-unauthorized-chat',
        ),
      );

      return createOkResponse();
    }

    try {
      sendChatAction(chatId, 'typing');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `typing failed: ${String(error)}`;

      try {
        botLogTable.appendMessageLog(
          timestamp,
          rawLogText,
          buildWebhookIgnoredResult(message, 'webhook-typing-failed'),
        );
      } catch {
        // Ignore secondary logging failures for non-critical typing actions.
      }
    }

    const imageFileId = update.message ? getImageFileId(update.message) : null;

    if (imageFileId) {
      const placeholderMessageId = sendText(chatId, '正在识别，请稍后。', {
        replyMarkup: undefined,
      });

      if (placeholderMessageId === null) {
        throw new Error('Telegram did not return a placeholder message id');
      }

      const queuedResult = enqueueImageOcrJob(
        chatId,
        imageFileId,
        update.message?.caption ?? '',
        rawLogText,
        placeholderMessageId,
        timestamp,
      );

      botLogTable.appendMessageLog(timestamp, rawLogText, queuedResult);

      if (dedupeKey) {
        setCachedUpdateState(dedupeKey, 'done');
        processingMarked = false;
      }

      return createOkResponse();
    }

    if (update.callback_query?.id && update.callback_query.data) {
      const result = handleOcrConfirmationCallback(
        chatId,
        update.callback_query.id,
        update.callback_query.data,
        update.callback_query.message?.message_id ?? 0,
        timestamp,
      );

      if (result) {
        botLogTable.appendMessageLog(
          timestamp,
          `[callback] ${update.callback_query.data}`,
          result,
        );

        if (dedupeKey) {
          setCachedUpdateState(dedupeKey, 'done');
          processingMarked = false;
        }
      }

      return createOkResponse();
    }

    if (
      update.message?.text &&
      typeof update.message.reply_to_message?.message_id === 'number'
    ) {
      const result = handleOcrConfirmationReply(
        chatId,
        update.message.reply_to_message.message_id,
        update.message.text,
        timestamp,
      );

      if (result) {
        botLogTable.appendMessageLog(timestamp, update.message.text, result);

        if (dedupeKey) {
          setCachedUpdateState(dedupeKey, 'done');
          processingMarked = false;
        }

        return createOkResponse();
      }
    }
    const result = imageFileId
      ? handleIncomingImageMessage(
          imageFileId,
          update.message?.caption ?? '',
          timestamp,
          chatId,
        )
      : handleIncomingText(update.message?.text ?? '', timestamp);

    const sentMessageId = sendText(chatId, result.reply, {
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

    botLogTable.appendMessageLog(timestamp, rawLogText, result);

    if (dedupeKey) {
      setCachedUpdateState(dedupeKey, 'done');
      processingMarked = false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (dedupeKey && processingMarked) {
      clearCachedUpdateState(dedupeKey);
    }

    try {
      botLogTable.appendMessageLog(
        new Date(),
        rawLogText,
        buildWebhookFailureResult(message),
      );
    } catch {
      // Ignore secondary logging failures so alert delivery still has a chance.
    }

    try {
      sendText(MY_CHAT_ID, `🚨 逻辑故障：\n${message}`);
    } catch {
      // Ignore secondary alert failures after preserving the original error in BOT_LOG.
    }

    return createOkResponse();
  }

  return createOkResponse();
}

function sendDailyDigest(): void {
  sendText(MY_CHAT_ID, buildDailySummaryMessage(new Date()));
}

function installDailyDigestTrigger() {
  return installDailyDigestTriggerService();
}

function disableDailyDigestTrigger() {
  return disableDailyDigestTriggerService();
}

Object.assign(globalThis, {
  doPost,
  processPendingImageOcrJobs,
  sendDailyDigest,
  installDailyDigestTrigger,
  disableDailyDigestTrigger,
  __haijisanSendDailyDigest: sendDailyDigest,
  __haijisanInstallDailyDigestTrigger: installDailyDigestTrigger,
  __haijisanDisableDailyDigestTrigger: disableDailyDigestTrigger,
});

export {
  disableDailyDigestTrigger,
  doPost,
  installDailyDigestTrigger,
  processPendingImageOcrJobs,
  sendDailyDigest,
};
