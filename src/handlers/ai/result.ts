import type { CommandHandlingResult, CommandLogFields } from '../../types';
import { buildCommandLogFields } from '../../utils/log-meta';

export function buildAiResult(
  reply: string,
  status: CommandHandlingResult['status'] = 'success',
  note = '',
  logFields?: Partial<CommandLogFields>,
): CommandHandlingResult {
  return {
    reply,
    handlingMode: 'ai',
    status,
    note,
    ...buildCommandLogFields(undefined, {
      confirmationState: 'none',
      resultCode: status,
      ...logFields,
    }),
  };
}
