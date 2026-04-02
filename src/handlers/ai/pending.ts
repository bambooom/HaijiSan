import {
  AI_CANCELLATION_PATTERN,
  AI_CONFIRMATION_GUIDE,
  AI_CONFIRMATION_PATTERN,
  AI_MESSAGES,
} from '../../constants/ai';
import { geminiService } from '../../services/gemini';
import { confirmPendingMealRecordAction } from '../../services/meal-action';
import {
  consumePendingAiActionForConfirmation,
  clearPendingAiAction,
  getPendingAiAction,
  getRecentPendingConfirmationReceipt,
  savePendingConfirmationReceipt,
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
import { buildCommandLogFields } from '../../utils/log-meta';
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
      {
        confirmationState: 'none',
        resultCode: 'cancel-no-pending',
      },
    );
  }

  clearPendingAiAction();

  return buildAiResult(
    AI_MESSAGES.PENDING_ACTION_CANCELLED,
    'ignored',
    truncateAiNote(`pending-action=cancelled; kind=${pendingAction.kind}`),
    buildCommandLogFields(pendingAction, {
      traceId: pendingAction.traceId,
      confirmationState: 'cancelled',
      resultCode: 'cancelled',
    }),
  );
}

export function handlePendingAiAction(
  text: string,
  timestamp: Date,
): PendingAiResolution | null {
  const pendingAction = getPendingAiAction(timestamp);

  if (!pendingAction) {
    if (isConfirmationText(text)) {
      return {
        kind: 'result',
        result: buildRepeatedConfirmationResult(timestamp),
      };
    }

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
        buildCommandLogFields(pendingAction, {
          traceId: pendingAction.traceId,
          confirmationState: 'pending',
          resultCode: 'pending-blocked',
        }),
      ),
    };
  }

  const claimedAction = consumePendingAiActionForConfirmation(timestamp);

  if (!claimedAction) {
    return {
      kind: 'result',
      result: buildRepeatedConfirmationResult(timestamp),
    };
  }

  if (claimedAction.kind === 'meal-record') {
    return {
      kind: 'result',
      result: executePendingMealRecordAction(claimedAction, timestamp),
    };
  }

  if (claimedAction.kind === 'stock-batch') {
    return {
      kind: 'result',
      result: executePendingStockBatchAction(claimedAction, timestamp),
    };
  }

  return {
    kind: 'result',
    result: executePendingMappedCommandAction(claimedAction, timestamp),
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
        buildCommandLogFields(action, {
          traceId: action.traceId,
          resultCode: 'clarify-followup-failed',
        }),
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

function buildRepeatedConfirmationResult(
  timestamp: Date,
): CommandHandlingResult {
  const receipt = getRecentPendingConfirmationReceipt(timestamp);

  if (!receipt) {
    return buildAiResult(
      AI_MESSAGES.NO_PENDING_CONFIRMATION,
      'ignored',
      'pending-confirmation=none',
      {
        confirmationState: 'none',
        resultCode: 'confirm-no-pending',
      },
    );
  }

  if (receipt.status === 'processing') {
    return buildAiResult(
      AI_MESSAGES.PENDING_ACTION_CONFIRMING,
      'ignored',
      appendAiNote(receipt.note, 'duplicate-confirmation=processing'),
      buildCommandLogFields(receipt, {
        traceId: receipt.traceId,
        confirmationState: 'processing',
        resultCode: 'duplicate-confirmation',
      }),
    );
  }

  return buildAiResult(
    receipt.reply || AI_MESSAGES.PENDING_ACTION_ALREADY_CONFIRMED,
    receipt.status === 'failed' ? 'failed' : 'success',
    appendAiNote(receipt.note, `duplicate-confirmation=${receipt.status}`),
    buildCommandLogFields(receipt, {
      traceId: receipt.traceId,
      confirmationState: 'duplicate',
      resultCode: 'duplicate-confirmation',
    }),
  );
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
    const result = buildAiResult(
      AI_MESSAGES.PENDING_ACTION_FAILED,
      'failed',
      appendAiNote(action.note, 'confirmed=true; execute=failed'),
      buildCommandLogFields(action, {
        traceId: action.traceId,
        confirmationState: 'failed',
        resultCode: 'confirmed-write',
      }),
    );

    savePendingConfirmationReceipt({
      traceId: action.traceId,
      kind: action.kind,
      confirmedAt: timestamp.toISOString(),
      status: 'failed',
      reply: result.reply,
      note: result.note,
      intent: result.intent,
      tool: result.tool,
      confirmationState: result.confirmationState,
      resultCode: result.resultCode,
    });

    return result;
  }

  const result = buildAiResult(
    commandReply,
    'success',
    appendAiNote(action.note, 'confirmed=true; execute=success'),
    buildCommandLogFields(action, {
      traceId: action.traceId,
      confirmationState: 'confirmed',
      resultCode: 'confirmed-write',
    }),
  );

  savePendingConfirmationReceipt({
    traceId: action.traceId,
    kind: action.kind,
    confirmedAt: timestamp.toISOString(),
    status: 'completed',
    reply: result.reply,
    note: result.note,
    intent: result.intent,
    tool: result.tool,
    confirmationState: result.confirmationState,
    resultCode: result.resultCode,
  });

  return result;
}

