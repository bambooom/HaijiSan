import type { CommandHandlingResult } from '../../types';
import { handleIncomingImageMessage } from '../../handlers';
import { botLogTable } from '../../tables';
import { attachConfirmationPreviewMessage } from '../confirmation';
import { editText } from '../telegram';

const IMAGE_OCR_JOB_PREFIX = 'image_ocr_job:';
const IMAGE_OCR_TRIGGER_HANDLER = 'processPendingImageOcrJobs';

type PendingImageOcrJob = {
  id: string;
  chatId: string;
  fileId: string;
  caption: string;
  rawLogText: string;
  placeholderMessageId: number;
  queuedAtIso: string;
};

function getScriptProperties(): GoogleAppsScript.Properties.Properties | null {
  if (
    typeof PropertiesService === 'undefined' ||
    typeof PropertiesService.getScriptProperties !== 'function'
  ) {
    return null;
  }

  return PropertiesService.getScriptProperties();
}

function createJobId(timestamp: Date): string {
  if (
    typeof Utilities !== 'undefined' &&
    typeof Utilities.getUuid === 'function'
  ) {
    return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  }

  return `${timestamp.getTime().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getJobKey(id: string): string {
  return `${IMAGE_OCR_JOB_PREFIX}${id}`;
}

function listQueueTriggers(): GoogleAppsScript.Script.Trigger[] {
  if (
    typeof ScriptApp === 'undefined' ||
    typeof ScriptApp.getProjectTriggers !== 'function'
  ) {
    return [];
  }

  return ScriptApp.getProjectTriggers().filter(
    (trigger) => trigger.getHandlerFunction() === IMAGE_OCR_TRIGGER_HANDLER,
  );
}

function ensureQueueTrigger(): void {
  if (
    typeof ScriptApp === 'undefined' ||
    typeof ScriptApp.newTrigger !== 'function'
  ) {
    return;
  }

  if (listQueueTriggers().length > 0) {
    return;
  }

  ScriptApp.newTrigger(IMAGE_OCR_TRIGGER_HANDLER)
    .timeBased()
    .after(1_000)
    .create();
}

function clearQueueTriggers(): void {
  if (typeof ScriptApp === 'undefined') {
    return;
  }

  listQueueTriggers().forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

function saveJob(job: PendingImageOcrJob): void {
  getScriptProperties()?.setProperty(getJobKey(job.id), JSON.stringify(job));
}

function deleteJob(id: string): void {
  getScriptProperties()?.deleteProperty(getJobKey(id));
}

function listJobs(): PendingImageOcrJob[] {
  const properties = getScriptProperties()?.getProperties() ?? {};

  return Object.entries(properties)
    .filter(([key]) => key.startsWith(IMAGE_OCR_JOB_PREFIX))
    .map(([, value]) => JSON.parse(value) as PendingImageOcrJob)
    .sort((left, right) => left.queuedAtIso.localeCompare(right.queuedAtIso));
}

function buildQueuedResult(
  jobId: string,
  placeholderMessageId: number,
): CommandHandlingResult {
  return {
    reply: '正在识别，请稍后。',
    handlingMode: 'rule',
    status: 'success',
    note: `image OCR queued; placeholder_message_id=${placeholderMessageId}`,
    traceId: `image_queue_${jobId}`,
    intent: 'image-ocr-queued',
    tool: '',
    confirmationState: 'none',
    resultCode: 'image-ocr-queued',
  };
}

function buildQueueFailureResult(message: string): CommandHandlingResult {
  return {
    reply: '图片处理失败，请稍后再试。',
    handlingMode: 'ai',
    status: 'failed',
    note: message,
    traceId: '',
    intent: 'image-ocr',
    tool: '',
    confirmationState: 'failed',
    resultCode: 'image-ocr-error',
  };
}

export function enqueueImageOcrJob(
  chatId: string,
  fileId: string,
  caption: string,
  rawLogText: string,
  placeholderMessageId: number,
  timestamp: Date,
): CommandHandlingResult {
  const jobId = createJobId(timestamp);

  saveJob({
    id: jobId,
    chatId,
    fileId,
    caption,
    rawLogText,
    placeholderMessageId,
    queuedAtIso: timestamp.toISOString(),
  });
  ensureQueueTrigger();

  return buildQueuedResult(jobId, placeholderMessageId);
}

export function processPendingImageOcrJobs(): void {
  const jobs = listJobs();

  jobs.forEach((job) => {
    try {
      const result = handleIncomingImageMessage(
        job.fileId,
        job.caption,
        new Date(job.queuedAtIso),
        job.chatId,
      );

      editText(job.chatId, job.placeholderMessageId, result.reply, {
        replyMarkup: result.telegramResponse?.replyMarkup,
      });

      if (typeof result.telegramResponse?.pendingConfirmationId === 'string') {
        attachConfirmationPreviewMessage(
          result.telegramResponse.pendingConfirmationId,
          job.placeholderMessageId,
        );
      }

      botLogTable.appendMessageLog(
        new Date(job.queuedAtIso),
        job.rawLogText,
        result,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = buildQueueFailureResult(message);

      try {
        editText(job.chatId, job.placeholderMessageId, result.reply);
      } catch {
        // Ignore secondary edit failures and preserve the OCR failure log below.
      }

      botLogTable.appendMessageLog(
        new Date(job.queuedAtIso),
        job.rawLogText,
        result,
      );
    } finally {
      deleteJob(job.id);
    }
  });

  clearQueueTriggers();

  if (listJobs().length > 0) {
    ensureQueueTrigger();
  }
}
