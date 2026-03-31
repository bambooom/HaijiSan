import { handleFoodCommand } from './food';
import { executePendingMealRecordAction, handleFoodAiMessage } from './food-ai';
import { handleSleepCommand } from './sleep';
import { handleStatusCommand } from './status';
import { handleStockCommand } from './stock';
import { handleWorkoutCommand } from './workout';
import { geminiService } from '../services/gemini';
import {
  clearPendingAiAction,
  getPendingAiAction,
  savePendingAiAction,
} from '../services/pending-action';
import type {
  AiPlan,
  CommandHandlingResult,
  MealType,
  PendingMappedCommandAction,
} from '../types';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

function buildAiResult(
  reply: string,
  status: CommandHandlingResult['status'] = 'success',
  note = '',
): CommandHandlingResult {
  return {
    reply,
    handlingMode: 'ai',
    status,
    note,
  };
}

function isConfirmationText(text: string): boolean {
  return /^(确认|确认一下|确认吧|好|好的|ok|okay|yes)$/i.test(text.trim());
}

function isCancellationText(text: string): boolean {
  return /^(取消|取消一下|取消吧|算了|不要了|no)$/i.test(text.trim());
}

function buildMappedCommandPreview(commandText: string): string {
  return `我准备按这条记录写入：\n${commandText}\n回复“确认”写入，回复“取消”放弃。`;
}

export function handleCancelPendingAction(
  timestamp: Date = new Date(),
): CommandHandlingResult {
  const pendingAction = getPendingAiAction(timestamp);

  if (!pendingAction) {
    return buildAiResult(
      '现在没有待确认的操作，不需要取消。',
      'ignored',
      'pending-action=none',
    );
  }

  clearPendingAiAction();

  return buildAiResult(
    '好，这一步先不写。我已经把刚才的待确认操作取消了。',
    'ignored',
    `pending-action=cancelled; kind=${pendingAction.kind}`.slice(0, 500),
  );
}

function executePendingMappedCommandAction(
  action: PendingMappedCommandAction,
  fallbackTimestamp: Date,
): CommandHandlingResult {
  const createdAt = new Date(action.createdAt);
  const timestamp = Number.isNaN(createdAt.getTime())
    ? fallbackTimestamp
    : createdAt;
  const commandReply = executeMappedCommand(action.commandText, timestamp);

  if (!commandReply) {
    return buildAiResult(
      '我收到了确认，但这次实际写入没有成功。刚才那步已经停住了，你可以重新发一次。',
      'failed',
      `${action.note}; confirmed=true; execute=failed`.slice(0, 500),
    );
  }

  return buildAiResult(
    commandReply,
    'success',
    `${action.note}; confirmed=true; execute=success`.slice(0, 500),
  );
}

function handlePendingAiAction(
  text: string,
  timestamp: Date,
): CommandHandlingResult | null {
  const pendingAction = getPendingAiAction(timestamp);

  if (!pendingAction) {
    return null;
  }

  if (isCancellationText(text)) {
    return handleCancelPendingAction(timestamp);
  }

  if (!isConfirmationText(text)) {
    return buildAiResult(
      `我这里还有一条待确认的操作。\n${pendingAction.previewText}`,
      'ignored',
      `pending-action=blocked; kind=${pendingAction.kind}`.slice(0, 500),
    );
  }

  clearPendingAiAction();

  if (pendingAction.kind === 'meal-record') {
    return executePendingMealRecordAction(pendingAction, timestamp);
  }

  return executePendingMappedCommandAction(pendingAction, timestamp);
}

function buildPeriodCommand(plan: AiPlan): string | null {
  const parts: string[] = ['/period'];

  if (typeof plan.cycleDay === 'number') {
    parts.push(String(plan.cycleDay));
  }

  if (plan.periodNote) {
    parts.push(plan.periodNote);
  }

  return parts.join(' ');
}

