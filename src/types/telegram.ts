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
