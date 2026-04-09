import { executeInsertData, executeUpdateData } from '../tools';
import type { InsertDataRequest, UpdateDataRequest } from '../tools/types';
import type {
  CommandAuditFields,
  CommandHandlingResult,
  TelegramReplyMarkup,
} from '../types';
import { answerCallbackQuery, editText, sendText } from './telegram';

const OCR_CONFIRMATION_TTL_SECONDS = 6 * 60 * 60;

type NutritionRequest = InsertDataRequest | UpdateDataRequest;

type EditableField = 'calories_kcal';

type PendingOcrConfirmation = {
  id: string;
  kind: 'nutrition_label';
  chatId: string;
  traceId: string;
  request: NutritionRequest;
  createdAtIso: string;
  previewMessageId: number | null;
  editPromptMessageId: number | null;
  awaitingField: EditableField | null;
};

function getCache(): GoogleAppsScript.Cache.Cache | null {
  if (
    typeof CacheService === 'undefined' ||
    typeof CacheService.getScriptCache !== 'function'
  ) {
    return null;
  }

  return CacheService.getScriptCache();
}

function getPendingKey(id: string): string {
  return `ocr_confirmation:${id}`;
}

function getPromptKey(chatId: string, messageId: number): string {
  return `ocr_confirmation_prompt:${chatId}:${messageId}`;
}

