import { beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

const mocks = vi.hoisted(() => ({
  handleCommand: vi.fn(),
  handleAiText: vi.fn(),
  handleIncomingImage: vi.fn(),
}));

vi.mock('../commands', () => ({
  handleCommand: mocks.handleCommand,
}));

vi.mock('./ai', () => ({
  handleAiText: mocks.handleAiText,
}));

vi.mock('./image', () => ({
  handleIncomingImage: mocks.handleIncomingImage,
}));

import { handleIncomingImageMessage, handleIncomingText } from './index';

describe('handleIncomingText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleCommand.mockReturnValue({
      reply: 'command',
      handlingMode: 'command',
      status: 'success',
      note: '',
      traceId: '',
      intent: '',
      tool: '',
      confirmationState: 'none',
      resultCode: 'command',
    });
    mocks.handleAiText.mockReturnValue({
      reply: 'ai',
      handlingMode: 'ai',
      status: 'success',
      note: '',
      traceId: '',
      intent: '',
      tool: '',
      confirmationState: 'none',
      resultCode: 'ai',
    });
    mocks.handleIncomingImage.mockReturnValue({
      reply: 'image',
      handlingMode: 'ai',
      status: 'success',
      note: '',
      traceId: '',
      intent: 'image-ocr',
      tool: 'insertData',
      confirmationState: 'none',
      resultCode: 'image',
    });
  });

  it('routes slash commands to handleCommand', () => {
    const timestamp = new Date('2026-04-08T10:00:00Z');

    const result = handleIncomingText('/help', timestamp);

    expect(mocks.handleCommand).toHaveBeenCalledWith('/help', timestamp);
    expect(mocks.handleAiText).not.toHaveBeenCalled();
    expect(result.reply).toBe('command');
  });

  it('routes natural language text to handleAiText', () => {
    const timestamp = new Date('2026-04-08T10:00:00Z');

    const result = handleIncomingText('今天吃了酸奶', timestamp);

    expect(mocks.handleAiText).toHaveBeenCalledWith('今天吃了酸奶', timestamp);
    expect(mocks.handleCommand).not.toHaveBeenCalled();
    expect(result.reply).toBe('ai');
  });

  it('keeps empty text on the command path', () => {
    const timestamp = new Date('2026-04-08T10:00:00Z');

    handleIncomingText('   ', timestamp);

    expect(mocks.handleCommand).toHaveBeenCalledWith('   ', timestamp);
    expect(mocks.handleAiText).not.toHaveBeenCalled();
  });

  it('routes image messages to handleIncomingImage', () => {
    const timestamp = new Date('2026-04-08T10:00:00Z');

    const result = handleIncomingImageMessage(
      'file_123',
      '营养标签',
      timestamp,
    );

    expect(mocks.handleIncomingImage).toHaveBeenCalledWith(
      'file_123',
      '营养标签',
      timestamp,
    );
    expect(result.reply).toBe('image');
  });
});
