import { AI_INTENTS, AI_MESSAGES } from '../../constants/ai';
import { savePendingAiAction } from '../../services/pending-action';
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
import { handleNutritionSummaryAiMessage } from './nutrition';
import { buildMappedCommandPreview } from './pending';
import { buildAiResult } from './result';
import type { ResolvedAiTurn } from './turn';

type SpecialExecutor = (
  plan: AiPlan,
  sourceText: string,
  timestamp: Date,
) => CommandHandlingResult;

const SPECIAL_EXECUTORS: Partial<Record<AiIntent, SpecialExecutor>> = {
  [AI_INTENTS.FOOD]: handleFoodAiMessage,
  [AI_INTENTS.FOOD_ESTIMATE]: handleFoodAiMessage,
  [AI_INTENTS.NUTRITION_SUMMARY]: handleNutritionSummaryAiMessage,
  [AI_INTENTS.STOCK_ADJUST]: handleStockAiMessage,
  [AI_INTENTS.STOCK_SET]: handleStockAiMessage,
};

export function handleExecuteStage(
  turn: ResolvedAiTurn,
  timestamp: Date,
): CommandHandlingResult {
  const specialExecutor = SPECIAL_EXECUTORS[turn.plan.intent];

  if (specialExecutor) {
    return specialExecutor(turn.plan, turn.sourceText, timestamp);
  }

  return executeMappedCommand(turn, timestamp);
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

  const commandNote = summarizeAiPlan(turn.plan, commandText);

  if (turn.plan.intent !== AI_INTENTS.STOCK_CHECK) {
    const previewText = buildMappedCommandPreview(commandText);

    savePendingAiAction({
      kind: 'mapped-command',
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

  const commandReply = executeCommandRoute(commandText, timestamp)?.reply;

  if (!commandReply) {
    return buildAiResult(
      AI_MESSAGES.COMMAND_EXECUTION_FAILED,
      'failed',
      commandNote,
    );
  }

  return buildAiResult(commandReply, 'success', commandNote);
}

function handleStockAiMessage(
  plan: AiPlan,
  sourceText: string,
  timestamp: Date,
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
    summarizeAiPlan(plan),
    `stock-items=${items.length}`,
  );

  savePendingAiAction({
    kind: 'stock-batch',
    createdAt: timestamp.toISOString(),
    sourceText,
    previewText,
    operation,
    items,
    note: commandNote,
  });

  return buildAiResult(
    previewText,
    'success',
    appendAiNote(commandNote, 'pending-confirmation=true'),
  );
}
