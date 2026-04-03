import { BOT_TOKEN } from '../app-config';

type TelegramChatAction = 'typing';

type TelegramFileResponse = {
  ok?: boolean;
  result?: {
    file_path?: string;
  };
  description?: string;
};

function postTelegramRequest(endpoint: string, payload: object): void {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`;

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  });
}

function getTelegramApiUrl(endpoint: string): string {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`;
}

function getTelegramFileUrl(filePath: string): string {
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
}

function inferMimeTypeFromFilePath(filePath: string): string | null {
  const normalizedPath = filePath.trim().toLowerCase();

  if (normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (normalizedPath.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedPath.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedPath.endsWith('.heic')) {
    return 'image/heic';
  }

  if (normalizedPath.endsWith('.heif')) {
    return 'image/heif';
  }

  return null;
}

function resolveTelegramMimeType(
  blobMimeType: string,
  filePath: string,
): string {
  const normalizedBlobMimeType = blobMimeType.trim().toLowerCase();

  if (
    normalizedBlobMimeType &&
    normalizedBlobMimeType !== 'application/octet-stream'
  ) {
    return normalizedBlobMimeType;
  }

  return inferMimeTypeFromFilePath(filePath) ?? 'image/jpeg';
}

export function downloadTelegramFile(fileId: string): {
  base64Data: string;
  mimeType: string;
} {
  const metadataResponse = UrlFetchApp.fetch(getTelegramApiUrl('getFile'), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ file_id: fileId }),
    muteHttpExceptions: true,
  });
  const metadataStatus = metadataResponse.getResponseCode();
  const metadataText = metadataResponse.getContentText();

  if (metadataStatus < 200 || metadataStatus >= 300) {
    throw new Error(
      `Telegram getFile request failed (${metadataStatus}): ${metadataText}`,
    );
  }

  const metadata = JSON.parse(metadataText) as TelegramFileResponse;
  const filePath = metadata.result?.file_path?.trim();

  if (!metadata.ok || !filePath) {
    throw new Error(
      metadata.description ||
        'Telegram did not return a downloadable file path',
    );
  }

  const fileResponse = UrlFetchApp.fetch(getTelegramFileUrl(filePath), {
    method: 'get',
    muteHttpExceptions: true,
  });
  const fileStatus = fileResponse.getResponseCode();

  if (fileStatus < 200 || fileStatus >= 300) {
    throw new Error(`Telegram file download failed (${fileStatus})`);
  }

  const blob = fileResponse.getBlob();

  return {
    base64Data: Utilities.base64Encode(blob.getBytes()),
    mimeType: resolveTelegramMimeType(blob.getContentType() || '', filePath),
  };
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
