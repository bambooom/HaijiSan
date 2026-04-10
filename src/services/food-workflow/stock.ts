import { stockTable } from '../../tables';
import type {
  MealResolvedItem,
  MealResolutionResult,
  PendingStockDeductionCandidate,
  StockSideEffectPlan,
  ToolRecord,
} from '../../types';
import {
  canAutoAdjustStock,
  normalizeUnit,
  resolveStockQuantity,
  roundNutritionValue,
} from './units';
import { uniqueValues } from '../../utils/value';

function appendRecordNotes(record: ToolRecord, notes: string[]): ToolRecord {
  if (notes.length === 0) {
    return record;
  }

  const existingNote =
    typeof record.note === 'string' && record.note.trim()
      ? record.note.trim()
      : '';

  return {
    ...record,
    note: [existingNote, ...notes].filter(Boolean).join('\n'),
  };
}

function buildPendingCandidateReason(
  item: MealResolvedItem,
  stockUnit: string,
  stockQuantity: number,
): string {
  const normalizedItemUnit = normalizeUnit(item.unit);
  const normalizedStockUnit = normalizeUnit(stockUnit);

  if (normalizedItemUnit === normalizedStockUnit) {
    return Number.isInteger(stockQuantity)
      ? 'matched stock item but requires manual confirmation'
      : 'matched stock item with fractional quantity; requires confirmation';
  }

  return `converted ${item.quantity} ${item.unit} to ${roundNutritionValue(stockQuantity)} ${stockUnit}; requires confirmation`;
}

function formatStockCandidateSummary(
  candidate: PendingStockDeductionCandidate,
): string {
  return `${candidate.stockItemName} -${candidate.stockQuantity}${candidate.stockUnit}`;
}

export function applyStockSideEffects(
  record: ToolRecord,
  resolution: MealResolutionResult,
  timestamp: Date,
): { record: ToolRecord; stockPlan: StockSideEffectPlan } {
  const stockPlan = resolution.items.reduce<StockSideEffectPlan>(
    (plan, item) => {
      const stockEntry = stockTable.findByName(item.itemName);

      if (!stockEntry || item.source !== 'reference') {
        return plan;
      }

      const stockQuantity = resolveStockQuantity(
        item.quantity,
        item.unit,
        stockEntry.unit,
      );

      if (stockQuantity === null) {
        return {
          ...plan,
          skippedNotes: plan.skippedNotes.concat(
            `${item.itemName} 未扣减库存：单位 ${item.unit} 无法可靠换算为 ${stockEntry.unit}`,
          ),
        };
      }

      if (canAutoAdjustStock(item.unit, item.quantity, stockEntry.unit)) {
        const result = stockTable.adjustStock(
          timestamp,
          stockEntry.item_name,
          -stockQuantity,
          stockEntry.unit,
          undefined,
          undefined,
        );

        return result.ok
          ? {
              ...plan,
              linkedStockItemIds: plan.linkedStockItemIds.concat(
                stockEntry.stock_item_id,
              ),
            }
          : {
              ...plan,
              skippedNotes: plan.skippedNotes.concat(
                `${item.itemName} 未扣减库存：${result.reason}`,
              ),
            };
      }

      return {
        ...plan,
        pendingCandidates: plan.pendingCandidates.concat({
          itemName: item.itemName,
          itemQuantity: item.quantity,
          itemUnit: item.unit,
          stockItemId: stockEntry.stock_item_id,
          stockItemName: stockEntry.item_name,
          stockQuantity: roundNutritionValue(stockQuantity),
          stockUnit: stockEntry.unit,
          reason: buildPendingCandidateReason(
            item,
            stockEntry.unit,
            stockQuantity,
          ),
        }),
      };
    },
    {
      linkedStockItemIds: [],
      pendingCandidates: [],
      skippedNotes: [],
    },
  );

  const linkedStockItemIds = uniqueValues(stockPlan.linkedStockItemIds);
  let nextRecord = record;

  if (
    linkedStockItemIds.length > 0 &&
    !(
      typeof record.linked_stock_item_ids === 'string' &&
      record.linked_stock_item_ids.trim()
    )
  ) {
    nextRecord = {
      ...nextRecord,
      linked_stock_item_ids: linkedStockItemIds.join(', '),
    };
  }

  const stockNotes: string[] = [];

  if (stockPlan.pendingCandidates.length > 0) {
    stockNotes.push(
      `库存扣减待确认：${stockPlan.pendingCandidates
        .map(formatStockCandidateSummary)
        .join('；')}`,
    );
  }

  if (stockPlan.skippedNotes.length > 0) {
    stockNotes.push(...stockPlan.skippedNotes);
  }

  return {
    record: appendRecordNotes(nextRecord, stockNotes),
    stockPlan: {
      ...stockPlan,
      linkedStockItemIds,
    },
  };
}