function createConfirmationId(): string {
  if (
    typeof Utilities !== 'undefined' &&
    typeof Utilities.getUuid === 'function'
  ) {
    return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function savePendingConfirmation(pending: PendingOcrConfirmation): void {
  getCache()?.put(
    getPendingKey(pending.id),
    JSON.stringify(pending),
    OCR_CONFIRMATION_TTL_SECONDS,
  );
}

function deletePendingConfirmation(id: string): void {
  getCache()?.remove(getPendingKey(id));
}

function loadPendingConfirmation(id: string): PendingOcrConfirmation | null {
  const raw = getCache()?.get(getPendingKey(id));

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as PendingOcrConfirmation;
}

function savePromptMapping(
  chatId: string,
  messageId: number,
  confirmationId: string,
): void {
  getCache()?.put(
    getPromptKey(chatId, messageId),
    confirmationId,
    OCR_CONFIRMATION_TTL_SECONDS,
  );
}

function consumePromptMapping(
  chatId: string,
  messageId: number,
): string | null {
  const key = getPromptKey(chatId, messageId);
  const confirmationId = getCache()?.get(key) ?? null;

  if (confirmationId) {
    getCache()?.remove(key);
  }

  return confirmationId;
}

function buildAudit(
  request: NutritionRequest,
  fields: string[],
): CommandAuditFields {
  return {
    toolCallCount: 1,
    readCount: 0,
    insertCount: request.tool === 'insertData' ? 1 : 0,
    updateCount: request.tool === 'updateData' ? 1 : 0,
    readSheetNames: [],
    writeSheetNames: [request.sheet],
    primaryAction: request.tool,
    primaryTargetSheet: request.sheet,
    primarySelectorType:
      request.tool === 'updateData' ? request.selector.type : '',
    primarySelectorValue:
      request.tool === 'updateData' ? String(request.selector.rowNumber) : '',
    changedFields: fields,
  };
}

function getRecordFromRequest(
  request: NutritionRequest,
): Record<string, unknown> {
  return request.tool === 'updateData' ? request.updates : request.record;
}

function getFoodName(request: NutritionRequest): string {
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

function buildPreviewText(pending: PendingOcrConfirmation): string {
  const record = getRecordFromRequest(pending.request);

  return [
    '请确认这条营养参考：',
    `食物：${getFoodName(pending.request)}`,
    `热量：${formatMetric(record.calories_kcal, 'kcal')}`,
    `蛋白质：${formatMetric(record.protein_g, 'g')}`,
    `脂肪：${formatMetric(record.fat_g, 'g')}`,
    `碳水：${formatMetric(record.carbs_g, 'g')}`,
  ].join('\n');
}

function buildEditText(pending: PendingOcrConfirmation): string {
  return `${buildPreviewText(pending)}\n\n请选择要修正的字段：`;
}

function buildConfirmedText(
  pending: PendingOcrConfirmation,
  reply: string,
): string {
  return `${buildPreviewText(pending)}\n\n状态：已确认\n${reply}`;
}

function buildCancelledText(pending: PendingOcrConfirmation): string {
  return `${buildPreviewText(pending)}\n\n状态：已取消`;
}

function buildMainKeyboard(id: string): TelegramReplyMarkup {
  return {
    inlineKeyboard: [
      [
        { text: '确认', callbackData: `ocr:confirm:${id}` },
        { text: '取消', callbackData: `ocr:cancel:${id}` },
        { text: '修正', callbackData: `ocr:edit:${id}` },
      ],
    ],
  };
}

function buildEditKeyboard(id: string): TelegramReplyMarkup {
  return {
    inlineKeyboard: [
      [{ text: '修改热量', callbackData: `ocr:field:calories_kcal:${id}` }],
      [
        { text: '返回', callbackData: `ocr:back:${id}` },
        { text: '取消', callbackData: `ocr:cancel:${id}` },
      ],
    ],
  };
}

function buildForceReplyMarkup(): TelegramReplyMarkup {
  return {
    forceReply: true,
    inputFieldPlaceholder: '请输入正确的热量（kcal）',
  };
}

function parseCallbackData(data: string): {
  action: 'confirm' | 'cancel' | 'edit' | 'back' | 'field';
  id: string;
  field?: EditableField;
} | null {
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

function updatePendingCalories(
  pending: PendingOcrConfirmation,
  calories: number,
): PendingOcrConfirmation {
  const nextRequest =
    pending.request.tool === 'updateData'
      ? {
          ...pending.request,
          updates: {
            ...pending.request.updates,
            calories_kcal: calories,
          },
        }
      : {
          ...pending.request,
          record: {
            ...pending.request.record,
            calories_kcal: calories,
          },
        };

  return {
    ...pending,
    request: nextRequest,
    awaitingField: null,
    editPromptMessageId: null,
  };
}

function buildResult(
  pending: PendingOcrConfirmation,
  reply: string,
  timestamp: Date,
  overrides?: Partial<CommandHandlingResult>,
): CommandHandlingResult {
  return {
    reply,
    handlingMode: overrides?.handlingMode ?? 'ai',
    status: overrides?.status ?? 'success',
    note: overrides?.note ?? '',
    audit: overrides?.audit,
    traceId: pending.traceId,
    intent: 'image-ocr',
    tool: pending.request.tool,
    confirmationState: overrides?.confirmationState ?? 'pending',
    resultCode: overrides?.resultCode ?? 'image-ocr-pending',
    telegramResponse: overrides?.telegramResponse,
  };
}

export function createNutritionLabelConfirmation(
  chatId: string,
  traceId: string,
  request: NutritionRequest,
  timestamp: Date,
): CommandHandlingResult {
  const pending: PendingOcrConfirmation = {
    id: createConfirmationId(),
    kind: 'nutrition_label',
    chatId,
    traceId,
    request,
    createdAtIso: timestamp.toISOString(),
    previewMessageId: null,
    editPromptMessageId: null,
    awaitingField: null,
  };

  savePendingConfirmation(pending);

  return buildResult(pending, buildPreviewText(pending), timestamp, {
    note: `${request.sheet}; awaiting confirmation`,
    confirmationState: 'pending',
    resultCode: 'image-ocr-pending',
    telegramResponse: {
      pendingConfirmationId: pending.id,
      replyMarkup: buildMainKeyboard(pending.id),
    },
  });
}

export function attachConfirmationPreviewMessage(
  confirmationId: string,
  messageId: number,
): void {
  const pending = loadPendingConfirmation(confirmationId);

  if (!pending) {
    return;
  }

  savePendingConfirmation({
    ...pending,
    previewMessageId: messageId,
  });
}

export function handleOcrConfirmationCallback(
  chatId: string,
  callbackQueryId: string,
  data: string,
  messageId: number,
  timestamp: Date,
): CommandHandlingResult | null {
  const parsed = parseCallbackData(data);

  if (!parsed) {
    return null;
  }

  const pending = loadPendingConfirmation(parsed.id);

  if (!pending || pending.chatId !== chatId) {
    answerCallbackQuery(callbackQueryId, '这条确认已失效。');

    return {
      reply: '确认已失效。',
      handlingMode: 'ai',
      status: 'failed',
      note: 'pending OCR confirmation not found',
      traceId: '',
      intent: 'image-ocr',
      tool: '',
      confirmationState: 'failed',
      resultCode: 'image-ocr-confirmation-missing',
    };
  }

  const withMessage =
    pending.previewMessageId === messageId
      ? pending
      : { ...pending, previewMessageId: messageId };
  savePendingConfirmation(withMessage);

  switch (parsed.action) {
    case 'confirm': {
      const committedReply =
        withMessage.request.tool === 'updateData'
          ? `已更新热量参考：${getFoodName(withMessage.request)}。`
          : `已记录热量参考：${getFoodName(withMessage.request)}。`;

      if (withMessage.request.tool === 'updateData') {
        const executionResult = executeUpdateData(
          withMessage.request,
          timestamp,
        );

        answerCallbackQuery(callbackQueryId, '已确认');
        editText(
          chatId,
          messageId,
          buildConfirmedText(withMessage, committedReply),
        );
        deletePendingConfirmation(withMessage.id);

        return buildResult(withMessage, committedReply, timestamp, {
          note: `${withMessage.request.sheet}; confirmed`,
          confirmationState: 'confirmed',
          resultCode: 'image-ocr-confirmed',
          audit: buildAudit(
            withMessage.request,
            Object.keys(executionResult.updates).sort(),
          ),
        });
      }

      const executionResult = executeInsertData(withMessage.request, timestamp);

      answerCallbackQuery(callbackQueryId, '已确认');
      editText(
        chatId,
        messageId,
        buildConfirmedText(withMessage, committedReply),
      );
      deletePendingConfirmation(withMessage.id);

      return buildResult(withMessage, committedReply, timestamp, {
        note: `${withMessage.request.sheet}; confirmed`,
        confirmationState: 'confirmed',
        resultCode: 'image-ocr-confirmed',
        audit: buildAudit(
          withMessage.request,
          Object.keys(executionResult.record).sort(),
        ),
      });
    }
    case 'cancel':
      answerCallbackQuery(callbackQueryId, '已取消');
      editText(chatId, messageId, buildCancelledText(withMessage));
      deletePendingConfirmation(withMessage.id);

      return buildResult(withMessage, '已取消这条 OCR 结果。', timestamp, {
        note: `${withMessage.request.sheet}; cancelled`,
        confirmationState: 'cancelled',
        resultCode: 'image-ocr-cancelled',
      });
    case 'edit':
      answerCallbackQuery(callbackQueryId, '请选择要修正的字段');
      editText(chatId, messageId, buildEditText(withMessage), {
        replyMarkup: buildEditKeyboard(withMessage.id),
      });

      return buildResult(withMessage, '进入修正模式。', timestamp, {
        note: `${withMessage.request.sheet}; editing`,
        confirmationState: 'pending',
        resultCode: 'image-ocr-editing',
      });
    case 'back':
      answerCallbackQuery(callbackQueryId, '已返回确认视图');
      editText(chatId, messageId, buildPreviewText(withMessage), {
        replyMarkup: buildMainKeyboard(withMessage.id),
      });

      return buildResult(withMessage, '已返回确认视图。', timestamp, {
        note: `${withMessage.request.sheet}; back to preview`,
        confirmationState: 'pending',
        resultCode: 'image-ocr-preview',
      });
    case 'field': {
      answerCallbackQuery(callbackQueryId, '请输入正确的热量');
      const promptMessageId = sendText(chatId, '请输入正确的热量（kcal）', {
        replyMarkup: buildForceReplyMarkup(),
      });
      const nextPending = {
        ...withMessage,
        awaitingField: parsed.field ?? null,
        editPromptMessageId: promptMessageId,
      };

      savePendingConfirmation(nextPending);

      if (promptMessageId !== null) {
        savePromptMapping(chatId, promptMessageId, nextPending.id);
      }

      return buildResult(nextPending, '等待热量输入。', timestamp, {
        note: `${withMessage.request.sheet}; awaiting calories correction`,
        confirmationState: 'pending',
        resultCode: 'image-ocr-awaiting-field-input',
      });
    }
  }
}

export function handleOcrConfirmationReply(
  chatId: string,
  replyToMessageId: number,
  text: string,
  timestamp: Date,
): CommandHandlingResult | null {
  const confirmationId = consumePromptMapping(chatId, replyToMessageId);

  if (!confirmationId) {
    return null;
  }

  const pending = loadPendingConfirmation(confirmationId);

  if (
    !pending ||
    pending.chatId !== chatId ||
    pending.awaitingField !== 'calories_kcal'
  ) {
    return null;
  }

  const calories = Number(text.trim());

  if (!Number.isFinite(calories) || calories < 0) {
    const nextPromptId = sendText(
      chatId,
      '热量格式不对，请输入数字，例如 210',
      {
        replyMarkup: buildForceReplyMarkup(),
      },
    );

    if (nextPromptId !== null) {
      savePromptMapping(chatId, nextPromptId, pending.id);
      savePendingConfirmation({
        ...pending,
        editPromptMessageId: nextPromptId,
      });
    }

    return buildResult(pending, '热量输入无效。', timestamp, {
      status: 'failed',
      note: `${pending.request.sheet}; invalid calories input`,
      confirmationState: 'pending',
      resultCode: 'image-ocr-invalid-field-input',
    });
  }

  const nextPending = updatePendingCalories(pending, calories);
  savePendingConfirmation(nextPending);

  if (nextPending.previewMessageId !== null) {
    editText(
      chatId,
      nextPending.previewMessageId,
      buildPreviewText(nextPending),
      { replyMarkup: buildMainKeyboard(nextPending.id) },
    );
  }

  sendText(chatId, '已更新热量，请确认或继续修正。');

  return buildResult(nextPending, '已更新热量，请确认或继续修正。', timestamp, {
    note: `${nextPending.request.sheet}; calories updated`,
    confirmationState: 'pending',
    resultCode: 'image-ocr-field-updated',
  });
}
