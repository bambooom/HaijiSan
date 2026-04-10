import {
  CONTEXT_EXPANSION_KEYWORDS,
  DEFAULT_CONVERSATION_CONTEXT_TURNS,
  EXPANDED_CONVERSATION_CONTEXT_TURNS,
} from '../../constants/ai';
import { executeFoodInsertWorkflow } from '../../services/food-workflow';
import { botLogTable } from '../../tables/bot-log-table';
import { executeGenericToolRequest } from '../../tools';
import type {
  CommandAuditFields,
  ConversationTurn,
  FoodLogInsertRequest,
  FoodWorkflowExecutionResult,
  GenericToolRequest,
  GenericToolResult,
  ToolSelector,
} from '../../types';
import {
  buildCommandAudit,
  buildHandlerResult,
  createTraceId,
} from '../shared/result-builder';

export type AiToolRequest = GenericToolRequest | FoodLogInsertRequest;

export function createAiTraceId(timestamp: Date): string {
  return createTraceId('ai', timestamp);
}

export function buildAiResult(
  reply: string,
  timestamp: Date,
  overrides?: Partial<import('../../types').CommandHandlingResult>,
) {
  return buildHandlerResult(
    {
      tracePrefix: 'ai',
      defaultIntent: '',
      defaultHandlingMode: 'ai',
    },
    reply,
    timestamp,
    overrides,
  );
}

export function createEmptyAudit(primaryAction = ''): CommandAuditFields {
  return buildCommandAudit({ primaryAction });
}

function formatSelectorValue(selector: ToolSelector): string {
  switch (selector.type) {
    case 'date':
      return selector.date;
    case 'date-range':
      return `${selector.startDate}..${selector.endDate}`;
    case 'recent':
      return selector.referenceDate
        ? `limit=${selector.limit};referenceDate=${selector.referenceDate}`
        : `limit=${selector.limit}`;
    case 'row-number':
      return String(selector.rowNumber);
  }
}

export function buildAuditFromRequest(
  request: AiToolRequest,
): CommandAuditFields {
  switch (request.tool) {
    case 'readData':
      return buildCommandAudit({
        readCount: 1,
        readSheetNames: [request.sheet],
        primaryAction: request.tool,
        primaryTargetSheet: request.sheet,
        primarySelectorType: request.selector.type,
        primarySelectorValue: formatSelectorValue(request.selector),
      });
    case 'insertData':
    case 'insertFoodLog':
      return buildCommandAudit({
        insertCount: 1,
        writeSheetNames: [request.sheet],
        primaryAction: request.tool,
        primaryTargetSheet: request.sheet,
        changedFields: Object.keys(request.record).sort(),
      });
    case 'updateData':
      return buildCommandAudit({
        updateCount: 1,
        writeSheetNames: [request.sheet],
        primaryAction: request.tool,
        primaryTargetSheet: request.sheet,
        primarySelectorType: request.selector.type,
        primarySelectorValue: formatSelectorValue(request.selector),
        changedFields: Object.keys(request.updates).sort(),
      });
  }
}

function shouldExpandConversationContext(text: string): boolean {
  return CONTEXT_EXPANSION_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function getConversationHistory(text: string): ConversationTurn[] {
  const limit = shouldExpandConversationContext(text)
    ? EXPANDED_CONVERSATION_CONTEXT_TURNS
    : DEFAULT_CONVERSATION_CONTEXT_TURNS;

  return botLogTable.listRecentConversationTurns(limit);
}

function formatReadResult(
  result: Extract<GenericToolResult, { tool: 'readData' }>,
): string {
  if (result.rows.length === 0) {
    return `我没有查到 ${result.sheet} 的记录。`;
  }

  const preview = result.rows
    .slice(0, 5)
    .map(
      (row) => `第 ${row.rowNumber} 行\n${JSON.stringify(row.record, null, 2)}`,
    )
    .join('\n\n');
  const suffix = result.rows.length > 5 ? '\n\n其余结果已省略。' : '';

  return `我查到 ${result.rows.length} 条 ${result.sheet} 记录。\n\n${preview}${suffix}`;
}

function formatWriteFallbackResult(
  result: Extract<GenericToolResult, { tool: 'insertData' | 'updateData' }>,
): string {
  const action = result.tool === 'insertData' ? '记录' : '更新';

  switch (result.sheet) {
    case 'SLEEP_LOG':
      return `已${action}睡眠数据。`;
    case 'WORKOUT_LOG':
      return `已${action}运动数据。`;
    case 'FOOD_LOG':
      return `已${action}饮食记录。`;
    case 'BODY_LOG':
      return `已${action}身体指标。`;
    case 'STATUS_LOG':
      return `已${action}状态记录。`;
    case 'REF_CALORIES':
      return `已${action}热量参考数据。`;
    case 'STOCK':
      return `已${action}库存数据。`;
    case 'BOT_LOG':
      return `已${action}系统日志。`;
  }
}

export function formatToolResult(result: GenericToolResult): string {
  switch (result.tool) {
    case 'readData':
      return formatReadResult(result);
    case 'insertData':
      return formatWriteFallbackResult(result);
    case 'updateData':
      return formatWriteFallbackResult(result);
  }
}

export function isFoodWorkflowExecutionResult(
  value: GenericToolResult | FoodWorkflowExecutionResult,
): value is FoodWorkflowExecutionResult {
  return 'insertResult' in value;
}

export function executeAiToolRequest(
  request: AiToolRequest,
  timestamp: Date,
): GenericToolResult | FoodWorkflowExecutionResult {
  if (
    request.tool === 'insertFoodLog' ||
    (request.tool === 'insertData' && request.sheet === 'FOOD_LOG')
  ) {
    return executeFoodInsertWorkflow(request, timestamp);
  }

  return executeGenericToolRequest(request, timestamp);
}
