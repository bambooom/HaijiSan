import { executeFoodInsertWorkflow } from '../../services/food-workflow';
import type {
  CommandHandlingResult,
  FoodWorkflowExecutionResult,
} from '../../types';
import {
  buildCommandAudit,
  buildHandlerResult,
  createTraceId,
} from '../shared/result-builder';

export function createImageTraceId(timestamp: Date): string {
  return createTraceId('image', timestamp);
}

export function createImageAudit(
  action: 'insertData' | 'updateData' = 'insertData',
  sheet = '',
  changedFields: string[] = [],
) {
  return buildCommandAudit({
    insertCount: sheet && action === 'insertData' ? 1 : 0,
    updateCount: sheet && action === 'updateData' ? 1 : 0,
    writeSheetNames: sheet ? [sheet] : [],
    primaryAction: sheet ? action : '',
    primaryTargetSheet: sheet,
    changedFields,
  });
}

export function buildImageResult(
  reply: string,
  timestamp: Date,
  overrides?: Partial<CommandHandlingResult>,
): CommandHandlingResult {
  return buildHandlerResult(
    {
      tracePrefix: 'image',
      defaultIntent: 'image-ocr',
      defaultHandlingMode: 'ai',
    },
    reply,
    timestamp,
    overrides,
  );
}

export function isFoodWorkflowExecutionResult(
  value:
    | ReturnType<typeof executeFoodInsertWorkflow>
    | { tool: 'insertData'; record: Record<string, unknown> },
): value is FoodWorkflowExecutionResult {
  return 'insertResult' in value;
}
