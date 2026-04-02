import { describe, expect, it } from 'vitest';

import { buildCommandLogFields, deriveCommandLogMeta } from './log-meta';

describe('deriveCommandLogMeta', () => {
  it('returns direct structured metadata from result.logMeta', () => {
    expect(
      deriveCommandLogMeta({
        reply: 'preview',
        handlingMode: 'ai',
        status: 'success',
        note: 'plain note',
        traceId: 'trace-1',
        intent: 'stock_adjust',
        tool: 'adjustStock',
        confirmationState: 'pending',
        resultCode: 'pending-write',
      }),
    ).toEqual({
      traceId: 'trace-1',
      intent: 'stock_adjust',
      tool: 'adjustStock',
      confirmationState: 'pending',
      resultCode: 'pending-write',
    });
  });

  it('fills defaults when structured metadata is missing', () => {
    expect(
      deriveCommandLogMeta({
        reply: 'cancelled',
        handlingMode: 'command',
        status: 'ignored',
        note: 'slash-cancel',
        traceId: '',
        intent: '',
        tool: '',
        confirmationState: 'none',
        resultCode: '',
      }),
    ).toEqual({
      traceId: '',
      intent: '',
      tool: '',
      confirmationState: 'none',
      resultCode: '',
    });
  });

  it('merges base and override metadata predictably', () => {
    expect(
      buildCommandLogFields(
        {
          traceId: 'trace-2',
          intent: 'food_estimate',
          tool: 'logMeal',
          confirmationState: 'pending',
          resultCode: 'pending-write',
        },
        {
          confirmationState: 'confirmed',
          resultCode: 'confirmed-write',
        },
      ),
    ).toEqual({
      traceId: 'trace-2',
      intent: 'food_estimate',
      tool: 'logMeal',
      confirmationState: 'confirmed',
      resultCode: 'confirmed-write',
    });
  });
});
