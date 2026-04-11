import { executeInsertData } from '../../tools';
import type {
  FoodLogInsertRequest,
  FoodWorkflowExecutionResult,
  InsertDataRequest,
} from '../../types';
import {
  applyResolvedFieldsToFoodRecord,
  buildMealStructure,
  extractStructuredItems,
  resolveMealWithAiFallback,
} from './meal';
import { applyStockSideEffects } from './stock';
import { assertValidFoodLogDomainRecord } from '../validation/domain';

// This orchestration layer keeps the FOOD_LOG write path readable:
// 1) normalize meal items, 2) enrich nutrition, 3) plan stock side effects,
// 4) persist the FOOD_LOG row, 5) emit a confirmation draft if stock needs review.
export function executeFoodInsertWorkflow(
  request: InsertDataRequest | FoodLogInsertRequest,
  timestamp: Date,
): FoodWorkflowExecutionResult {
  const draft = buildMealStructure(
    request.record,
    extractStructuredItems(request),
  );
  const resolution = resolveMealWithAiFallback(draft, timestamp);
  const enrichedRecord = applyResolvedFieldsToFoodRecord(
    request.record,
    draft,
    resolution,
  );
  assertValidFoodLogDomainRecord(enrichedRecord);
  const stockSideEffects = applyStockSideEffects(
    enrichedRecord,
    resolution,
    timestamp,
  );

  const insertResult = executeInsertData(
    {
      tool: 'insertData',
      sheet: 'FOOD_LOG',
      record: stockSideEffects.record,
    },
    timestamp,
  );

  const foodLogId = insertResult.record.food_log_id;

  return {
    insertResult,
    pendingStockDeduction:
      typeof foodLogId === 'string' &&
      stockSideEffects.stockPlan.pendingCandidates.length > 0
        ? {
            foodLogId,
            mealText: draft.mealText,
            candidates: stockSideEffects.stockPlan.pendingCandidates,
          }
        : undefined,
  };
}
