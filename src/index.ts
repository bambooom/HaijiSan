import { MY_CHAT_ID } from './app-config';
import { handleCommand } from './commands';
import { botLogRepository } from './repositories';
import { buildDailySummaryMessage } from './services/daily-summary';
import {
  disableDailyDigestTrigger as disableDailyDigestTriggerService,
  installDailyDigestTrigger as installDailyDigestTriggerService,
} from './services/digest-trigger';
import { importHealthDataPhoto } from './services/reference-ocr';
import {
  downloadTelegramFile,
  sendChatAction,
  sendText,
} from './services/telegram';

interface TelegramUpdate {
  message?: {
    chat: {
      id: number | string;
    };
    text?: string;
    caption?: string;
    photo?: Array<{
      file_id: string;
      width: number;
      height: number;
      file_size?: number;
    }>;
  };
}

function pickLargestPhoto(
  photos: Array<{
    file_id: string;
    width: number;
    height: number;
    file_size?: number;
  }>,
): { file_id: string } | null {
  if (photos.length === 0) {
    return null;
  }

  return photos.reduce((largest, current) => {
    const largestScore =
      (largest.file_size ?? largest.width * largest.height) || 0;
    const currentScore =
      (current.file_size ?? current.width * current.height) || 0;

    return currentScore >= largestScore ? current : largest;
  });
}

function handlePhotoUpdate(
  message: NonNullable<TelegramUpdate['message']>,
  timestamp: Date,
) {
  const photo = pickLargestPhoto(message.photo ?? []);

  if (!photo) {
    throw new Error('Photo update did not include a downloadable image');
  }

  const downloaded = downloadTelegramFile(photo.file_id);

  return importHealthDataPhoto(
    {
      base64Data: downloaded.base64Data,
      mimeType: downloaded.mimeType,
      caption: message.caption,
    },
    timestamp,
  );
}

function parseUpdate(e: GoogleAppsScript.Events.DoPost): TelegramUpdate | null {
  const contents = e.postData?.contents;

  if (!contents) {
    return null;
  }

  return JSON.parse(contents) as TelegramUpdate;
}

function doPost(e: GoogleAppsScript.Events.DoPost): void {
  try {
    const update = parseUpdate(e);

    if (!update?.message) {
      return;
    }

    const chatId = String(update.message.chat.id);
    const timestamp = new Date();

    if (chatId !== MY_CHAT_ID) {
      sendText(chatId, '抱歉，由于职责所在，我目前只能专注管理某一位队员。');
      return;
    }

    sendChatAction(chatId, 'typing');

    const result =
      update.message.photo && update.message.photo.length > 0
        ? handlePhotoUpdate(update.message, timestamp)
        : handleCommand(update.message.text ?? '', timestamp);

    sendText(chatId, result.reply);
    botLogRepository.appendMessageLog(
      timestamp,
      update.message.text ?? update.message.caption ?? '[photo]',
      result,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendText(MY_CHAT_ID, `🚨 逻辑故障：\n${message}`);
  }
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
