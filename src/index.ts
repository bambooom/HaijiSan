import { MY_CHAT_ID } from './app-config';
import { handleCommand } from './commands';
import { botLogRepository } from './repositories';
import { sendChatAction, sendText } from './services/telegram';

interface TelegramUpdate {
  message?: {
    chat: {
      id: number | string;
    };
    text?: string;
  };
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
    const text = update.message.text ?? '';
    const timestamp = new Date();

    if (chatId !== MY_CHAT_ID) {
      sendText(chatId, '抱歉，由于职责所在，我目前只能专注管理某一位队员。');
      return;
    }

    sendChatAction(chatId, 'typing');

    const result = handleCommand(text, timestamp);

    sendText(chatId, result.reply);
    botLogRepository.appendMessageLog(timestamp, text, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendText(MY_CHAT_ID, `🚨 逻辑故障：\n${message}`);
  }
}

Object.assign(globalThis, { doPost });

export { doPost };
