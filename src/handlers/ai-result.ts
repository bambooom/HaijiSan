import type { CommandHandlingResult } from '../types';

export function buildAiResult(
  reply: string,
  status: CommandHandlingResult['status'] = 'success',
  note = '',
): CommandHandlingResult {
  return {
    reply,
    handlingMode: 'ai',
    status,
    note,
  };
}
