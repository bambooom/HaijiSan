import type { AiPlan, CommandHandlingResult } from '../../types';
import { appendAiNote, summarizeAiPlan } from '../../utils/ai-command';
import { geminiService } from '../../services/gemini';
import { handlePendingAiAction } from './pending';

export type AiStage = 'reply' | 'clarify' | 'execute';

export type ResolvedAiTurn = {
  plan: AiPlan;
  sourceText: string;
  note: string;
  stage: AiStage;
};

export type AiTurnResolution =
  | {
      kind: 'result';
      result: CommandHandlingResult;
    }
  | {
      kind: 'turn';
      turn: ResolvedAiTurn;
    };

export function resolveAiTurn(text: string, timestamp: Date): AiTurnResolution {
  const pendingActionResult = handlePendingAiAction(text, timestamp);

  if (pendingActionResult?.kind === 'result') {
    return {
      kind: 'result',
      result: pendingActionResult.result,
    };
  }

  const sourceText = pendingActionResult?.sourceText ?? text;
  const plan =
    pendingActionResult?.kind === 'continue'
      ? pendingActionResult.plan
      : geminiService.planMessage(text, timestamp);
  let note = summarizeAiPlan(plan);

  if (pendingActionResult?.kind === 'continue') {
    note = appendAiNote(note, 'clarify-followup=merged');
  }

  return {
    kind: 'turn',
    turn: {
      plan,
      sourceText,
      note,
      stage: toAiStage(plan),
    },
  };
}

function toAiStage(plan: AiPlan): AiStage {
  if (plan.mode === 'command') {
    return 'execute';
  }

  return plan.mode;
}
