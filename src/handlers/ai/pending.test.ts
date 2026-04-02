import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearPendingAiAction: vi.fn(),
  consumePendingAiActionForConfirmation: vi.fn(),
  getPendingAiAction: vi.fn(),
  getRecentPendingConfirmationReceipt: vi.fn(),
  savePendingConfirmationReceipt: vi.fn(),
  executeCommandRoute: vi.fn(),
}));

vi.mock('../../services/pending-action', () => ({
  clearPendingAiAction: mocks.clearPendingAiAction,
  consumePendingAiActionForConfirmation:
    mocks.consumePendingAiActionForConfirmation,
  getPendingAiAction: mocks.getPendingAiAction,
  getRecentPendingConfirmationReceipt:
    mocks.getRecentPendingConfirmationReceipt,
  savePendingConfirmationReceipt: mocks.savePendingConfirmationReceipt,
}));

vi.mock('../command-router', () => ({
  executeCommandRoute: mocks.executeCommandRoute,
}));

vi.mock('../../services/gemini', () => ({
  geminiService: {
    planClarificationFollowup: vi.fn(),
  },
}));

vi.mock('../../services/meal-action', () => ({
  confirmPendingMealRecordAction: vi.fn(),
}));

import { handlePendingAiAction } from './pending';

describe('handlePendingAiAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms a batch stock update and returns a concise success receipt', () => {
    const pendingAction = {
      kind: 'stock-batch',
      createdAt: '2026-04-01T10:00:00.000Z',
      sourceText:
        '更新一下库存，麻烦把这些东西添加到库存记录里：茼蒿 250g，鸡蛋15个，小番茄100g，欧包57g，牛奶2.8L',
      previewText: 'preview',
      operation: 'adjust',
      items: [
        { name: '茼蒿', quantity: 250, unit: 'g' },
        { name: '鸡蛋', quantity: 15, unit: '个' },
        { name: '牛奶', quantity: 2.8, unit: 'L' },
      ],
      note: 'mode=command; intent=stock_adjust; stock-items=3',
    };

    mocks.getPendingAiAction.mockReturnValue(pendingAction);
    mocks.consumePendingAiActionForConfirmation.mockReturnValue(pendingAction);

    mocks.executeCommandRoute
      .mockReturnValueOnce({ reply: '✅ 茼蒿 已创建，当前库存 250g。' })
      .mockReturnValueOnce({ reply: '✅ 鸡蛋 已创建，当前库存 15个。' })
      .mockReturnValueOnce({ reply: '✅ 牛奶 已创建，当前库存 2.8L。' });

    const resolution = handlePendingAiAction('确认', new Date('2026-04-01'));

    expect(mocks.consumePendingAiActionForConfirmation).toHaveBeenCalledTimes(
      1,
    );
    expect(mocks.savePendingConfirmationReceipt).toHaveBeenCalledTimes(1);
    expect(mocks.executeCommandRoute).toHaveBeenCalledTimes(3);
    expect(resolution).toEqual({
      kind: 'result',
      result: {
        handlingMode: 'ai',
        traceId: '',
        intent: '',
        tool: '',
        confirmationState: 'confirmed',
        resultCode: 'confirmed-write',
        status: 'success',
        note: 'mode=command; intent=stock_adjust; stock-items=3; confirmed=true; stock-batch=3/3',
        reply:
          '库存已更新，共 3 项。\n✅ 茼蒿 已创建，当前库存 250g。\n✅ 鸡蛋 已创建，当前库存 15个。\n✅ 牛奶 已创建，当前库存 2.8L。',
      },
    });
  });

  it('marks a batch stock update as partial when some items fail', () => {
    const pendingAction = {
      kind: 'stock-batch',
      createdAt: '2026-04-01T10:00:00.000Z',
      sourceText: '批量库存更新',
      previewText: 'preview',
      operation: 'adjust',
      items: [
        { name: '菠菜', quantity: 600, unit: 'g' },
        { name: '西兰花', quantity: 280, unit: 'g' },
      ],
      note: 'mode=command; intent=stock_adjust; stock-items=2',
    };

    mocks.getPendingAiAction.mockReturnValue(pendingAction);
    mocks.consumePendingAiActionForConfirmation.mockReturnValue(pendingAction);

    mocks.executeCommandRoute
      .mockReturnValueOnce({ reply: '✅ 菠菜 已创建，当前库存 600g。' })
      .mockReturnValueOnce(null);

    const resolution = handlePendingAiAction('确认', new Date('2026-04-01'));

    expect(resolution).toEqual({
      kind: 'result',
      result: {
        handlingMode: 'ai',
        traceId: '',
        intent: '',
        tool: '',
        confirmationState: 'failed',
        resultCode: 'confirmed-write',
        status: 'failed',
        note: 'mode=command; intent=stock_adjust; stock-items=2; confirmed=true; stock-batch=1/2',
        reply:
          '库存已更新 1 项。\n✅ 菠菜 已创建，当前库存 600g。\n以下项目没有写入：西兰花',
      },
    });
  });
});
