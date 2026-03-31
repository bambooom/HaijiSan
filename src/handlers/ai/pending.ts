import {
  AI_CANCELLATION_PATTERN,
  AI_CONFIRMATION_GUIDE,
  AI_CONFIRMATION_PATTERN,
  AI_MESSAGES,
} from '../../constants/ai';
import { confirmPendingMealRecordAction } from '../../services/meal-action';
import {
  clearPendingAiAction,
  getPendingAiAction,
} from '../../services/pending-action';
import type {
  CommandHandlingResult,
  PendingMappedCommandAction,
  PendingMealRecordAction,
} from '../../types';
import { appendAiNote, truncateAiNote } from '../../utils/ai-command';
import { executeCommandRoute } from '../command-router';
import { buildAiResult } from './result';

export function buildMappedCommandPreview(commandText: string): string {
  return `我准备按这条记录写入：\n${commandText}\n${AI_CONFIRMATION_GUIDE}`;
}

export function handleCancelPendingAction(
  timestamp: Date = new Date(),
): CommandHandlingResult {
  const pendingAction = getPendingAiAction(timestamp);

  if (!pendingAction) {
    return buildAiResult(
      AI_MESSAGES.NO_PENDING_ACTION,
      'ignored',
      'pending-action=none',
    );
  }

  clearPendingAiAction();

  return buildAiResult(
    AI_MESSAGES.PENDING_ACTION_CANCELLED,
    'ignored',
    truncateAiNote(`pending-action=cancelled; kind=${pendingAction.kind}`),
  );
}

export function handlePendingAiAction(
  text: string,
  timestamp: Date,
): CommandHandlingResult | null {
  const pendingAction = getPendingAiAction(timestamp);

  if (!pendingAction) {
    return null;
  }

  if (isCancellationText(text)) {
    return handleCancelPendingAction(timestamp);
  }

  if (!isConfirmationText(text)) {
    return buildAiResult(
      `我这里还有一条待确认的操作。\n${pendingAction.previewText}`,
      'ignored',
      truncateAiNote(`pending-action=blocked; kind=${pendingAction.kind}`),
    );
  }

  clearPendingAiAction();

  if (pendingAction.kind === 'meal-record') {
    return executePendingMealRecordAction(pendingAction, timestamp);
  }

  return executePendingMappedCommandAction(pendingAction, timestamp);
}

function isConfirmationText(text: string): boolean {
  return AI_CONFIRMATION_PATTERN.test(text.trim());
}

function isCancellationText(text: string): boolean {
  return AI_CANCELLATION_PATTERN.test(text.trim());
}

function executePendingMappedCommandAction(
  action: PendingMappedCommandAction,
  fallbackTimestamp: Date,
): CommandHandlingResult {
  const createdAt = new Date(action.createdAt);
  const timestamp = Number.isNaN(createdAt.getTime())
    ? fallbackTimestamp
    : createdAt;
  const commandReply = executeCommandRoute(
    action.commandText,
    timestamp,
  )?.reply;

  if (!commandReply) {
    return buildAiResult(
      AI_MESSAGES.PENDING_ACTION_FAILED,
      'failed',
      appendAiNote(action.note, 'confirmed=true; execute=failed'),
    );
  }

  return buildAiResult(
    commandReply,
    'success',
    appendAiNote(action.note, 'confirmed=true; execute=success'),
  );
}

function buildMealRecordSuccessReply(
  action: PendingMealRecordAction,
  updatedCount: number,
): string {
  const stockSuffix =
    updatedCount > 0
      ? `库存同步 ${updatedCount} 项。`
      : '这次没有同步到库存项。';

  return `已按刚才的预览写入。\n这餐已经记进 Food_Log 了，合计约 ${action.mealRecord.estimatedCalories ?? '未知'} kcal。${stockSuffix}`;
}

function executePendingMealRecordAction(
  action: PendingMealRecordAction,
  fallbackTimestamp: Date,
): CommandHandlingResult {
  try {
    const persisted = confirmPendingMealRecordAction(action, fallbackTimestamp);

    return buildAiResult(
      buildMealRecordSuccessReply(action, persisted.stockSync.updatedCount),
      'success',
      appendAiNote(
        action.note,
        `confirmed=true; stock-updated=${persisted.stockSync.updatedCount}`,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return buildAiResult(
      AI_MESSAGES.PENDING_ACTION_FAILED,
      'failed',
      appendAiNote(action.note, `confirmed=true; persist-error=${message}`),
    );
  }
}
