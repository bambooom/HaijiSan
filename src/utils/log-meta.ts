import type {
  BotLogConfirmationState,
  CommandHandlingResult,
  CommandLogFields,
} from '../types';

const DEFAULT_COMMAND_LOG_FIELDS: CommandLogFields = {
  traceId: '',
  intent: '',
  tool: '',
  confirmationState: 'none',
  resultCode: '',
};

export function buildCommandLogFields(
  base?: Partial<CommandLogFields>,
  overrides?: Partial<CommandLogFields>,
): CommandLogFields {
  return {
    traceId:
      overrides?.traceId ?? base?.traceId ?? DEFAULT_COMMAND_LOG_FIELDS.traceId,
    intent:
      overrides?.intent ?? base?.intent ?? DEFAULT_COMMAND_LOG_FIELDS.intent,
    tool: overrides?.tool ?? base?.tool ?? DEFAULT_COMMAND_LOG_FIELDS.tool,
    confirmationState:
      overrides?.confirmationState ??
      base?.confirmationState ??
      DEFAULT_COMMAND_LOG_FIELDS.confirmationState,
    resultCode:
      overrides?.resultCode ??
      base?.resultCode ??
      DEFAULT_COMMAND_LOG_FIELDS.resultCode,
  };
}

export function deriveCommandLogMeta(
  result: CommandHandlingResult,
): CommandLogFields {
  return buildCommandLogFields(result);
}
