import { savePendingAiAction } from '../../services/pending-action';
import type { CommandHandlingResult } from '../../types';
import { appendAiNote } from '../../utils/ai-command';
import { buildAiResult } from './result';
import type { ResolvedAiTurn } from './turn';

export function handleClarifyStage(
  turn: ResolvedAiTurn,
  timestamp: Date,
): CommandHandlingResult {
  savePendingAiAction({
    kind: 'clarify',
    traceId: turn.traceId,
    createdAt: timestamp.toISOString(),
    sourceText: turn.sourceText,
    clarificationReply: turn.plan.reply,
    partialPlan: turn.plan,
    note: turn.note,
  });

  return buildAiResult(
    turn.plan.reply,
    'success',
    appendAiNote(turn.note, 'clarify-saved=true'),
  );
}
