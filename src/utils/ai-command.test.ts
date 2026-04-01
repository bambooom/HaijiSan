import { describe, expect, it } from 'vitest';

import { AI_INTENTS } from '../constants/ai';
import {
  appendAiNote,
  buildCommandFromAiPlan,
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
});
