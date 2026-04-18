import { MY_CHAT_ID } from '../../app-config';
import { botLogTable } from '../../tables';
import type { CommandHandlingResult } from '../../types';
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

export function sendDailyDigestMessage(timestamp: Date = new Date()): void {
  const rawLogText = '[daily_digest_trigger]';

  try {
    const messageId = sendText(
      MY_CHAT_ID,
      buildDailySummaryHtmlMessage(timestamp),
    );

    botLogTable.appendMessageLog(
      timestamp,
      rawLogText,
      buildDailyDigestLogResult(
        'success',
        `chat_id=${MY_CHAT_ID}; message_id=${messageId ?? 'unknown'}`,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      botLogTable.appendMessageLog(
        timestamp,
        rawLogText,
        buildDailyDigestLogResult(
          'failed',
          `chat_id=${MY_CHAT_ID}; ${message}`,
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
