import { BOT_TOKEN } from '../config';

export function sendText(chatId: string, text: string): void {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  });
}
