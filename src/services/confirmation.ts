export { attachConfirmationPreviewMessage } from './confirmation-framework';
export { createNutritionLabelConfirmation } from './ocr-confirmation';
import { handleOcrConfirmationCallback } from './ocr-confirmation';
import { handleOcrConfirmationReply } from './ocr-confirmation';
import { handleStockDeductionConfirmationCallback } from './stock-deduction-confirmation';
import type { CommandHandlingResult } from '../types';

export function handleConfirmationCallback(
  chatId: string,
  callbackQueryId: string,
  data: string,
  messageId: number,
  timestamp: Date,
): CommandHandlingResult | null {
  return (
    handleOcrConfirmationCallback(
      chatId,
      callbackQueryId,
      data,
      messageId,
      timestamp,
    ) ??
    handleStockDeductionConfirmationCallback(
      chatId,
      callbackQueryId,
      data,
      messageId,
      timestamp,
    )
  );
}

export function handleConfirmationReply(
  chatId: string,
  replyToMessageId: number,
  text: string,
  timestamp: Date,
): CommandHandlingResult | null {
  return handleOcrConfirmationReply(chatId, replyToMessageId, text, timestamp);
}

export { createStockDeductionConfirmation } from './stock-deduction-confirmation';
