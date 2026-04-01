import { BOT_TOKEN } from '../app-config';

type TelegramChatAction = 'typing';

function postTelegramRequest(endpoint: string, payload: object): void {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`;

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  });
}

export function sendChatAction(
  chatId: string,
  action: TelegramChatAction,
): void {
  postTelegramRequest('sendChatAction', {
    chat_id: chatId,
    action,
  });
}

export function sendText(chatId: string, text: string): void {
  postTelegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  });
}
