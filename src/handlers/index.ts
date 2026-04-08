import { handleCommand } from '../commands';
import type { CommandHandlingResult } from '../types';
import { handleAiText } from './ai';

export function handleIncomingText(
  text: string,
  timestamp: Date,
): CommandHandlingResult {
  const trimmed = text.trim();

  if (!trimmed || text.trimStart().startsWith('/')) {
    return handleCommand(text, timestamp);
  }

  return handleAiText(text, timestamp);
}

export { handleAiText } from './ai';
