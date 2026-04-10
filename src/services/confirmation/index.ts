import type { CommandHandlingResult } from '../../types';
import { attachConfirmationPreviewMessage } from './core';
import {
  createNutritionLabelConfirmation,
  handleOcrConfirmationCallback,
  handleOcrConfirmationReply,
} from './ocr';
import {
  createStockDeductionConfirmation,
  handleStockDeductionConfirmationCallback,
  handleStockDeductionConfirmationReply,
} from './stock';

// Keep the top-level confirmation entry small: it only routes to the
// concrete confirmation flows and re-exports the shared entry points.
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
  return (
    handleOcrConfirmationReply(chatId, replyToMessageId, text, timestamp) ??
    handleStockDeductionConfirmationReply(
      chatId,
      replyToMessageId,
      text,
      timestamp,
    )
  );
}

export {
  attachConfirmationPreviewMessage,
  createNutritionLabelConfirmation,
  createStockDeductionConfirmation,
};
