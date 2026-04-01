import type { CommandHandlingResult } from '../../types';
import { handleClarifyStage } from './clarify';
import { handleExecuteStage } from './execute';
import { buildAiResult } from './result';
import { resolveAiTurn } from './turn';

export { handleCancelPendingAction } from './pending';

export function handleAiMessage(
  text: string,
  timestamp: Date,
): CommandHandlingResult {
  const turnResolution = resolveAiTurn(text, timestamp);

  if (turnResolution.kind === 'result') {
    return turnResolution.result;
  }

  const { turn } = turnResolution;

  switch (turn.stage) {
    case 'reply':
      return buildAiResult(turn.plan.reply, 'success', turn.note);
    case 'clarify':
      return handleClarifyStage(turn, timestamp);
    case 'execute':
      return handleExecuteStage(turn, timestamp);
  }
}
