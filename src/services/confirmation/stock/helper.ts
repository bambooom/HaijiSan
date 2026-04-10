import { foodLogTable } from '../../../tables';
import type {
  CommandAuditFields,
  CommandHandlingResult,
  PendingStockDeductionConfirmation,
} from '../../../types';
import { appendFoodLogNote, formatStockCandidateSummary } from './ui';

export function buildStockAudit(changedFields: string[]): CommandAuditFields {
  return {
    toolCallCount: 1,
    readCount: 0,
    insertCount: 0,
    updateCount: 1,
    readSheetNames: [],
    writeSheetNames: ['FOOD_LOG', 'STOCK'],
    primaryAction: 'updateData',
    primaryTargetSheet: 'FOOD_LOG',
    primarySelectorType: 'row-number',
    primarySelectorValue: '',
    changedFields,
  };
}

export function buildStockResult(
  pending: PendingStockDeductionConfirmation,
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
    intent: 'food-stock-confirmation',
    tool: 'updateData',
    confirmationState: overrides?.confirmationState ?? 'pending',
    resultCode: overrides?.resultCode ?? 'food-stock-pending',
    telegramResponse: overrides?.telegramResponse,
  };
}

export function updateFoodLogAfterDecision(
  pending: PendingStockDeductionConfirmation,
  updates: Record<string, unknown>,
): number | null {
  const matchedRow = foodLogTable.findEntryRow(
    (entry) => entry.food_log_id === pending.payload.foodLogId,
  );

  if (!matchedRow) {
    return null;
  }

  foodLogTable.updateAtRow(matchedRow.rowNumber, updates);
  return matchedRow.rowNumber;
}

export function buildConfirmedNote(
  pending: PendingStockDeductionConfirmation,
): string {
  return `库存扣减已确认：${pending.payload.candidates
    .map(formatStockCandidateSummary)
    .join('；')}`;
}

export function buildCancelledNote(
  pending: PendingStockDeductionConfirmation,
): string {
  return `库存扣减已取消：${pending.payload.candidates
    .map(formatStockCandidateSummary)
    .join('；')}`;
}

export function appendRemovalCancelledNote(
  pending: PendingStockDeductionConfirmation,
): string {
  const currentNote =
    foodLogTable.findEntryRow(
      (entry) => entry.food_log_id === pending.payload.foodLogId,
    )?.entry.note ?? '';

  return appendFoodLogNote(
    currentNote,
    '库存扣减已取消：用户移除了全部待确认项',
  );
}
