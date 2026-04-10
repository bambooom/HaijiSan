import { TelegramUpdate } from './telegram';

export type WebhookContext = {
  update: TelegramUpdate;
  rawLogText: string;
  timestamp: Date;
  chatId: string;
  dedupeKey: string | null;
};

export type RouteOutcome = 'handled' | 'handled-and-completed' | 'unhandled';

export type WebhookUpdateState = 'processing' | 'done';
