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
const SLEEP_RECORD_PATTERN = /睡眠|睡了|入睡|醒来|睡觉/;
const QUESTION_PATTERN = /[?？]|为什么|怎么|多少|几点|吗$/;
const SLEEP_TIME_RANGE_PATTERN =
  /([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|~|到|至|—|–)\s*([01]?\d|2[0-3]):([0-5]\d)/;
const SLEEP_QUALITY_ALIASES: Record<string, AiPlan['sleepQuality']> = {
  good: 'good',
  great: 'good',
  well: 'good',
  hao: 'good',
  好: 'good',
  不错: 'good',
  normal: 'normal',
  ok: 'normal',
  medium: 'normal',
  ordinary: 'normal',
  一般: 'normal',
  还行: 'normal',
  poor: 'poor',
  bad: 'poor',
  差: 'poor',
  很差: 'poor',
};

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

function normalizeClock(hour: string, minute: string): string {
  return `${hour.padStart(2, '0')}:${minute}`;
}

function inferSleepQuality(text: string): AiPlan['sleepQuality'] | undefined {
  for (const [token, quality] of Object.entries(SLEEP_QUALITY_ALIASES)) {
    if (text.includes(token)) {
      return quality;
    }
  }

  return undefined;
}

function mergeInferredSleepFields(plan: AiPlan, sourceText: string): AiPlan {
  const looksLikeSleepRecord =
    plan.intent === 'sleep' || SLEEP_RECORD_PATTERN.test(sourceText);

  if (!looksLikeSleepRecord) {
    return plan;
  }

  const timeRangeMatch = sourceText.match(SLEEP_TIME_RANGE_PATTERN);

  if (!timeRangeMatch) {
    return plan;
  }

  const nextPlan: AiPlan = {
    ...plan,
    intent: 'sleep',
    sleepStart:
      plan.sleepStart ?? normalizeClock(timeRangeMatch[1], timeRangeMatch[2]),
    sleepEnd:
      plan.sleepEnd ?? normalizeClock(timeRangeMatch[3], timeRangeMatch[4]),
    sleepQuality: plan.sleepQuality ?? inferSleepQuality(sourceText),
  };

  if (
    nextPlan.mode === 'clarify' &&
    nextPlan.sleepStart &&
    nextPlan.sleepEnd &&
    !QUESTION_PATTERN.test(sourceText)
  ) {
    nextPlan.mode = 'command';
    nextPlan.reply = '我知道你的意思了。';
    nextPlan.confidence = Math.max(nextPlan.confidence ?? 0, 0.92);
  }

  return nextPlan;
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
  plan = mergeInferredSleepFields(plan, inferenceText);
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
