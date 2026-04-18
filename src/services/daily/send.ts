import { MY_CHAT_ID } from '../../app-config';
import { botLogTable } from '../../tables';
import type { CommandHandlingResult, DailyDigestOptions } from '../../types';
import { sendText } from '../telegram';
import { buildDailySummaryHtmlMessage } from './summary';

function buildDailyDigestLogResult(
  status: 'success' | 'failed',
  note: string,
): CommandHandlingResult {
  return {
    reply: status === 'success' ? '日报已发送。' : '日报发送失败。',
    handlingMode: 'rule',
    status,
    note,
    traceId: '',
    intent: 'daily-digest',
    tool: 'sendDailyDigest',
    confirmationState: status === 'success' ? 'none' : 'failed',
    resultCode:
      status === 'success' ? 'daily-digest-sent' : 'daily-digest-failed',
  };
}

export function sendDailyDigestMessage(
  timestamp: Date = new Date(),
  options: DailyDigestOptions = {},
): void {
  const rawLogText = '[daily_digest_trigger]';
  const startedAt = Date.now();
  const { includeAiInsight = true } = options;

  try {
    const messageText = buildDailySummaryHtmlMessage(timestamp, {
      includeAiInsight,
    });
    const summaryBuiltAt = Date.now();
    const messageId = sendText(MY_CHAT_ID, messageText);
    const sentAt = Date.now();

    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info(
        '[haijisan daily-digest] sent',
        JSON.stringify({
          includeAiInsight,
          summaryBuildMs: summaryBuiltAt - startedAt,
          sendMs: sentAt - summaryBuiltAt,
          totalMs: sentAt - startedAt,
          messageLength: messageText.length,
        }),
      );
    }

    botLogTable.appendMessageLog(
      timestamp,
      rawLogText,
      buildDailyDigestLogResult(
        'success',
        `chat_id=${MY_CHAT_ID}; message_id=${messageId ?? 'unknown'}; total_ms=${sentAt - startedAt}`,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = Date.now();

    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info(
        '[haijisan daily-digest] failed',
        JSON.stringify({
          includeAiInsight,
          totalMs: failedAt - startedAt,
          message,
        }),
      );
    }

    try {
      botLogTable.appendMessageLog(
        timestamp,
        rawLogText,
        buildDailyDigestLogResult(
          'failed',
          `chat_id=${MY_CHAT_ID}; total_ms=${failedAt - startedAt}; ${message}`,
        ),
      );
    } catch {
      // Ignore secondary logging failures so the execution error stays intact.
    }

    try {
      sendText(MY_CHAT_ID, `🚨 日报发送失败：\n${message}`);
    } catch {
      // Ignore secondary alert failures after preserving the failure in BOT_LOG.
    }

    throw error instanceof Error ? error : new Error(message);
  }
}
