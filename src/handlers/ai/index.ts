import { AI_INTENTS, AI_MESSAGES } from '../../constants/ai';
import { savePendingAiAction } from '../../services/pending-action';
import type { CommandHandlingResult } from '../../types';
import {
  appendAiNote,
  buildCommandFromAiPlan,
  summarizeAiPlan,
} from '../../utils/ai-command';
import { executeCommandRoute } from '../command-router';
import { handleFoodAiMessage } from './food';
import { buildAiResult } from './result';
import { buildMappedCommandPreview, handlePendingAiAction } from './pending';
import { geminiService } from '../../services/gemini';

export { handleCancelPendingAction } from './pending';

export function handleAiMessage(
  text: string,
  timestamp: Date,
): CommandHandlingResult {
  const pendingActionResult = handlePendingAiAction(text, timestamp);

  if (pendingActionResult) {
    return pendingActionResult;
  }

  const plan = geminiService.planMessage(text, timestamp);
  const planNote = summarizeAiPlan(plan);

  if (plan.mode !== 'command') {
    return buildAiResult(plan.reply, 'success', planNote);
  }

  if (
    plan.intent === AI_INTENTS.FOOD_ESTIMATE ||
    plan.intent === AI_INTENTS.FOOD
  ) {
    return handleFoodAiMessage(plan, text, timestamp);
  }

  const commandText = buildCommandFromAiPlan(plan);

  if (!commandText) {
    return buildAiResult(
      plan.reply || AI_MESSAGES.INCOMPLETE_COMMAND,
      'ignored',
      planNote,
    );
  }

  const commandNote = summarizeAiPlan(plan, commandText);

  if (plan.intent !== AI_INTENTS.STOCK_CHECK) {
    const previewText = buildMappedCommandPreview(commandText);

    savePendingAiAction({
      kind: 'mapped-command',
      createdAt: timestamp.toISOString(),
      sourceText: text,
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
