import type {
  CommandAuditFields,
  CommandHandlingResult,
  NutritionRequest,
  PendingOcrConfirmation,
} from '../../../types';

export function buildOcrAudit(
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

export function buildOcrResult(
  pending: PendingOcrConfirmation,
  reply: string,
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
    tool: pending.payload.request.tool,
    confirmationState: overrides?.confirmationState ?? 'pending',
    resultCode: overrides?.resultCode ?? 'image-ocr-pending',
    telegramResponse: overrides?.telegramResponse,
  };
}

export function updatePendingCalories(
  pending: PendingOcrConfirmation,
  calories: number,
): PendingOcrConfirmation {
  const nextRequest =
    pending.payload.request.tool === 'updateData'
      ? {
          ...pending.payload.request,
          updates: {
            ...pending.payload.request.updates,
            calories_kcal: calories,
          },
        }
      : {
          ...pending.payload.request,
          record: {
            ...pending.payload.request.record,
            calories_kcal: calories,
          },
        };

  return {
    ...pending,
    payload: {
      ...pending.payload,
      request: nextRequest,
      awaitingField: null,
      editPromptMessageId: null,
    },
  };
}
