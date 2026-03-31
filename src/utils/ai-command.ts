import { AI_INTENTS, AI_NOTE_MAX_LENGTH } from '../constants/ai';
import { SLASH_COMMANDS } from '../constants/commands';
import { MEAL_TYPE_LABELS } from '../shared/meal';
import type { AiPlan } from '../types';

function joinCommandParts(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ');
}

function buildPeriodCommand(plan: AiPlan): string {
  return joinCommandParts([
    SLASH_COMMANDS.PERIOD,
    typeof plan.cycleDay === 'number' ? String(plan.cycleDay) : null,
    plan.periodNote,
  ]);
}

function buildSymptomCommand(plan: AiPlan): string | null {
  if (!plan.symptom) {
    return null;
  }

  return plan.cycleDay === null || typeof plan.cycleDay !== 'number'
    ? joinCommandParts([SLASH_COMMANDS.SYMPTOM, plan.symptom])
    : joinCommandParts([
        SLASH_COMMANDS.SYMPTOM,
        plan.symptom,
        'day',
        String(plan.cycleDay),
      ]);
}

function buildSleepCommand(plan: AiPlan): string | null {
  if (!plan.sleepStart || !plan.sleepEnd) {
    return null;
  }

  return joinCommandParts([
    SLASH_COMMANDS.SLEEP,
    plan.sleepStart,
    plan.sleepEnd,
    plan.sleepQuality,
  ]);
}

function buildWorkoutCommand(plan: AiPlan): string | null {
  if (!plan.workoutName || typeof plan.durationMin !== 'number') {
    return null;
  }

  return joinCommandParts([
    SLASH_COMMANDS.WORKOUT,
    plan.workoutName,
    String(plan.durationMin),
    plan.workoutLevel,
    plan.note,
  ]);
}

function buildFoodCommand(plan: AiPlan): string | null {
  if (!plan.mealType || !plan.mealText) {
    return null;
  }

  return joinCommandParts([
    SLASH_COMMANDS.FOOD,
    MEAL_TYPE_LABELS[plan.mealType],
    plan.mealText,
  ]);
}

function buildStockCommand(plan: AiPlan): string | null {
  if (!plan.stockItemName || typeof plan.stockQuantity !== 'number') {
    return null;
  }

  const command =
    plan.intent === AI_INTENTS.STOCK_ADJUST
      ? SLASH_COMMANDS.STOCK
      : SLASH_COMMANDS.SET_STOCK;
  const quantityToken =
    plan.intent === AI_INTENTS.STOCK_ADJUST && plan.stockQuantity > 0
      ? `+${plan.stockQuantity}`
      : String(plan.stockQuantity);

  return joinCommandParts([
    command,
    plan.stockItemName,
    `${quantityToken}${plan.stockUnit ?? ''}`,
    plan.purchaseChannel,
  ]);
}

export function truncateAiNote(note: string): string {
  return note.slice(0, AI_NOTE_MAX_LENGTH);
}

export function appendAiNote(note: string, detail: string): string {
  return truncateAiNote(`${note}; ${detail}`);
}

export function summarizeAiPlan(plan: AiPlan, commandText?: string): string {
  const parts = [`mode=${plan.mode}`, `intent=${plan.intent}`];

  if (commandText) {
    parts.push(`command=${commandText}`);
  }

  if (plan.note) {
    parts.push(`note=${plan.note}`);
  }

  return truncateAiNote(parts.join('; '));
}

export function buildCommandFromAiPlan(plan: AiPlan): string | null {
  switch (plan.intent) {
    case AI_INTENTS.WEIGHT:
      return typeof plan.weightKg === 'number'
        ? joinCommandParts([SLASH_COMMANDS.WEIGHT, String(plan.weightKg)])
        : null;
    case AI_INTENTS.POO:
      return SLASH_COMMANDS.POO;
    case AI_INTENTS.PERIOD:
      return buildPeriodCommand(plan);
    case AI_INTENTS.SYMPTOM:
      return buildSymptomCommand(plan);
    case AI_INTENTS.SLEEP:
      return buildSleepCommand(plan);
    case AI_INTENTS.WORKOUT:
      return buildWorkoutCommand(plan);
    case AI_INTENTS.FOOD:
      return buildFoodCommand(plan);
    case AI_INTENTS.FOOD_ESTIMATE:
      return null;
    case AI_INTENTS.STOCK_ADJUST:
    case AI_INTENTS.STOCK_SET:
      return buildStockCommand(plan);
    case AI_INTENTS.STOCK_CHECK:
      return SLASH_COMMANDS.CHECK;
    case AI_INTENTS.CHAT:
      return null;
  }
}
