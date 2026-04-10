import type { TelegramReplyMarkup, PendingConfirmation } from '../../types';

const CONFIRMATION_TTL_SECONDS = 6 * 60 * 60;

function getCache(): GoogleAppsScript.Cache.Cache | null {
  if (
    typeof CacheService === 'undefined' ||
    typeof CacheService.getScriptCache !== 'function'
  ) {
    return null;
  }

  return CacheService.getScriptCache();
}

function getPendingKey(id: string): string {
  return `confirmation:${id}`;
}

function getPromptKey(chatId: string, messageId: number): string {
  return `confirmation_prompt:${chatId}:${messageId}`;
}

export function createConfirmationId(): string {
  if (
    typeof Utilities !== 'undefined' &&
    typeof Utilities.getUuid === 'function'
  ) {
    return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function savePendingConfirmation<TKind extends string, TPayload>(
  pending: PendingConfirmation<TKind, TPayload>,
): void {
  getCache()?.put(
    getPendingKey(pending.id),
    JSON.stringify(pending),
    CONFIRMATION_TTL_SECONDS,
  );
}

export function deletePendingConfirmation(id: string): void {
  getCache()?.remove(getPendingKey(id));
}

export function loadPendingConfirmation<TKind extends string, TPayload>(
  id: string,
): PendingConfirmation<TKind, TPayload> | null {
  const raw = getCache()?.get(getPendingKey(id));

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as PendingConfirmation<TKind, TPayload>;
}

export function attachConfirmationPreviewMessage(
  confirmationId: string,
  messageId: number,
): void {
  const pending = loadPendingConfirmation<string, unknown>(confirmationId);

  if (!pending) {
    return;
  }

  savePendingConfirmation({
    ...pending,
    previewMessageId: messageId,
  });
}

export function saveConfirmationPromptMapping(
  chatId: string,
  messageId: number,
  confirmationId: string,
): void {
  getCache()?.put(
    getPromptKey(chatId, messageId),
    confirmationId,
    CONFIRMATION_TTL_SECONDS,
  );
}

export function consumeConfirmationPromptMapping(
  chatId: string,
  messageId: number,
): string | null {
  const key = getPromptKey(chatId, messageId);
  const confirmationId = getCache()?.get(key) ?? null;

  if (confirmationId) {
    getCache()?.remove(key);
  }

  return confirmationId;
}

export function buildInlineKeyboard(
  rows: Array<Array<{ text: string; callbackData: string }>>,
): TelegramReplyMarkup {
  return {
    inlineKeyboard: rows,
  };
}

export function buildForceReply(
  inputFieldPlaceholder?: string,
): TelegramReplyMarkup {
  return {
    forceReply: true,
    inputFieldPlaceholder,
  };
}
