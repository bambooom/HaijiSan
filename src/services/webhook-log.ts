import type { CommandHandlingResult } from '../types';
import type { TelegramUpdate } from './telegram-update';

export function buildWebhookFailureResult(
  message: string,
): CommandHandlingResult {
  return {
    reply: '系统异常，未完成处理。',
    handlingMode: 'ai',
    status: 'failed',
    note: message,
    traceId: '',
    intent: 'webhook-error',
    tool: '',
    confirmationState: 'failed',
    resultCode: 'webhook-error',
  };
}

export function buildWebhookIgnoredResult(
  message: string,
  resultCode: string,
): CommandHandlingResult {
  return {
    reply: '请求已忽略。',
    handlingMode: 'rule',
    status: 'ignored',
    note: message,
    traceId: '',
    intent: 'webhook-ignore',
    tool: '',
    confirmationState: 'none',
    resultCode,
  };
}

export function buildWebhookMetaNote(update: TelegramUpdate | null): string {
  if (!update) {
    return '';
  }

  return [
    typeof update.update_id === 'number' ? `update_id=${update.update_id}` : '',
    typeof update.message?.message_id === 'number'
      ? `message_id=${update.message.message_id}`
      : '',
    typeof update.callback_query?.message?.message_id === 'number'
      ? `callback_message_id=${update.callback_query.message.message_id}`
      : '',
    typeof update.callback_query?.id === 'string'
      ? `callback_query_id=${update.callback_query.id}`
      : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function withWebhookMeta(
  result: CommandHandlingResult,
  update: TelegramUpdate | null,
): CommandHandlingResult {
  const metaNote = buildWebhookMetaNote(update);

  if (!metaNote) {
    return result;
  }

  return {
    ...result,
    note: result.note ? `${result.note}; ${metaNote}` : metaNote,
  };
}

export function logWebhookTrace(
  event: string,
  details: Record<string, unknown>,
): void {
  if (typeof console === 'undefined' || typeof console.info !== 'function') {
    return;
  }

  console.info(`[haijisan webhook] ${event}`, JSON.stringify(details));
}
