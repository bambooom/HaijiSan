import type { CommandAuditFields, CommandHandlingResult } from '../../types';
import { buildCommandLogFields } from '../../utils/log-meta';

type ResultBuilderConfig = {
  tracePrefix: string;
  defaultIntent: string;
  defaultHandlingMode?: CommandHandlingResult['handlingMode'];
};

type CommandAuditConfig = Partial<CommandAuditFields> & {
  primaryAction?: string;
  primaryTargetSheet?: string;
  primarySelectorType?: string;
  primarySelectorValue?: string;
  changedFields?: string[];
  readSheetNames?: string[];
  writeSheetNames?: string[];
};

export function createTraceId(prefix: string, timestamp: Date): string {
  return `${prefix}_${timestamp.getTime()}`;
}

export function buildHandlerResult(
  config: ResultBuilderConfig,
  reply: string,
  timestamp: Date,
  overrides?: Partial<CommandHandlingResult>,
): CommandHandlingResult {
  const logFields = buildCommandLogFields(undefined, {
    traceId: createTraceId(config.tracePrefix, timestamp),
    intent: overrides?.intent ?? config.defaultIntent,
    tool: overrides?.tool ?? '',
    confirmationState: overrides?.confirmationState ?? 'none',
    resultCode: overrides?.resultCode ?? '',
  });

  return {
    reply,
    handlingMode: overrides?.handlingMode ?? config.defaultHandlingMode ?? 'ai',
    status: overrides?.status ?? 'success',
    note: overrides?.note ?? '',
    audit: overrides?.audit,
    telegramResponse: overrides?.telegramResponse,
    ...logFields,
  };
}

export function buildCommandAudit(
  config?: CommandAuditConfig,
): CommandAuditFields {
  return {
    toolCallCount:
      config?.toolCallCount ??
      (config?.readCount ?? 0) +
        (config?.insertCount ?? 0) +
        (config?.updateCount ?? 0),
    readCount: config?.readCount ?? 0,
    insertCount: config?.insertCount ?? 0,
    updateCount: config?.updateCount ?? 0,
    readSheetNames: config?.readSheetNames ?? [],
    writeSheetNames: config?.writeSheetNames ?? [],
    primaryAction: config?.primaryAction ?? '',
    primaryTargetSheet: config?.primaryTargetSheet ?? '',
    primarySelectorType: config?.primarySelectorType ?? '',
    primarySelectorValue: config?.primarySelectorValue ?? '',
    changedFields: config?.changedFields ?? [],
  };
}
