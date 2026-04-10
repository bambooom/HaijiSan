import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleIncomingImageMessage: vi.fn(),
  attachConfirmationPreviewMessage: vi.fn(),
  editText: vi.fn(),
  appendMessageLog: vi.fn(),
  getProperties: vi.fn(),
  setProperty: vi.fn(),
  deleteProperty: vi.fn(),
  getProjectTriggers: vi.fn(),
  deleteTrigger: vi.fn(),
  createTrigger: vi.fn(),
  getUuid: vi.fn(() => 'imagejob123456'),
}));

vi.mock('../handlers', () => ({
  handleIncomingImageMessage: mocks.handleIncomingImageMessage,
}));

vi.mock('./confirmation', () => ({
  attachConfirmationPreviewMessage: mocks.attachConfirmationPreviewMessage,
}));

vi.mock('./telegram', () => ({
  editText: mocks.editText,
}));

vi.mock('../tables', () => ({
  botLogTable: {
    appendMessageLog: mocks.appendMessageLog,
  },
}));

Object.assign(globalThis, {
  PropertiesService: {
    getScriptProperties: () => ({
      getProperties: mocks.getProperties,
      setProperty: mocks.setProperty,
      deleteProperty: mocks.deleteProperty,
    }),
  },
  ScriptApp: {
    getProjectTriggers: mocks.getProjectTriggers,
    deleteTrigger: mocks.deleteTrigger,
    newTrigger: mocks.createTrigger,
  },
  Utilities: {
    getUuid: mocks.getUuid,
  },
});

import {
  enqueueImageOcrJob,
  processPendingImageOcrJobs,
} from './image-ocr-queue';

describe('image-ocr-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProperties.mockReturnValue({});
    mocks.getProjectTriggers.mockReturnValue([]);
    mocks.createTrigger.mockReturnValue({
      timeBased: () => ({
        after: () => ({
          create: () => undefined,
        }),
      }),
    });
  });

  it('queues an image OCR job and creates a worker trigger', () => {
    const result = enqueueImageOcrJob(
      'test-chat-id',
      'file_123',
      '早餐营养标签',
      '[image] 早餐营养标签',
      321,
      new Date('2026-04-08T10:00:00Z'),
    );

    expect(mocks.setProperty).toHaveBeenCalledWith(
      'image_ocr_job:imagejob1234',
      expect.stringContaining('早餐营养标签'),
    );
    expect(mocks.createTrigger).toHaveBeenCalledWith(
      'processPendingImageOcrJobs',
    );
    expect(result).toMatchObject({
      reply: '正在识别，请稍后。',
      resultCode: 'image-ocr-queued',
    });
  });

  it('processes queued jobs and edits the placeholder with the OCR result', () => {
    const trigger = { getHandlerFunction: () => 'processPendingImageOcrJobs' };
    mocks.getProperties.mockReturnValue({
      'image_ocr_job:imagejob123456': JSON.stringify({
        id: 'imagejob123456',
        chatId: 'test-chat-id',
        fileId: 'file_123',
        caption: '早餐营养标签',
        rawLogText: '[image] 早餐营养标签',
        placeholderMessageId: 321,
        queuedAtIso: '2026-04-08T10:00:00.000Z',
      }),
    });
    mocks.getProjectTriggers.mockReturnValue([trigger]);
    mocks.handleIncomingImageMessage.mockReturnValue({
      reply: '请确认这条营养参考：',
      handlingMode: 'ai',
      status: 'success',
      note: 'REF_CALORIES; awaiting confirmation',
      traceId: 'image_1',
      intent: 'image-ocr',
      tool: 'insertData',
      confirmationState: 'pending',
      resultCode: 'image-ocr-pending',
      telegramResponse: {
        pendingConfirmationId: 'pending_1',
        replyMarkup: {
          inlineKeyboard: [
            [{ text: '确认', callbackData: 'ocr:confirm:pending_1' }],
          ],
        },
      },
    });

    processPendingImageOcrJobs();

    expect(mocks.handleIncomingImageMessage).toHaveBeenCalledWith(
      'file_123',
      '早餐营养标签',
      new Date('2026-04-08T10:00:00.000Z'),
      'test-chat-id',
    );
    expect(mocks.editText).toHaveBeenCalledWith(
      'test-chat-id',
      321,
      '请确认这条营养参考：',
      expect.any(Object),
    );
    const editCall = mocks.editText.mock.calls[0];
    const editOptions = editCall?.[3] as {
      replyMarkup?: {
        inlineKeyboard?: unknown[][];
      };
    };

    expect(Array.isArray(editOptions.replyMarkup?.inlineKeyboard)).toBe(true);
    expect(mocks.attachConfirmationPreviewMessage).toHaveBeenCalledWith(
      'pending_1',
      321,
    );
    expect(mocks.appendMessageLog).toHaveBeenCalledWith(
      new Date('2026-04-08T10:00:00.000Z'),
      '[image] 早餐营养标签',
      expect.objectContaining({ resultCode: 'image-ocr-pending' }),
    );
    expect(mocks.deleteProperty).toHaveBeenCalledWith(
      'image_ocr_job:imagejob123456',
    );
    expect(mocks.deleteTrigger).toHaveBeenCalledWith(trigger);
  });
});
