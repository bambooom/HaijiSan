import { createStockDeductionConfirmation } from '../../services/confirmation';
import { generateFinalAiReply, startAiResponse } from '../../services/gemini';
import { validateAiToolRequest } from '../../tools/validation';
import type { CommandHandlingResult } from '../../types';
import { normalizeTelegramHtmlReply } from '../../utils/value';
import {
  buildAiResult,
  buildAuditFromRequest,
  createAiTraceId,
  createEmptyAudit,
  executeAiToolRequest,
  formatToolResult,
  getConversationHistory,
  isFoodWorkflowExecutionResult,
} from './helper';

export function handleAiText(
  text: string,
  timestamp: Date,
  chatId = '',
): CommandHandlingResult {
  try {
    // Main AI flow: collect context, validate the model tool call, execute it,
    // then either return a confirmation step or synthesize the final reply.
    const conversationHistory = getConversationHistory(text);
    const response = startAiResponse(text, conversationHistory, timestamp);

    if (response.mode === 'reply') {
      return buildAiResult(
        normalizeTelegramHtmlReply(response.reply),
        timestamp,
        {
          intent: 'ai-reply',
          note: '',
          audit: createEmptyAudit(),
          resultCode: 'ai-direct-reply',
        },
      );
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
        createAiTraceId(timestamp),
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

      return buildAiResult(normalizeTelegramHtmlReply(reply), timestamp, {
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
