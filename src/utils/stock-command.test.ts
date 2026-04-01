import { describe, expect, it, vi } from 'vitest';

vi.mock('../repositories', () => ({
  stockRepository: {
    listStock: vi.fn(() => []),
  },
}));

import { SLASH_COMMANDS } from '../constants/commands';
import {
  buildSetStockMessage,
  buildStockAdjustMessage,
  parseStockCommand,
} from './stock-command';

describe('parseStockCommand', () => {
  it('parses stock adjustment with attached unit and purchase channel', () => {
    expect(
      parseStockCommand('/stock 鸡蛋 +6个 盒马', SLASH_COMMANDS.STOCK),
    ).toEqual({
      name: '鸡蛋',
      quantity: '+6',
      unit: '个',
      purchaseChannel: '盒马',
    });
  });

  it('parses stock adjustment without purchase channel', () => {
    expect(parseStockCommand('/stock 鸡蛋 -2个', SLASH_COMMANDS.STOCK)).toEqual(
      {
        name: '鸡蛋',
        quantity: '-2',
        unit: '个',
        purchaseChannel: undefined,
      },
    );
  });

  it('parses setstock command with separated unit', () => {
    expect(
      parseStockCommand('/setstock 鸡蛋 12 个 盒马', SLASH_COMMANDS.SET_STOCK),
    ).toEqual({
      name: '鸡蛋',
      quantity: '12',
      unit: '个',
      purchaseChannel: '盒马',
    });
  });

  it('returns null for invalid command payloads', () => {
    expect(parseStockCommand('/stock 鸡蛋', SLASH_COMMANDS.STOCK)).toBeNull();
    expect(parseStockCommand('/setstock', SLASH_COMMANDS.SET_STOCK)).toBeNull();
  });
});

describe('stock command messages', () => {
  it('builds create and adjust success messages', () => {
    expect(
      buildStockAdjustMessage(
        '鸡蛋',
        '+6',
        {
          ok: true,
          operation: 'create',
          quantity: 6,
          entry: {
            stock_item_id: 'stock_1',
            item_name: '鸡蛋',
            quantity: 6,
            unit: '个',
            purchased_at: '',
            updated_at: '',
            purchase_channel: '盒马',
            linked_food_ref_id: '',
            note: '',
          },
        },
        '盒马',
      ),
    ).toContain('鸡蛋 已创建');

    expect(
      buildSetStockMessage(
        '鸡蛋',
        '12',
        {
          ok: true,
          operation: 'set',
          quantity: 12,
          entry: {
            stock_item_id: 'stock_1',
            item_name: '鸡蛋',
            quantity: 12,
            unit: '个',
            purchased_at: '',
            updated_at: '',
            purchase_channel: '盒马',
            linked_food_ref_id: '',
            note: '',
          },
        },
        '盒马',
      ),
    ).toContain('库存已校正为 12个');
  });

  it('builds failure messages for not-found and invalid quantity cases', () => {
    expect(
      buildStockAdjustMessage('鸡蛋', '-2', { ok: false, reason: 'not-found' }),
    ).toContain('目前不存在');

    expect(
      buildSetStockMessage('鸡蛋', '12', {
        ok: false,
        reason: 'invalid-quantity',
        quantity: -1,
      }),
    ).toContain('必须是大于等于 0 的数字');
  });
});
