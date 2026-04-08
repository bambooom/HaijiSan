import { generateFinalAiReply, startAiResponse } from '../services/gemini';
import { executeGenericToolRequest } from '../tools';
import type {
  GenericToolRequest,
  GenericToolResult,
  ToolSelector,
} from '../tools/types';
import { validateGenericToolRequest } from '../tools/validation';
import type { CommandAuditFields, CommandHandlingResult } from '../types';
import { buildCommandLogFields } from '../utils/log-meta';

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

function buildAuditFromRequest(
  request: GenericToolRequest,
): CommandAuditFields {
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

function stringifyRecord(record: Record<string, unknown>): string {
  return JSON.stringify(record, null, 2);
}

function formatReadResult(
  result: Extract<GenericToolResult, { tool: 'readData' }>,
): string {
  if (result.rows.length === 0) {
    return `我没有查到 ${result.sheet} 的记录。`;
  }

  const preview = result.rows
    .slice(0, 5)
    .map((row) => `第 ${row.rowNumber} 行\n${stringifyRecord(row.record)}`)
    .join('\n\n');
  const suffix = result.rows.length > 5 ? '\n\n其余结果已省略。' : '';

  return `我查到 ${result.rows.length} 条 ${result.sheet} 记录。\n\n${preview}${suffix}`;
}

function formatToolResult(result: GenericToolResult): string {
  switch (result.tool) {
    case 'readData':
      return formatReadResult(result);
    case 'insertData':
      return `已写入 ${result.sheet}：\n${stringifyRecord(result.record)}`;
    case 'updateData':
      return `已更新 ${result.sheet} 第 ${result.selector.rowNumber} 行：\n${stringifyRecord(result.updates)}`;
  }
}

export function handleAiText(
  text: string,
  timestamp: Date,
): CommandHandlingResult {
  try {
    const response = startAiResponse(text);

    if (response.mode === 'reply') {
      return buildAiResult(response.reply, timestamp, {
        intent: 'ai-reply',
        note: '',
        audit: createEmptyAudit(),
        resultCode: 'ai-direct-reply',
      });
    }

    const audit = buildAuditFromRequest(response.request);

    const errors = validateGenericToolRequest(response.request);

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

    const toolResult = executeGenericToolRequest(response.request, timestamp);

    try {
      const reply = generateFinalAiReply({
        userText: text,
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
