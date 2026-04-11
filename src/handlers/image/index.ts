import type { CommandHandlingResult } from '../../types';
import {
  createNutritionLabelConfirmation,
  createStockDeductionConfirmation,
} from '../../services/confirmation';
import { executeFoodInsertWorkflow } from '../../services/food-workflow';
import { extractHealthDataFromImage } from '../../services/ocr';
import { downloadTelegramFile } from '../../services/telegram';
import { executeInsertData, executeUpdateData } from '../../tools';
import {
  buildImageWriteRequest,
  buildOcrNote,
  formatImageWriteReply,
} from './write';
import {
  buildImageResult,
  createImageAudit,
  createImageTraceId,
  isFoodWorkflowExecutionResult,
} from './result';

export function handleIncomingImage(
  fileId: string,
  caption: string,
  timestamp: Date,
  chatId: string,
): CommandHandlingResult {
  try {
    // Main image flow: OCR extract, map to one write request, then either
    // create a confirmation step or execute the write directly.
    const downloaded = downloadTelegramFile(fileId);
    const extraction = extractHealthDataFromImage({
      base64Data: downloaded.base64Data,
      mimeType: downloaded.mimeType,
      referenceTimestamp: timestamp,
      userPrompt: caption,
    });
    const request = buildImageWriteRequest(extraction, caption, timestamp);

    if (!request) {
      return buildImageResult(
        extraction.kind === 'sleep_summary'
          ? '这张睡眠截图缺少足够的开始或结束时间，暂时还不能直接入库。'
          : '这张图片我暂时还不能稳定解析成可写入的数据。',
        timestamp,
        {
          note: buildOcrNote(extraction, caption),
          resultCode: 'image-ocr-no-write',
          audit: createImageAudit(),
        },
      );
    }

    if (request.sheet === 'REF_CALORIES') {
      return createNutritionLabelConfirmation(
        chatId,
        createImageTraceId(timestamp),
        request,
        timestamp,
      );
    }

    if (request.tool === 'updateData') {
      const result = executeUpdateData(request, timestamp);

      return buildImageResult(
        formatImageWriteReply(extraction, request),
        timestamp,
        {
          tool: request.tool,
          note: `${request.sheet}; ${buildOcrNote(extraction, caption)}`,
          resultCode: 'image-ocr-updated',
          audit: createImageAudit(
            request.tool,
            request.sheet,
            Object.keys(result.updates).sort(),
          ),
        },
      );
    }

    const result =
      request.sheet === 'FOOD_LOG'
        ? executeFoodInsertWorkflow(request, timestamp)
        : executeInsertData(request, timestamp);

    if (
      request.sheet === 'FOOD_LOG' &&
      isFoodWorkflowExecutionResult(result) &&
      result.pendingStockDeduction
    ) {
      const confirmation = createStockDeductionConfirmation(
        chatId,
        createImageTraceId(timestamp),
        result.pendingStockDeduction,
        timestamp,
      );

      return buildImageResult(confirmation.reply, timestamp, {
        tool: request.tool,
        note: `${request.sheet}; ${buildOcrNote(extraction, caption)}; stock deduction awaiting confirmation`,
        resultCode: 'food-stock-pending',
        confirmationState: 'pending',
        audit: createImageAudit(
          request.tool,
          request.sheet,
          Object.keys(result.insertResult.record).sort(),
        ),
        telegramResponse: confirmation.telegramResponse,
      });
    }

    const insertResult = isFoodWorkflowExecutionResult(result)
      ? result.insertResult
      : result;

    return buildImageResult(
      formatImageWriteReply(extraction, request),
      timestamp,
      {
        tool: request.tool,
        note: `${request.sheet}; ${buildOcrNote(extraction, caption)}`,
        resultCode: 'image-ocr-inserted',
        audit: createImageAudit(
          request.tool,
          request.sheet,
          Object.keys(insertResult.record).sort(),
        ),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return buildImageResult('图片处理失败，请稍后再试。', timestamp, {
      status: 'failed',
      note: message,
      resultCode: 'image-ocr-error',
      audit: createImageAudit(),
    });
  }
}
