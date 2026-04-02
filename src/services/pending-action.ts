import type { PendingAiAction, PendingConfirmationReceipt } from '../types';

const PENDING_AI_ACTION_KEY = 'haijisan.pending_ai_action';
const PENDING_AI_ACTION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PENDING_CONFIRMATION_RECEIPT_KEY =
  'haijisan.pending_ai_confirmation_receipt';
const PENDING_CONFIRMATION_RECEIPT_TTL_MS = 60 * 1000; // 1 minute

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

function isReceiptExpired(
  receipt: PendingConfirmationReceipt,
  now: Date,
): boolean {
  const confirmedAtMs = new Date(receipt.confirmedAt).getTime();

  if (Number.isNaN(confirmedAtMs)) {
    return true;
  }

  return now.getTime() - confirmedAtMs > PENDING_CONFIRMATION_RECEIPT_TTL_MS;
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

export function getRecentPendingConfirmationReceipt(
  now: Date = new Date(),
): PendingConfirmationReceipt | null {
  const raw = getStore().getProperty(PENDING_CONFIRMATION_RECEIPT_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingConfirmationReceipt;

    if (isReceiptExpired(parsed, now)) {
      clearPendingConfirmationReceipt();
      return null;
    }

    return parsed;
  } catch {
    clearPendingConfirmationReceipt();
    return null;
  }
}

export function savePendingConfirmationReceipt(
  receipt: PendingConfirmationReceipt,
): void {
  getStore().setProperty(
    PENDING_CONFIRMATION_RECEIPT_KEY,
    JSON.stringify(receipt),
  );
}

export function clearPendingConfirmationReceipt(): void {
  getStore().deleteProperty(PENDING_CONFIRMATION_RECEIPT_KEY);
}

export function consumePendingAiActionForConfirmation(
  now: Date = new Date(),
): Exclude<PendingAiAction, { kind: 'clarify' }> | null {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const action = getPendingAiAction(now);

    if (!action || action.kind === 'clarify') {
      return null;
    }

    savePendingConfirmationReceipt({
      traceId: action.traceId,
      intent: action.intent,
      tool: action.tool,
      kind: action.kind,
      confirmedAt: now.toISOString(),
      status: 'processing',
      reply: '',
      confirmationState: 'processing',
      resultCode: 'duplicate-confirmation',
      note: action.note,
    });
    clearPendingAiAction();

    return action;
  } finally {
    lock.releaseLock();
  }
}
