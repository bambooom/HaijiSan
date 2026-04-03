import { AI_INTENTS, AI_MESSAGES } from '../../constants/ai';
import { savePendingAiAction } from '../../services/pending-action';
import { resolveTargetDateTimestamp } from '../../shared/date-reference';
import {
  buildToolInputFromAiPlan,
  getToolContract,
} from '../../tools/registry';
import { type ToolInputMap, type ToolName } from '../../tools/schemas';
import type {
  AiIntent,
  AiPlan,
  CommandHandlingResult,
  CommandLogFields,
} from '../../types';
import {
  appendAiNote,
  buildStockBatchPreview,
  buildCommandFromAiPlan,
  resolveAiStockItems,
  summarizeAiPlan,
} from '../../utils/ai-command';
import { buildCommandLogFields } from '../../utils/log-meta';
import { handleFoodAiMessage } from './food';
import { buildMappedCommandPreview } from './pending';
import { buildAiResult } from './result';
import {
  buildImmediateWriteToolReply,
  buildReadOnlyToolReply,
} from './tool-replies';
import type { ResolvedAiTurn } from './turn';

type SpecialExecutor = (
  plan: AiPlan,
  sourceText: string,
  timestamp: Date,
  traceId?: string,
  baseNote?: string,
  baseLogFields?: CommandLogFields,
) => CommandHandlingResult;

const SPECIAL_EXECUTORS: Partial<Record<AiIntent, SpecialExecutor>> = {
  [AI_INTENTS.FOOD]: handleFoodAiMessage,
  [AI_INTENTS.FOOD_ESTIMATE]: handleFoodAiMessage,
  [AI_INTENTS.STOCK_ADJUST]: handleStockAiMessage,
  [AI_INTENTS.STOCK_SET]: handleStockAiMessage,
};

export function handleExecuteStage(
  turn: ResolvedAiTurn,
  timestamp: Date,
): CommandHandlingResult {
  const executionTimestamp = resolveTargetDateTimestamp(
    timestamp,
    turn.plan.targetDate,
  );
  const specialExecutor = SPECIAL_EXECUTORS[turn.plan.intent];

  if (specialExecutor) {
    const result = specialExecutor(
      turn.plan,
      turn.sourceText,
      timestamp,
      turn.traceId,
      turn.note,
      turn.logFieldsBase,
    );

    return {
      ...result,
      note: result.note,
    };
  }

  const registryResult = executeToolFromRegistry(turn, executionTimestamp);

  if (registryResult) {
    const enrichedNote = turn.toolArgsNote
      ? appendAiNote(registryResult.note, `toolArgs=${turn.toolArgsNote}`)
      : registryResult.note;

    return {
      ...registryResult,
      note: appendAiNote(
        enrichedNote,
        `trace=${turn.traceId}${turn.toolName ? `; tool=${turn.toolName}` : ''}`,
      ),
    };
  }

  return executeMappedCommand(turn, timestamp);
}

function executeToolFromRegistry(
  turn: ResolvedAiTurn,
  timestamp: Date,
): CommandHandlingResult | null {
  if (!turn.toolName) {
    return null;
  }

  const toolName = turn.toolName as ToolName;

  const toolInput = buildToolInputFromAiPlan(
    toolName,
    turn.plan,
    turn.sourceText,
  );

  if (!toolInput) {
    return buildAiResult(
      turn.plan.reply || AI_MESSAGES.INCOMPLETE_COMMAND,
      'ignored',
      appendAiNote(summarizeAiPlan(turn.plan), `tool=${toolName}`),
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: 'tool-input-missing',
      }),
    );
  }

  const toolContract = getToolContract(toolName);
  const validation = toolContract.validate(toolInput as never, {
    timestamp,
    source: 'ai-plan',
    traceId: turn.traceId,
  });

  if (!validation.ok) {
    return buildAiResult(
      validation.issues[0]?.message || AI_MESSAGES.INCOMPLETE_COMMAND,
      validation.shouldClarify ? 'ignored' : 'failed',
      appendAiNote(summarizeAiPlan(turn.plan), `tool=${toolName}`),
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: validation.shouldClarify
          ? 'tool-validation-clarify'
          : 'tool-validation-failed',
      }),
    );
  }

  if (toolContract.category === 'read') {
    return executeReadOnlyTool(turn, toolInput, timestamp);
  }

  if (toolContract.confirmationPolicy === 'never') {
    return executeImmediateWriteTool(turn, toolInput, timestamp);
  }

  return null;
}

