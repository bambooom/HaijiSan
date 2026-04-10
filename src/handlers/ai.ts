import {
  CONTEXT_EXPANSION_KEYWORDS,
  DEFAULT_CONVERSATION_CONTEXT_TURNS,
  EXPANDED_CONVERSATION_CONTEXT_TURNS,
} from '../constants/ai';
import { executeFoodInsertWorkflow } from '../services/food-workflow';
import { createStockDeductionConfirmation } from '../services/confirmation';
import { generateFinalAiReply, startAiResponse } from '../services/gemini';
import { botLogTable } from '../tables/bot-log-table';
import { executeGenericToolRequest } from '../tools';
import type {
  GenericToolRequest,
  GenericToolResult,
  ToolSelector,
} from '../tools/types';
import { validateAiToolRequest } from '../tools/validation';
import type {
  CommandAuditFields,
  CommandHandlingResult,
  ConversationTurn,
  FoodLogInsertRequest,
  FoodWorkflowExecutionResult,
} from '../types';
import { buildCommandLogFields } from '../utils/log-meta';

type AiToolRequest = GenericToolRequest | FoodLogInsertRequest;

function createTraceId(timestamp: Date): string {
  return `ai_${timestamp.getTime()}`;
}

function buildAiResult(
  reply: string,
  timestamp: Date,
  overrides?: Partial<CommandHandlingResult>,
): CommandHandlingResult {
  const logFields = buildCommandLogFields(undefined, {
    traceId: createTraceId(timestamp),
    intent: overrides?.intent ?? '',
    tool: overrides?.tool ?? '',
    confirmationState: overrides?.confirmationState ?? 'none',
    resultCode: overrides?.resultCode ?? '',
  });

  return {
    reply,
    handlingMode: 'ai',
    status: overrides?.status ?? 'success',
    note: overrides?.note ?? '',
    audit: overrides?.audit,
    telegramResponse: overrides?.telegramResponse,
    ...logFields,
  };
}

function createEmptyAudit(primaryAction = ''): CommandAuditFields {
  return {
    toolCallCount: 0,
    readCount: 0,
    insertCount: 0,
    updateCount: 0,
    readSheetNames: [],
    writeSheetNames: [],
    primaryAction,
    primaryTargetSheet: '',
    primarySelectorType: '',
    primarySelectorValue: '',
    changedFields: [],
  };
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

function buildAuditFromRequest(request: AiToolRequest): CommandAuditFields {
  switch (request.tool) {
    case 'readData':
      return {
        toolCallCount: 1,
        readCount: 1,
        insertCount: 0,
        updateCount: 0,
        readSheetNames: [request.sheet],
        writeSheetNames: [],
        primaryAction: request.tool,
        primaryTargetSheet: request.sheet,
        primarySelectorType: request.selector.type,
        primarySelectorValue: formatSelectorValue(request.selector),
        changedFields: [],
      };
    case 'insertData':
    case 'insertFoodLog':
      return {
        toolCallCount: 1,
        readCount: 0,
        insertCount: 1,
        updateCount: 0,
        readSheetNames: [],
        writeSheetNames: [request.sheet],
        primaryAction: request.tool,
        primaryTargetSheet: request.sheet,
        primarySelectorType: '',
        primarySelectorValue: '',
        changedFields: Object.keys(request.record).sort(),
      };
    case 'updateData':
      return {
        toolCallCount: 1,
        readCount: 0,
        insertCount: 0,
        updateCount: 1,
        readSheetNames: [],
        writeSheetNames: [request.sheet],
        primaryAction: request.tool,
        primaryTargetSheet: request.sheet,
        primarySelectorType: request.selector.type,
        primarySelectorValue: formatSelectorValue(request.selector),
        changedFields: Object.keys(request.updates).sort(),
      };
  }
}

function shouldExpandConversationContext(text: string): boolean {
  return CONTEXT_EXPANSION_KEYWORDS.some((keyword) => text.includes(keyword));
}

function getConversationHistory(text: string): ConversationTurn[] {
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

function formatToolResult(result: GenericToolResult): string {
  switch (result.tool) {
    case 'readData':
      return formatReadResult(result);
    case 'insertData':
      return formatWriteFallbackResult(result);
    case 'updateData':
      return formatWriteFallbackResult(result);
  }
}

function isFoodWorkflowExecutionResult(
  value: GenericToolResult | FoodWorkflowExecutionResult,
): value is FoodWorkflowExecutionResult {
  return 'insertResult' in value;
}

function executeAiToolRequest(
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

export function handleAiText(
  text: string,
  timestamp: Date,
  chatId = '',
): CommandHandlingResult {
  try {
    const conversationHistory = getConversationHistory(text);
    const response = startAiResponse(text, conversationHistory, timestamp);

    if (response.mode === 'reply') {
      return buildAiResult(response.reply, timestamp, {
        intent: 'ai-reply',
        note: '',
        audit: createEmptyAudit(),
        resultCode: 'ai-direct-reply',
      });
    }

    const audit = buildAuditFromRequest(response.request);

    const errors = validateAiToolRequest(response.request);

    if (errors.length > 0) {
      return buildAiResult(
        `AI 提供的工具请求无效：${errors.join(' ')}`,
        timestamp,
        {
          intent: 'ai-tool',
          tool: response.request.tool,
          note: errors.join(' '),
          audit,
          resultCode: 'ai-invalid-tool-request',
          status: 'failed',
        },
      );
    }

    const executionResult = executeAiToolRequest(response.request, timestamp);
    const toolResult = isFoodWorkflowExecutionResult(executionResult)
      ? executionResult.insertResult
      : executionResult;

    if (
      isFoodWorkflowExecutionResult(executionResult) &&
      executionResult.pendingStockDeduction
    ) {
      const confirmation = createStockDeductionConfirmation(
        chatId,
        createTraceId(timestamp),
        executionResult.pendingStockDeduction,
        timestamp,
      );

      return buildAiResult(confirmation.reply, timestamp, {
        intent: 'ai-tool',
        tool: response.request.tool,
        note: `${response.request.tool} ${response.request.sheet}; stock deduction awaiting confirmation`,
        audit,
        resultCode: 'food-stock-pending',
        confirmationState: 'pending',
        telegramResponse: confirmation.telegramResponse,
      });
    }

    try {
      const reply = generateFinalAiReply({
        userText: text,
        conversationHistory,
        referenceTimestamp: timestamp,
        firstTurn: response,
        toolResult,
      });

      return buildAiResult(reply, timestamp, {
        intent: 'ai-tool',
        tool: response.request.tool,
        note: `${response.request.tool} ${response.request.sheet}`,
        audit,
        resultCode: 'ai-tool-executed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return buildAiResult(formatToolResult(toolResult), timestamp, {
        intent: 'ai-tool',
        tool: response.request.tool,
        note: `${response.request.tool} ${response.request.sheet}; final reply failed: ${message}`,
        audit,
        resultCode: 'ai-tool-executed-final-reply-failed',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return buildAiResult('AI 处理失败，请稍后再试。', timestamp, {
      note: message,
      audit: createEmptyAudit(),
      resultCode: 'ai-error',
      status: 'failed',
    });
  }
}
