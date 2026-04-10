import { handleCommand } from '../commands';
import type { CommandHandlingResult } from '../types';
import { handleAiText } from './ai';
import { handleIncomingImage } from './image';

export function handleIncomingText(
  text: string,
  timestamp: Date,
  chatId: string,
): CommandHandlingResult {
  const trimmed = text.trim();

  if (!trimmed || text.trimStart().startsWith('/')) {
    return handleCommand(text, timestamp);
  }

  return handleAiText(text, timestamp, chatId);
}

export function handleIncomingImageMessage(
  fileId: string,
  caption: string,
  timestamp: Date,
  chatId: string,
): CommandHandlingResult {
  return handleIncomingImage(fileId, caption, timestamp, chatId);
}

export { handleAiText } from './ai';
