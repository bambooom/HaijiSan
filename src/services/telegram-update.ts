export interface TelegramUpdate {
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

export function getImageFileId(
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

export function getRawMessageText(
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

export function getUpdateChatId(update: TelegramUpdate): string | null {
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

export function parseUpdate(
  e: GoogleAppsScript.Events.DoPost,
): TelegramUpdate | null {
  const contents = e.postData?.contents;

  if (!contents) {
    return null;
  }

  return JSON.parse(contents) as TelegramUpdate;
}
