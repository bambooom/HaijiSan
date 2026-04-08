import { MY_CHAT_ID } from './app-config';
import { handleIncomingText } from './handlers';
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
    text?: string;
  };
}

function createOkResponse(): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput('ok');
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

    if (!update?.message) {
      return createOkResponse();
    }

    dedupeKey = getUpdateDedupeKey(update);

    if (dedupeKey && getCachedUpdateState(dedupeKey)) {
      return createOkResponse();
    }

    if (dedupeKey) {
      setCachedUpdateState(dedupeKey, 'processing');
    }

    const chatId = String(update.message.chat.id);
    const timestamp = new Date();

    if (chatId !== MY_CHAT_ID) {
      sendText(chatId, '抱歉，由于职责所在，我目前只能专注管理某一位队员。');
      if (dedupeKey) {
        setCachedUpdateState(dedupeKey, 'done');
      }

      return createOkResponse();
    }

    sendChatAction(chatId, 'typing');

    const result = handleIncomingText(update.message.text ?? '', timestamp);
    businessLogicCompleted = true;

    if (dedupeKey) {
      setCachedUpdateState(dedupeKey, 'done');
    }

    sendText(chatId, result.reply);
    botLogTable.appendMessageLog(timestamp, update.message.text ?? '', result);
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
