import { MY_CHAT_ID } from './app-config';
import { handleIncomingImageMessage, handleIncomingText } from './handlers';
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

const WEBHOOK_DEDUPE_TTL_SECONDS = 6 * 60 * 60;

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

function getUpdateDedupeKey(update: TelegramUpdate): string | null {
  if (typeof update.update_id === 'number') {
    return `telegram_update:${update.update_id}`;
  }

  const chatId = update.message?.chat?.id;
  const messageId = update.message?.message_id;

  if (
    (typeof chatId === 'string' || typeof chatId === 'number') &&
    typeof messageId === 'number'
  ) {
    return `telegram_message:${String(chatId)}:${messageId}`;
  }

  return null;
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

function getCachedUpdateState(key: string): string | null {
  return getWebhookCache()?.get(key) ?? null;
}

function setCachedUpdateState(key: string, state: 'processing' | 'done'): void {
  getWebhookCache()?.put(key, state, WEBHOOK_DEDUPE_TTL_SECONDS);
}

function clearCachedUpdateState(key: string): void {
  getWebhookCache()?.remove(key);
}

function parseUpdate(e: GoogleAppsScript.Events.DoPost): TelegramUpdate | null {
  const contents = e.postData?.contents;

  if (!contents) {
    return null;
  }

  return JSON.parse(contents) as TelegramUpdate;
}

function doPost(
  e: GoogleAppsScript.Events.DoPost,
): GoogleAppsScript.Content.TextOutput {
  let dedupeKey: string | null = null;
  let businessLogicCompleted = false;

  try {
    const update = parseUpdate(e);

    if (!update?.message && !update?.callback_query) {
      return createOkResponse();
    }

    dedupeKey = getUpdateDedupeKey(update);

    if (dedupeKey && getCachedUpdateState(dedupeKey)) {
      return createOkResponse();
    }

    if (dedupeKey) {
      setCachedUpdateState(dedupeKey, 'processing');
    }

    const chatId = getUpdateChatId(update);
    const timestamp = new Date();

    if (!chatId) {
      return createOkResponse();
    }

    if (chatId !== MY_CHAT_ID) {
      sendText(chatId, '抱歉，由于职责所在，我目前只能专注管理某一位队员。');
      if (dedupeKey) {
        setCachedUpdateState(dedupeKey, 'done');
      }

      return createOkResponse();
    }

    sendChatAction(chatId, 'typing');

    if (update.callback_query?.id && update.callback_query.data) {
      const result = handleOcrConfirmationCallback(
        chatId,
        update.callback_query.id,
        update.callback_query.data,
        update.callback_query.message?.message_id ?? 0,
        timestamp,
      );
      businessLogicCompleted = true;

      if (dedupeKey) {
        setCachedUpdateState(dedupeKey, 'done');
      }

      if (result) {
        botLogTable.appendMessageLog(
          timestamp,
          `[callback] ${update.callback_query.data}`,
          result,
        );
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
        businessLogicCompleted = true;

        if (dedupeKey) {
          setCachedUpdateState(dedupeKey, 'done');
        }

        botLogTable.appendMessageLog(timestamp, update.message.text, result);

        return createOkResponse();
      }
    }

    const imageFileId = update.message ? getImageFileId(update.message) : null;
    const result = imageFileId
      ? handleIncomingImageMessage(
          imageFileId,
          update.message?.caption ?? '',
          timestamp,
          chatId,
        )
      : handleIncomingText(update.message?.text ?? '', timestamp);
    businessLogicCompleted = true;

    if (dedupeKey) {
      setCachedUpdateState(dedupeKey, 'done');
    }

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

    botLogTable.appendMessageLog(
      timestamp,
      update.message ? getRawMessageText(update.message) : '[callback]',
      result,
    );
  } catch (error) {
    if (dedupeKey && !businessLogicCompleted) {
      clearCachedUpdateState(dedupeKey);
    }

    const message = error instanceof Error ? error.message : String(error);
    sendText(MY_CHAT_ID, `🚨 逻辑故障：\n${message}`);

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
  sendDailyDigest,
};
