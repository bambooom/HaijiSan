import { describe, expect, it } from 'vitest';

import { AI_INTENTS } from '../constants/ai';
import {
  appendAiNote,
  buildStockBatchPreview,
  buildStockMutationCommandText,
  buildCommandFromAiPlan,
  formatToolArgsForNote,
  resolveAiStockItems,
  summarizeAiPlan,
} from './ai-command';

describe('buildCommandFromAiPlan', () => {
  it('builds weight commands', () => {
    expect(
      buildCommandFromAiPlan({
        mode: 'command',
        intent: AI_INTENTS.WEIGHT,
        reply: '',
        weightKg: 55.3,
      }),
    ).toBe('/weight 55.3');
  });

  it('builds sleep commands with quality', () => {
    expect(
      buildCommandFromAiPlan({
        mode: 'command',
        intent: AI_INTENTS.SLEEP,
        reply: '',
        sleepStart: '23:30',
        sleepEnd: '07:30',
        sleepQuality: 'good',
      }),
    ).toBe('/sleep 23:30 07:30 good');
  });

  it('keeps mapped sleep commands unchanged when targetDate is present', () => {
    expect(
      buildCommandFromAiPlan({
        mode: 'command',
        intent: AI_INTENTS.SLEEP,
        reply: '',
        targetDate: '2026-04-02',
        sleepStart: '02:42',
        sleepEnd: '08:20',
        sleepQuality: 'normal',
      }),
    ).toBe('/sleep 02:42 08:20 normal');
  });

  it('builds positive stock adjustment commands with a plus sign', () => {
    expect(
      buildCommandFromAiPlan({
        mode: 'command',
        intent: AI_INTENTS.STOCK_ADJUST,
        reply: '',
        stockItemName: '鸡蛋',
        stockQuantity: 6,
        stockUnit: '个',
        purchaseChannel: '盒马',
      }),
    ).toBe('/stock 鸡蛋 +6个 盒马');
  });

  it('builds a stock command from stockItems when there is exactly one item', () => {
    expect(
      buildCommandFromAiPlan({
        mode: 'command',
        intent: AI_INTENTS.STOCK_SET,
        reply: '',
        stockItems: [
          {
            name: '牛奶',
            quantity: 2.8,
            unit: 'L',
          },
        ],
      }),
    ).toBe('/setstock 牛奶 2.8L');
  });

  it('returns null for multi-item stock plans because they must use batch execution', () => {
    expect(
      buildCommandFromAiPlan({
        mode: 'command',
        intent: AI_INTENTS.STOCK_ADJUST,
        reply: '',
        stockItems: [
          {
            name: '鸡蛋',
            quantity: 15,
            unit: '个',
          },
          {
            name: '菠菜',
            quantity: 600,
            unit: 'g',
          },
        ],
      }),
    ).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(
      buildCommandFromAiPlan({
        mode: 'command',
        intent: AI_INTENTS.WORKOUT,
        reply: '',
        workoutName: '跑步',
      }),
    ).toBeNull();
  });
});

describe('AI note helpers', () => {
  it('summarizes a plan with the command and note', () => {
    expect(
      summarizeAiPlan(
        {
          mode: 'command',
          intent: AI_INTENTS.SYMPTOM,
          reply: '',
          symptom: '头痛',
          note: 'user-mentioned-cycle-day',
        },
        '/symptom 头痛 day 2',
      ),
    ).toBe(
      'mode=command; intent=symptom; command=/symptom 头痛 day 2; note=user-mentioned-cycle-day',
    );
  });

  it('appends note fragments consistently', () => {
    expect(
      appendAiNote('mode=command; intent=sleep', 'pending-confirmation=true'),
    ).toBe('mode=command; intent=sleep; pending-confirmation=true');
  });

  it('formats tool arguments into a compact trace string', () => {
    expect(
      formatToolArgsForNote({
        mealText: '鸡胸肉沙拉加一杯很长很长很长很长很长的酸奶描述',
        items: [
          { name: '鸡胸肉', quantity: 150, unit: 'g' },
          { name: '生菜', quantity: 80, unit: 'g' },
          { name: '酸奶', quantity: 200, unit: 'ml' },
          { name: '橄榄油', quantity: 10, unit: 'ml' },
        ],
      }),
    ).toContain('mealText');
  });

  it('normalizes stock items from either stockItems or legacy single-item fields', () => {
    expect(
      resolveAiStockItems({
        mode: 'command',
        intent: AI_INTENTS.STOCK_ADJUST,
        reply: '',
        stockItems: [
          {
            name: ' 菠菜 ',
            quantity: 600,
            unit: ' g ',
          },
        ],
      }),
    ).toEqual([
      {
        name: '菠菜',
        quantity: 600,
        unit: 'g',
        purchaseChannel: undefined,
      },
    ]);

    expect(
      resolveAiStockItems({
        mode: 'command',
        intent: AI_INTENTS.STOCK_ADJUST,
        reply: '',
        stockItemName: '鸡蛋',
        stockQuantity: 15,
        stockUnit: '个',
      }),
    ).toEqual([
      {
        name: '鸡蛋',
        quantity: 15,
        unit: '个',
        purchaseChannel: undefined,
      },
    ]);
  });

  it('builds stock batch previews and stock mutation command text', () => {
    expect(
      buildStockBatchPreview(AI_INTENTS.STOCK_ADJUST, [
        {
          name: '鸡蛋',
          quantity: 15,
          unit: '个',
        },
        {
          name: '牛奶',
          quantity: 2.8,
          unit: 'L',
        },
      ]),
    ).toContain('我准备更新这些库存');

    expect(
      buildStockMutationCommandText('adjust', {
        name: '鸡蛋',
        quantity: 15,
        unit: '个',
      }),
    ).toBe('/stock 鸡蛋 +15个');
  });

  it('builds a readable preview for a long batch stock update list', () => {
    const preview = buildStockBatchPreview(AI_INTENTS.STOCK_ADJUST, [
      { name: '茼蒿', quantity: 250, unit: 'g' },
      { name: '鸡蛋', quantity: 15, unit: '个' },
      { name: '小番茄', quantity: 100, unit: 'g' },
      { name: '欧包', quantity: 57, unit: 'g' },
      { name: '牛奶', quantity: 2.8, unit: 'L' },
      { name: '有机西兰花', quantity: 300, unit: 'g' },
      { name: '海鲜菇', quantity: 250, unit: 'g' },
      { name: '菠菜', quantity: 600, unit: 'g' },
      { name: '苋菜', quantity: 300, unit: 'g' },
      { name: '枸杞芽', quantity: 250, unit: 'g' },
      { name: '娃娃菜', quantity: 400, unit: 'g' },
      { name: '荔浦芋头', quantity: 157, unit: 'g' },
      { name: '西葫芦', quantity: 1, unit: '根' },
      { name: '西兰花', quantity: 280, unit: 'g' },
    ]);

    expect(preview).toContain('我准备更新这些库存');
    expect(preview).toContain('- 茼蒿 +250g');
    expect(preview).toContain('- 鸡蛋 +15个');
    expect(preview).toContain('- 牛奶 +2.8L');
    expect(preview).toContain('- 西葫芦 +1根');
    expect(preview).toContain('回复“确认”写入，回复“取消”放弃。');
  });
});
