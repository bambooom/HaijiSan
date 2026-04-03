import { AI_MESSAGES } from '../../constants/ai';
import {
  formatPlanningContext,
  retrievePlanningContext,
} from '../../services/context-retrieval';
import {
  parseTargetDateReference,
  supportsBackfillForIntent,
} from '../../shared/date-reference';
import { validateAiPlanAgainstTool } from '../../tools/registry';
import type {
  AiPlan,
  CommandHandlingResult,
  CommandLogFields,
} from '../../types';
import {
  appendAiNote,
  formatToolArgsForNote,
  summarizeAiPlan,
} from '../../utils/ai-command';
import { geminiService } from '../../services/gemini';
import { handlePendingAiAction } from './pending';

export type AiStage = 'reply' | 'clarify' | 'execute';

export type ResolvedAiTurn = {
  plan: AiPlan;
  sourceText: string;
  traceId: string;
  toolName: string | null;
  toolArgsNote: string | null;
  logFieldsBase: CommandLogFields;
  note: string;
  stage: AiStage;
};

const LOW_CONFIDENCE_THRESHOLD = 0.45;

function createTraceId(): string {
  try {
    return Utilities.getUuid();
  } catch {
    return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function downgradeToClarify(plan: AiPlan, reply?: string): AiPlan {
  return {
    ...plan,
    mode: 'clarify',
    reply: reply ?? AI_MESSAGES.INCOMPLETE_COMMAND,
  };
}

function mergeInferredTargetDate(
  plan: AiPlan,
  sourceText: string,
  timestamp: Date,
): AiPlan {
  if (plan.targetDate || !supportsBackfillForIntent(plan.intent)) {
    return plan;
  }

  const inferredDate = parseTargetDateReference(sourceText, timestamp);

  return inferredDate
    ? {
        ...plan,
        targetDate: inferredDate,
      }
    : plan;
}

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
  const inferenceText =
    pendingActionResult?.kind === 'continue'
      ? `${sourceText}\n补充说明：${text}`
      : text;
  const traceId = createTraceId();
  const planningContext =
    pendingActionResult?.kind === 'continue'
      ? ''
      : formatPlanningContext(retrievePlanningContext(text, timestamp));
  let plan =
    pendingActionResult?.kind === 'continue'
      ? pendingActionResult.plan
      : geminiService.planMessage(text, timestamp, planningContext);
  plan = mergeInferredTargetDate(plan, inferenceText, timestamp);
  const { toolName, input, validation } = validateAiPlanAgainstTool(
    plan,
    sourceText,
    {
      timestamp,
      source:
        pendingActionResult?.kind === 'continue'
          ? 'pending-confirmation'
          : 'ai-plan',
      traceId,
    },
  );

  if (
    pendingActionResult?.kind !== 'continue' &&
    plan.mode === 'command' &&
    typeof plan.confidence === 'number' &&
    plan.confidence < LOW_CONFIDENCE_THRESHOLD
  ) {
    plan = downgradeToClarify(plan);
  }

  if (
    plan.mode === 'command' &&
    validation &&
    !validation.ok &&
    validation.shouldClarify
  ) {
    plan = downgradeToClarify(
      plan,
      validation.issues[0]?.message || AI_MESSAGES.INCOMPLETE_COMMAND,
    );
  }

  let note = summarizeAiPlan(plan);

  note = appendAiNote(note, `trace=${traceId}`);

  if (toolName) {
    note = appendAiNote(note, `tool=${toolName}`);
  }

  const toolArgsNote = input ? formatToolArgsForNote(input) : null;

  if (toolArgsNote) {
    note = appendAiNote(note, `toolArgs=${toolArgsNote}`);
  }

  if (planningContext) {
    note = appendAiNote(note, 'context=attached');
  }

  if (pendingActionResult?.kind === 'continue') {
    note = appendAiNote(note, 'clarify-followup=merged');
  }

  const logFieldsBase: CommandLogFields = {
    traceId,
    intent: plan.intent,
    tool: toolName ?? '',
    confirmationState: 'none',
    resultCode: '',
  };

  return {
    kind: 'turn',
    turn: {
      plan,
      sourceText,
      traceId,
      toolName,
      toolArgsNote,
      logFieldsBase,
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
