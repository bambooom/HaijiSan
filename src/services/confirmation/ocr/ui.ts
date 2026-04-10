import type {
  PendingOcrConfirmation,
  NutritionRequest,
  OcrCallbackData,
} from '../../../types';
import { buildForceReply, buildInlineKeyboard } from '../core';

function getRecordFromRequest(
  request: NutritionRequest,
): Record<string, unknown> {
  return request.tool === 'updateData' ? request.updates : request.record;
}

export function getFoodName(request: NutritionRequest): string {
  const record = getRecordFromRequest(request);
  const foodName = record.food_name;

  return typeof foodName === 'string' && foodName.trim()
    ? foodName.trim()
    : '未命名食物';
}

function formatMetric(
  value: unknown,
  unit: string,
  emptyText = '未识别',
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value} ${unit}`.trim()
    : emptyText;
}

export function buildOcrPreviewText(pending: PendingOcrConfirmation): string {
  const record = getRecordFromRequest(pending.payload.request);

  return [
    '请确认这条营养参考：',
    `食物：${getFoodName(pending.payload.request)}`,
    `热量：${formatMetric(record.calories_kcal, 'kcal')}`,
    `蛋白质：${formatMetric(record.protein_g, 'g')}`,
    `脂肪：${formatMetric(record.fat_g, 'g')}`,
    `碳水：${formatMetric(record.carbs_g, 'g')}`,
  ].join('\n');
}

export function buildOcrEditText(pending: PendingOcrConfirmation): string {
  return `${buildOcrPreviewText(pending)}\n\n请选择要修正的字段：`;
}

export function buildOcrConfirmedText(
  pending: PendingOcrConfirmation,
  reply: string,
): string {
  return `${buildOcrPreviewText(pending)}\n\n状态：已确认\n${reply}`;
}

export function buildOcrCancelledText(pending: PendingOcrConfirmation): string {
  return `${buildOcrPreviewText(pending)}\n\n状态：已取消`;
}

export function buildOcrMainKeyboard(id: string) {
  return buildInlineKeyboard([
    [
      { text: '确认', callbackData: `ocr:confirm:${id}` },
      { text: '取消', callbackData: `ocr:cancel:${id}` },
      { text: '修正', callbackData: `ocr:edit:${id}` },
    ],
  ]);
}

export function buildOcrEditKeyboard(id: string) {
  return buildInlineKeyboard([
    [{ text: '修改热量', callbackData: `ocr:field:calories_kcal:${id}` }],
    [
      { text: '返回', callbackData: `ocr:back:${id}` },
      { text: '取消', callbackData: `ocr:cancel:${id}` },
    ],
  ]);
}

export function buildOcrForceReplyMarkup() {
  return buildForceReply('请输入正确的热量（kcal）');
}

export function parseOcrCallbackData(data: string): OcrCallbackData | null {
  const parts = data.split(':');

  if (parts.length === 3 && parts[0] === 'ocr') {
    const action = parts[1];

    if (
      action === 'confirm' ||
      action === 'cancel' ||
      action === 'edit' ||
      action === 'back'
    ) {
      return { action, id: parts[2] };
    }
  }

  if (parts.length === 4 && parts[0] === 'ocr' && parts[1] === 'field') {
    const field = parts[2];

    if (field === 'calories_kcal') {
      return { action: 'field', field, id: parts[3] };
    }
  }

  return null;
}