function buildCommandFromPlan(plan: AiPlan): string | null {
  switch (plan.intent) {
    case 'weight':
      return typeof plan.weightKg === 'number'
        ? `/weight ${plan.weightKg}`
        : null;
    case 'poo':
      return '/poo';
    case 'period':
      return buildPeriodCommand(plan);
    case 'symptom':
      if (!plan.symptom) {
        return null;
      }

      return plan.cycleDay === null || typeof plan.cycleDay !== 'number'
        ? `/symptom ${plan.symptom}`
        : `/symptom ${plan.symptom} day ${plan.cycleDay}`;
    case 'sleep':
      if (!plan.sleepStart || !plan.sleepEnd) {
        return null;
      }

      return plan.sleepQuality
        ? `/sleep ${plan.sleepStart} ${plan.sleepEnd} ${plan.sleepQuality}`
        : `/sleep ${plan.sleepStart} ${plan.sleepEnd}`;
    case 'workout':
      if (!plan.workoutName || typeof plan.durationMin !== 'number') {
        return null;
      }

      return [
        '/workout',
        plan.workoutName,
        String(plan.durationMin),
        plan.workoutLevel,
        plan.note,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' ');
    case 'food':
      if (!plan.mealType || !plan.mealText) {
        return null;
      }

      return `/food ${MEAL_TYPE_LABELS[plan.mealType]} ${plan.mealText}`;
    case 'food_estimate':
      return null;
    case 'stock_adjust':
    case 'stock_set': {
      if (!plan.stockItemName || typeof plan.stockQuantity !== 'number') {
        return null;
      }

      const command = plan.intent === 'stock_adjust' ? '/stock' : '/setstock';
      const quantityToken =
        plan.intent === 'stock_adjust' && plan.stockQuantity > 0
          ? `+${plan.stockQuantity}`
          : String(plan.stockQuantity);

      return [
        command,
        plan.stockItemName,
        `${quantityToken}${plan.stockUnit ?? ''}`,
        plan.purchaseChannel,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' ');
    }
    case 'stock_check':
      return '/check';
    case 'chat':
      return null;
  }
}

function executeMappedCommand(
  commandText: string,
  timestamp: Date,
): string | null {
  if (
    commandText.startsWith('/weight') ||
    commandText.startsWith('/poo') ||
    commandText.startsWith('/period') ||
    commandText.startsWith('/symptom')
  ) {
    return handleStatusCommand(commandText, timestamp);
  }

  if (commandText.startsWith('/sleep')) {
    return handleSleepCommand(commandText, timestamp);
  }

  if (commandText.startsWith('/workout')) {
    return handleWorkoutCommand(commandText, timestamp);
  }

  if (
    commandText.startsWith('/stock') ||
    commandText.startsWith('/setstock') ||
    commandText.startsWith('/check')
  ) {
    return handleStockCommand(commandText, timestamp);
  }

  if (commandText.startsWith('/food')) {
    return handleFoodCommand(commandText, timestamp);
  }

  return null;
}

function summarizePlan(plan: AiPlan, commandText?: string): string {
  const parts = [`mode=${plan.mode}`, `intent=${plan.intent}`];

  if (commandText) {
    parts.push(`command=${commandText}`);
  }

  if (plan.note) {
    parts.push(`note=${plan.note}`);
  }

  return parts.join('; ').slice(0, 500);
}

export function handleAiMessage(
  text: string,
  timestamp: Date,
): CommandHandlingResult {
  const pendingActionResult = handlePendingAiAction(text, timestamp);

  if (pendingActionResult) {
    return pendingActionResult;
  }

  const plan = geminiService.planMessage(text, timestamp);

  if (plan.mode !== 'command') {
    return buildAiResult(plan.reply, 'success', summarizePlan(plan));
  }

  if (plan.intent === 'food_estimate' || plan.intent === 'food') {
    return handleFoodAiMessage(plan, text, timestamp);
  }

  const commandText = buildCommandFromPlan(plan);

  if (!commandText) {
    return buildAiResult(
      plan.reply ||
        '我理解到你想记录内容，但关键信息还不够。你再补一句具体数值或时间。',
      'ignored',
      summarizePlan(plan),
    );
  }

  if (plan.intent !== 'stock_check') {
    const previewText = buildMappedCommandPreview(commandText);

    savePendingAiAction({
      kind: 'mapped-command',
      createdAt: timestamp.toISOString(),
      sourceText: text,
      previewText,
      commandText,
      note: summarizePlan(plan, commandText),
    });

    return buildAiResult(
      previewText,
      'success',
      `${summarizePlan(plan, commandText)}; pending-confirmation=true`.slice(
        0,
        500,
      ),
    );
  }

  const commandReply = executeMappedCommand(commandText, timestamp);

  if (!commandReply) {
    return buildAiResult(
      '我理解到了你的意图，但这次还没能安全落成记录。你可以换一种更具体的说法，或者直接用 /help 里的命令。',
      'failed',
      summarizePlan(plan, commandText),
    );
  }

  return buildAiResult(
    commandReply,
    'success',
    summarizePlan(plan, commandText),
  );
}
