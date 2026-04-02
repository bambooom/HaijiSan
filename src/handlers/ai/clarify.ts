import { savePendingAiAction } from '../../services/pending-action';
import type { CommandHandlingResult } from '../../types';
import { buildCommandLogFields } from '../../utils/log-meta';
import { appendAiNote } from '../../utils/ai-command';
import { buildAiResult } from './result';
import type { ResolvedAiTurn } from './turn';

export function handleClarifyStage(
  turn: ResolvedAiTurn,
  timestamp: Date,
): CommandHandlingResult {
  savePendingAiAction({
    kind: 'clarify',
    createdAt: timestamp.toISOString(),
    sourceText: turn.sourceText,
    clarificationReply: turn.plan.reply,
    partialPlan: turn.plan,
    note: turn.note,
    ...buildCommandLogFields(turn.logFieldsBase, {
      traceId: turn.traceId,
      resultCode: 'clarify-saved',
    }),
  });

  return buildAiResult(
    turn.plan.reply,
    'success',
    appendAiNote(turn.note, 'clarify-saved=true'),
    buildCommandLogFields(turn.logFieldsBase, {
      resultCode: 'clarify-saved',
    }),
  );
}
