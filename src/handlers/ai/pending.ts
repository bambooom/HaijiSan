import {
  AI_CANCELLATION_PATTERN,
  AI_CONFIRMATION_GUIDE,
  AI_CONFIRMATION_PATTERN,
  AI_MESSAGES,
} from '../../constants/ai';
import { geminiService } from '../../services/gemini';
import { confirmPendingMealRecordAction } from '../../services/meal-action';
import {
  clearPendingAiAction,
  getPendingAiAction,
} from '../../services/pending-action';
import type {
  AiPlan,
  CommandHandlingResult,
  PendingClarificationAction,
  PendingMappedCommandAction,
  PendingMealRecordAction,
  PendingStockBatchAction,
} from '../../types';
import {
  appendAiNote,
  buildStockMutationCommandText,
  truncateAiNote,
} from '../../utils/ai-command';
import { buildAiErrorReply } from '../../utils/ai-error';
import { executeCommandRoute } from '../command-router';
import {
  buildClarificationSourceText,
  looksLikeClarificationFollowup,
} from './clarify-followup';
import { buildAiResult } from './result';

export type PendingAiResolution =
  | {
      kind: 'result';
      result: CommandHandlingResult;
    }
  | {
      kind: 'continue';
      plan: AiPlan;
      sourceText: string;
      mergedFromClarify: boolean;
    };

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
): PendingAiResolution | null {
  const pendingAction = getPendingAiAction(timestamp);

  if (!pendingAction) {
    return null;
  }

  if (isCancellationText(text)) {
    return {
      kind: 'result',
      result: handleCancelPendingAction(timestamp),
    };
  }

  if (pendingAction.kind === 'clarify') {
    return handlePendingClarificationAction(pendingAction, text, timestamp);
  }

  if (!isConfirmationText(text)) {
    return {
      kind: 'result',
      result: buildAiResult(
        `${AI_MESSAGES.PENDING_ACTION_BLOCKED}\n${pendingAction.previewText}`,
        'ignored',
        truncateAiNote(
          `pending-action=blocked; kind=${pendingAction.kind}${pendingAction.traceId ? `; trace=${pendingAction.traceId}` : ''}`,
        ),
      ),
    };
  }

  clearPendingAiAction();

  if (pendingAction.kind === 'meal-record') {
    return {
      kind: 'result',
      result: executePendingMealRecordAction(pendingAction, timestamp),
    };
  }

  if (pendingAction.kind === 'stock-batch') {
    return {
      kind: 'result',
      result: executePendingStockBatchAction(pendingAction, timestamp),
    };
  }

  return {
    kind: 'result',
    result: executePendingMappedCommandAction(pendingAction, timestamp),
  };
}

function handlePendingClarificationAction(
  action: PendingClarificationAction,
  text: string,
  timestamp: Date,
): PendingAiResolution | null {
  if (!looksLikeClarificationFollowup(text)) {
    return null;
  }

  try {
    const plan = geminiService.planClarificationFollowup(
      action.sourceText,
      action.clarificationReply,
      text,
      action.partialPlan,
      timestamp,
    );

    clearPendingAiAction();

    return {
      kind: 'continue',
      plan,
      sourceText: buildClarificationSourceText(action.sourceText, text),
      mergedFromClarify: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      kind: 'result',
      result: buildAiResult(
        buildAiErrorReply(message, AI_MESSAGES.CLARIFICATION_FOLLOWUP_FAILED),
        'failed',
        appendAiNote(action.note, `clarify-followup=failed; error=${message}`),
      ),
    };
  }
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

function executePendingMealRecordAction(
  action: PendingMealRecordAction,
  fallbackTimestamp: Date,
): CommandHandlingResult {
  try {
    const persisted = confirmPendingMealRecordAction(action, fallbackTimestamp);
    const notedAction = action.traceId
      ? appendAiNote(action.note, `trace=${action.traceId}`)
      : action.note;

    return buildAiResult(
      buildMealRecordSuccessReply(action, persisted.stockSync.updatedCount),
      'success',
      appendAiNote(
        notedAction,
        `confirmed=true; stock-updated=${persisted.stockSync.updatedCount}`,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notedAction = action.traceId
      ? appendAiNote(action.note, `trace=${action.traceId}`)
      : action.note;

    return buildAiResult(
      AI_MESSAGES.PENDING_ACTION_FAILED,
      'failed',
      appendAiNote(notedAction, `confirmed=true; persist-error=${message}`),
    );
  }
}

function executePendingStockBatchAction(
  action: PendingStockBatchAction,
  fallbackTimestamp: Date,
): CommandHandlingResult {
  const createdAt = new Date(action.createdAt);
  const timestamp = Number.isNaN(createdAt.getTime())
    ? fallbackTimestamp
    : createdAt;
  const successReplies: string[] = [];
  const failedItems: string[] = [];

  for (const item of action.items) {
    const commandReply = executeCommandRoute(
      buildStockMutationCommandText(action.operation, item),
      timestamp,
    )?.reply;

    if (commandReply) {
      successReplies.push(commandReply);
    } else {
      failedItems.push(item.name);
    }
  }

  if (successReplies.length === 0) {
    return buildAiResult(
      AI_MESSAGES.PENDING_ACTION_FAILED,
      'failed',
      appendAiNote(
        action.note,
        `confirmed=true; stock-batch=0/${action.items.length}`,
      ),
    );
  }

  return buildAiResult(
    buildStockBatchSuccessReply(successReplies, failedItems),
    failedItems.length === 0 ? 'success' : 'failed',
    appendAiNote(
      action.note,
      `confirmed=true; stock-batch=${successReplies.length}/${action.items.length}`,
    ),
  );
}

function buildMealRecordSuccessReply(
  action: PendingMealRecordAction,
  updatedCount: number,
): string {
  const stockSuffix =
    updatedCount > 0
      ? `库存同步 ${updatedCount} 项。`
      : AI_MESSAGES.MEAL_RECORD_SYNC_NONE;

  return `${AI_MESSAGES.MEAL_RECORD_WRITTEN}\n这餐已经记进 Food_Log 了，合计约 ${action.mealRecord.estimatedCalories ?? '未知'} kcal。${stockSuffix}`;
}

function buildStockBatchSuccessReply(
  successReplies: string[],
  failedItems: string[],
): string {
  const header =
    failedItems.length === 0
      ? `库存已更新，共 ${successReplies.length} 项。`
      : `库存已更新 ${successReplies.length} 项。`;
  const failedSuffix =
    failedItems.length === 0
      ? ''
      : `\n以下项目没有写入：${failedItems.join('、')}`;

  return `${header}\n${successReplies.join('\n')}${failedSuffix}`;
}