function executePendingMealRecordAction(
  action: PendingMealRecordAction,
  fallbackTimestamp: Date,
): CommandHandlingResult {
  try {
    const timestamp = fallbackTimestamp;
    const persisted = confirmPendingMealRecordAction(action, fallbackTimestamp);
    const notedAction = action.traceId
      ? appendAiNote(action.note, `trace=${action.traceId}`)
      : action.note;

    const result = buildAiResult(
      buildMealRecordSuccessReply(action, persisted.stockSync.updatedCount),
      'success',
      appendAiNote(
        notedAction,
        `confirmed=true; stock-updated=${persisted.stockSync.updatedCount}`,
      ),
      buildCommandLogFields(action, {
        traceId: action.traceId,
        confirmationState: 'confirmed',
        resultCode: 'confirmed-write',
      }),
    );

    savePendingConfirmationReceipt({
      traceId: action.traceId,
      kind: action.kind,
      confirmedAt: timestamp.toISOString(),
      status: 'completed',
      reply: result.reply,
      note: result.note,
      intent: result.intent,
      tool: result.tool,
      confirmationState: result.confirmationState,
      resultCode: result.resultCode,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notedAction = action.traceId
      ? appendAiNote(action.note, `trace=${action.traceId}`)
      : action.note;

    const result = buildAiResult(
      AI_MESSAGES.PENDING_ACTION_FAILED,
      'failed',
      appendAiNote(notedAction, `confirmed=true; persist-error=${message}`),
      buildCommandLogFields(action, {
        traceId: action.traceId,
        confirmationState: 'failed',
        resultCode: 'confirmed-write',
      }),
    );

    savePendingConfirmationReceipt({
      traceId: action.traceId,
      kind: action.kind,
      confirmedAt: fallbackTimestamp.toISOString(),
      status: 'failed',
      reply: result.reply,
      note: result.note,
      intent: result.intent,
      tool: result.tool,
      confirmationState: result.confirmationState,
      resultCode: result.resultCode,
    });

    return result;
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
    const result = buildAiResult(
      AI_MESSAGES.PENDING_ACTION_FAILED,
      'failed',
      appendAiNote(
        action.note,
        `confirmed=true; stock-batch=0/${action.items.length}`,
      ),
      buildCommandLogFields(action, {
        traceId: action.traceId,
        confirmationState: 'failed',
        resultCode: 'confirmed-write',
      }),
    );

    savePendingConfirmationReceipt({
      traceId: action.traceId,
      kind: action.kind,
      confirmedAt: timestamp.toISOString(),
      status: 'failed',
      reply: result.reply,
      note: result.note,
      intent: result.intent,
      tool: result.tool,
      confirmationState: result.confirmationState,
      resultCode: result.resultCode,
    });

    return result;
  }

  const result = buildAiResult(
    buildStockBatchSuccessReply(successReplies, failedItems),
    failedItems.length === 0 ? 'success' : 'failed',
    appendAiNote(
      action.note,
      `confirmed=true; stock-batch=${successReplies.length}/${action.items.length}`,
    ),
    buildCommandLogFields(action, {
      traceId: action.traceId,
      confirmationState: failedItems.length === 0 ? 'confirmed' : 'failed',
      resultCode: 'confirmed-write',
    }),
  );

  savePendingConfirmationReceipt({
    traceId: action.traceId,
    kind: action.kind,
    confirmedAt: timestamp.toISOString(),
    status: failedItems.length === 0 ? 'completed' : 'failed',
    reply: result.reply,
    note: result.note,
    intent: result.intent,
    tool: result.tool,
    confirmationState: result.confirmationState,
    resultCode: result.resultCode,
  });

  return result;
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
