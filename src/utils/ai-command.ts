import { AI_INTENTS, AI_NOTE_MAX_LENGTH } from '../constants/ai';
import { SLASH_COMMANDS } from '../constants/commands';
import { MEAL_TYPE_LABELS } from '../shared/meal';
import type { AiPlan, AiStockItem } from '../types';

function joinCommandParts(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ');
}

function normalizeAiStockItem(item: AiStockItem): AiStockItem | null {
  const name = item.name?.trim();
  const unit = item.unit?.trim();
  const purchaseChannel = item.purchaseChannel?.trim();

  if (!name || !Number.isFinite(item.quantity)) {
    return null;
  }

  return {
    name,
    quantity: item.quantity,
    unit: unit || undefined,
    purchaseChannel: purchaseChannel || undefined,
  };
}

export function resolveAiStockItems(plan: AiPlan): AiStockItem[] {
  const normalizedItems = (plan.stockItems ?? [])
    .map((item) => normalizeAiStockItem(item))
    .filter((item): item is AiStockItem => item !== null);

  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  if (!plan.stockItemName || typeof plan.stockQuantity !== 'number') {
    return [];
  }

  return [
    {
      name: plan.stockItemName.trim(),
      quantity: plan.stockQuantity,
      unit: plan.stockUnit?.trim() || undefined,
      purchaseChannel: plan.purchaseChannel?.trim() || undefined,
    },
  ];
}

export function buildStockMutationCommandText(
  operation: 'adjust' | 'set',
  item: AiStockItem,
): string {
  const command =
    operation === 'adjust' ? SLASH_COMMANDS.STOCK : SLASH_COMMANDS.SET_STOCK;
  const quantityToken =
    operation === 'adjust' && item.quantity > 0
      ? `+${item.quantity}`
      : String(item.quantity);

  return joinCommandParts([
    command,
    item.name,
    `${quantityToken}${item.unit ?? ''}`,
    item.purchaseChannel,
  ]);
}

function buildStockPreviewLine(
  operation: 'adjust' | 'set',
  item: AiStockItem,
): string {
  const quantityToken =
    operation === 'adjust' && item.quantity > 0
      ? `+${item.quantity}`
      : String(item.quantity);
  const channelSuffix = item.purchaseChannel
    ? `，渠道 ${item.purchaseChannel}`
    : '';

  return `- ${item.name} ${quantityToken}${item.unit ?? ''}${channelSuffix}`;
}

export function buildStockBatchPreview(
  intent: AiPlan['intent'],
  items: AiStockItem[],
): string {
  const operation = intent === AI_INTENTS.STOCK_SET ? 'set' : 'adjust';
  const operationLabel = operation === 'set' ? '校正' : '更新';

  return `我准备${operationLabel}这些库存：\n${items
    .map((item) => buildStockPreviewLine(operation, item))
    .join('\n')}\n回复“确认”写入，回复“取消”放弃。`;
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
  const stockItems = resolveAiStockItems(plan);

  if (stockItems.length !== 1) {
    return null;
  }

  const [stockItem] = stockItems;

  const command =
    plan.intent === AI_INTENTS.STOCK_ADJUST
      ? SLASH_COMMANDS.STOCK
      : SLASH_COMMANDS.SET_STOCK;
  const quantityToken =
    plan.intent === AI_INTENTS.STOCK_ADJUST && stockItem.quantity > 0
      ? `+${stockItem.quantity}`
      : String(stockItem.quantity);

  return joinCommandParts([
    command,
    stockItem.name,
    `${quantityToken}${stockItem.unit ?? ''}`,
    stockItem.purchaseChannel,
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
    case AI_INTENTS.NUTRITION_SUMMARY:
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