function executeReadOnlyTool(
  turn: ResolvedAiTurn,
  toolInput: ToolInputMap[keyof ToolInputMap],
  timestamp: Date,
): CommandHandlingResult {
  const toolName = turn.toolName as ToolName;
  const toolContract = getToolContract(toolName);

  if (!toolContract.execute) {
    return buildAiResult(
      AI_MESSAGES.COMMAND_EXECUTION_FAILED,
      'failed',
      appendAiNote(
        summarizeAiPlan(turn.plan),
        `tool=${toolName}; execute=missing`,
      ),
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: 'tool-execute-missing',
      }),
    );
  }

  try {
    const result = toolContract.execute(toolInput as never, {
      timestamp,
      source: 'ai-plan',
      traceId: turn.traceId,
    });

    return buildAiResult(
      buildReadOnlyToolReply(toolName, result, toolInput),
      'success',
      appendAiNote(
        summarizeAiPlan(turn.plan),
        `tool=${toolName}; execute=success`,
      ),
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: 'read-executed',
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return buildAiResult(
      AI_MESSAGES.COMMAND_EXECUTION_FAILED,
      'failed',
      appendAiNote(
        summarizeAiPlan(turn.plan),
        `tool=${toolName}; execute=failed; error=${message}`,
      ),
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: 'read-execution-failed',
      }),
    );
  }
}

function executeImmediateWriteTool(
  turn: ResolvedAiTurn,
  toolInput: ToolInputMap[keyof ToolInputMap],
  timestamp: Date,
): CommandHandlingResult {
  const toolName = turn.toolName as ToolName;
  const toolContract = getToolContract(toolName);

  if (!toolContract.execute) {
    return buildAiResult(
      AI_MESSAGES.COMMAND_EXECUTION_FAILED,
      'failed',
      appendAiNote(
        summarizeAiPlan(turn.plan),
        `tool=${toolName}; execute=missing`,
      ),
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: 'tool-execute-missing',
      }),
    );
  }

  try {
    const result = toolContract.execute(toolInput as never, {
      timestamp,
      source: 'ai-plan',
      traceId: turn.traceId,
    });

    return buildAiResult(
      buildImmediateWriteToolReply(toolName, result, toolInput),
      'success',
      appendAiNote(
        summarizeAiPlan(turn.plan),
        `tool=${toolName}; execute=success`,
      ),
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: 'write-executed',
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return buildAiResult(
      AI_MESSAGES.COMMAND_EXECUTION_FAILED,
      'failed',
      appendAiNote(
        summarizeAiPlan(turn.plan),
        `tool=${toolName}; execute=failed; error=${message}`,
      ),
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: 'write-execution-failed',
      }),
    );
  }
}

function executeMappedCommand(
  turn: ResolvedAiTurn,
  timestamp: Date,
): CommandHandlingResult {
  const commandText = buildCommandFromAiPlan(turn.plan);

  if (!commandText) {
    return buildAiResult(
      turn.plan.reply || AI_MESSAGES.INCOMPLETE_COMMAND,
      'ignored',
      turn.note,
      buildCommandLogFields(turn.logFieldsBase, {
        resultCode: 'mapped-command-missing',
      }),
    );
  }

  const commandNote = appendAiNote(turn.note, `command=${commandText}`);
  const previewText = buildMappedCommandPreview(commandText);

  savePendingAiAction({
    kind: 'mapped-command',
    createdAt: timestamp.toISOString(),
    sourceText: turn.sourceText,
    previewText,
    commandText,
    note: commandNote,
    ...buildCommandLogFields(turn.logFieldsBase, {
      traceId: turn.traceId,
      confirmationState: 'pending',
      resultCode: 'pending-write',
    }),
  });

  return buildAiResult(
    previewText,
    'success',
    appendAiNote(commandNote, 'pending-confirmation=true'),
    buildCommandLogFields(turn.logFieldsBase, {
      confirmationState: 'pending',
      resultCode: 'pending-write',
    }),
  );
}

function handleStockAiMessage(
  plan: AiPlan,
  sourceText: string,
  timestamp: Date,
  traceId?: string,
  baseNote?: string,
  baseLogFields?: CommandLogFields,
): CommandHandlingResult {
  const items = resolveAiStockItems(plan);

  if (items.length === 0) {
    return buildAiResult(
      plan.reply || AI_MESSAGES.INCOMPLETE_COMMAND,
      'ignored',
      summarizeAiPlan(plan),
      buildCommandLogFields(baseLogFields, {
        intent: plan.intent,
        resultCode: 'stock-items-missing',
      }),
    );
  }

  const previewText = buildStockBatchPreview(plan.intent, items);
  const operation = plan.intent === AI_INTENTS.STOCK_SET ? 'set' : 'adjust';
  const commandNote = appendAiNote(
    baseNote ?? summarizeAiPlan(plan),
    `stock-items=${items.length}`,
  );

  const notedCommand = traceId
    ? appendAiNote(commandNote, `trace=${traceId}`)
    : commandNote;

  savePendingAiAction({
    kind: 'stock-batch',
    createdAt: timestamp.toISOString(),
    sourceText,
    previewText,
    operation,
    items,
    note: notedCommand,
    ...buildCommandLogFields(baseLogFields, {
      traceId,
      intent: plan.intent,
      confirmationState: 'pending',
      resultCode: 'pending-write',
    }),
  });

  return buildAiResult(
    previewText,
    'success',
    appendAiNote(notedCommand, 'pending-confirmation=true'),
    buildCommandLogFields(baseLogFields, {
      intent: plan.intent,
      confirmationState: 'pending',
      resultCode: 'pending-write',
    }),
  );
}
