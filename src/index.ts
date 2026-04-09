import { MY_CHAT_ID } from './app-config';
import { processPendingImageOcrJobs } from './services/image-ocr-queue';
import { buildDailySummaryMessage } from './services/daily-summary';
import {
  disableDailyDigestTrigger as disableDailyDigestTriggerService,
  installDailyDigestTrigger as installDailyDigestTriggerService,
} from './services/digest-trigger';
import { sendText } from './services/telegram';
import {
  getRawMessageText,
  getUpdateChatId,
  parseUpdate,
  type TelegramUpdate,
} from './services/telegram-update';
import {
  clearCachedUpdateState,
  getCachedUpdateState,
  getUpdateDedupeKey,
  logDuplicateUpdateOnce,
  setCachedUpdateState,
} from './services/webhook-dedupe';
import {
  buildWebhookFailureResult,
  logWebhookTrace,
} from './services/webhook-log';
import {
  appendIgnoredWebhookLog,
  appendWebhookLog,
  handleCallbackRoute,
  handleDefaultRoute,
  handleImageRoute,
  handleReplyRoute,
  markUpdateDone,
  reportTypingFailure,
  sendTyping,
  type WebhookContext,
} from './services/webhook-routing';

function createOkResponse(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutput('ok');
}

function doPost(
  e: GoogleAppsScript.Events.DoPost,
): GoogleAppsScript.HTML.HtmlOutput {
  let update: TelegramUpdate | null = null;
  let rawLogText = '[unparsed update]';
  let dedupeKey: string | null = null;
  let processingMarked = false;

  try {
    update = parseUpdate(e);

    if (!update?.message && !update?.callback_query) {
      appendIgnoredWebhookLog(
        new Date(),
        '[empty update]',
        'empty update payload',
        'webhook-empty-update',
        update,
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
        logDuplicateUpdateOnce(dedupeKey, cachedState, rawLogText, update);

        logWebhookTrace('duplicate_ignored', {
          dedupeKey,
          cachedState,
          rawLogText,
        });

        return createOkResponse();
      }

      setCachedUpdateState(dedupeKey, 'processing');
      processingMarked = true;
    }

    const chatId = getUpdateChatId(update);
    const timestamp = new Date();
    const context = {
      update,
      rawLogText,
      timestamp,
      chatId: chatId ?? '',
      dedupeKey,
    } satisfies WebhookContext;

    if (!chatId) {
      appendIgnoredWebhookLog(
        timestamp,
        rawLogText,
        'missing chat id',
        'webhook-missing-chat',
        update,
      );
      return createOkResponse();
    }

    if (chatId !== MY_CHAT_ID) {
      sendText(chatId, '抱歉，由于职责所在，我目前只能专注管理某一位队员。');
      appendIgnoredWebhookLog(
        timestamp,
        rawLogText,
        `ignored unauthorized chat: ${chatId}`,
        'webhook-unauthorized-chat',
        update,
      );

      return createOkResponse();
    }

    try {
      sendTyping(chatId);
    } catch (error) {
      reportTypingFailure(context, error);
    }

    const imageOutcome = handleImageRoute(context);

    if (imageOutcome !== 'unhandled') {
      if (imageOutcome === 'handled-and-completed') {
        markUpdateDone(dedupeKey);
        processingMarked = false;
      }

      return createOkResponse();
    }

    const callbackOutcome = handleCallbackRoute(context);

    if (callbackOutcome !== 'unhandled') {
      if (callbackOutcome === 'handled-and-completed') {
        markUpdateDone(dedupeKey);
        processingMarked = false;
      }

      return createOkResponse();
    }

    const replyOutcome = handleReplyRoute(context);

    if (replyOutcome !== 'unhandled') {
      if (replyOutcome === 'handled-and-completed') {
        markUpdateDone(dedupeKey);
        processingMarked = false;
      }

      return createOkResponse();
    }

    handleDefaultRoute(context);
    markUpdateDone(dedupeKey);
    processingMarked = false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logWebhookTrace('webhook_error', {
      dedupeKey,
      rawLogText,
      message,
    });

    if (dedupeKey && processingMarked) {
      clearCachedUpdateState(dedupeKey);
    }

    try {
      appendWebhookLog(
        new Date(),
        rawLogText,
        buildWebhookFailureResult(message),
        update,
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
