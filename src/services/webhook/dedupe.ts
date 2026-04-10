import { botLogTable } from '../../tables';
import type { TelegramUpdate, WebhookUpdateState } from '../../types';
import { buildWebhookIgnoredResult, withWebhookMeta } from './log';

const WEBHOOK_PROCESSING_TTL_SECONDS = 90;
const WEBHOOK_DONE_TTL_SECONDS = 6 * 60 * 60;
const WEBHOOK_DUPLICATE_LOGGED_TTL_SECONDS = 6 * 60 * 60;

function getWebhookCache(): GoogleAppsScript.Cache.Cache | null {
  if (
    typeof CacheService === 'undefined' ||
    typeof CacheService.getScriptCache !== 'function'
  ) {
    return null;
  }

  return CacheService.getScriptCache();
}

export function getUpdateDedupeKey(
  updateId: number | undefined,
): string | null {
  return typeof updateId === 'number' ? `telegram_update:${updateId}` : null;
}

export function getCachedUpdateState(key: string): WebhookUpdateState | null {
  const value = getWebhookCache()?.get(key);

  return value === 'processing' || value === 'done' ? value : null;
}

export function setCachedUpdateState(
  key: string,
  state: WebhookUpdateState,
): void {
  const ttlSeconds =
    state === 'done'
      ? WEBHOOK_DONE_TTL_SECONDS
      : WEBHOOK_PROCESSING_TTL_SECONDS;

  getWebhookCache()?.put(key, state, ttlSeconds);
}

export function clearCachedUpdateState(key: string): void {
  getWebhookCache()?.remove(key);
}

export function logDuplicateUpdateOnce(
  dedupeKey: string,
  cachedState: WebhookUpdateState,
  rawLogText: string,
  update: TelegramUpdate | null,
): void {
  const cache = getWebhookCache();
  const duplicateLoggedKey = `${dedupeKey}:duplicate_logged`;

  if (cache?.get(duplicateLoggedKey)) {
    return;
  }

  botLogTable.appendMessageLog(
    new Date(),
    rawLogText,
    withWebhookMeta(
      buildWebhookIgnoredResult(
        `duplicate update ignored: ${dedupeKey}; state=${cachedState}`,
        'webhook-duplicate-update',
      ),
      update,
    ),
  );

  cache?.put(duplicateLoggedKey, '1', WEBHOOK_DUPLICATE_LOGGED_TTL_SECONDS);
}
