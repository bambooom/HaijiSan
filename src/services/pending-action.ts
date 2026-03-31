import type { PendingAiAction } from '../types';

const PENDING_AI_ACTION_KEY = 'haijisan.pending_ai_action';
const PENDING_AI_ACTION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStore(): GoogleAppsScript.Properties.Properties {
  return PropertiesService.getScriptProperties();
}

function isExpired(action: PendingAiAction, now: Date): boolean {
  const createdAtMs = new Date(action.createdAt).getTime();

  if (Number.isNaN(createdAtMs)) {
    return true;
  }

  return now.getTime() - createdAtMs > PENDING_AI_ACTION_TTL_MS;
}

export function getPendingAiAction(
  now: Date = new Date(),
): PendingAiAction | null {
  const raw = getStore().getProperty(PENDING_AI_ACTION_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingAiAction;

    if (isExpired(parsed, now)) {
      clearPendingAiAction();
      return null;
    }

    return parsed;
  } catch {
    clearPendingAiAction();
    return null;
  }
}

export function savePendingAiAction(action: PendingAiAction): void {
  getStore().setProperty(PENDING_AI_ACTION_KEY, JSON.stringify(action));
}

export function clearPendingAiAction(): void {
  getStore().deleteProperty(PENDING_AI_ACTION_KEY);
}
