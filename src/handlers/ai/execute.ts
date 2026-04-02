import { AI_INTENTS, AI_MESSAGES } from '../../constants/ai';
import { savePendingAiAction } from '../../services/pending-action';
import {
  buildToolInputFromAiPlan,
  getToolContract,
} from '../../tools/registry';
import { type ToolInputMap, type ToolName } from '../../tools/schemas';
import type { AiIntent, AiPlan, CommandHandlingResult } from '../../types';
import {
  appendAiNote,
  buildStockBatchPreview,
  buildCommandFromAiPlan,
  resolveAiStockItems,
  summarizeAiPlan,
} from '../../utils/ai-command';
import { executeCommandRoute } from '../command-router';
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
  const specialExecutor = SPECIAL_EXECUTORS[turn.plan.intent];

  if (specialExecutor) {
    const result = specialExecutor(
      turn.plan,
      turn.sourceText,
      timestamp,
      turn.traceId,
      turn.note,
    );

    return {
      ...result,
      note: result.note,
    };
  }

  const registryResult = executeToolFromRegistry(turn, timestamp);

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
    );
  }

  const commandNote = appendAiNote(turn.note, `command=${commandText}`);
  const previewText = buildMappedCommandPreview(commandText);

  savePendingAiAction({
    kind: 'mapped-command',
    traceId: turn.traceId,
    createdAt: timestamp.toISOString(),
    sourceText: turn.sourceText,
    previewText,
    commandText,
    note: commandNote,
  });

  return buildAiResult(
    previewText,
    'success',
    appendAiNote(commandNote, 'pending-confirmation=true'),
  );
}

function handleStockAiMessage(
  plan: AiPlan,
  sourceText: string,
  timestamp: Date,
  traceId?: string,
  baseNote?: string,
): CommandHandlingResult {
  const items = resolveAiStockItems(plan);

  if (items.length === 0) {
    return buildAiResult(
      plan.reply || AI_MESSAGES.INCOMPLETE_COMMAND,
      'ignored',
      summarizeAiPlan(plan),
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
    traceId,
    createdAt: timestamp.toISOString(),
    sourceText,
    previewText,
    operation,
    items,
    note: notedCommand,
  });

  return buildAiResult(
    previewText,
    'success',
    appendAiNote(notedCommand, 'pending-confirmation=true'),
  );
}
