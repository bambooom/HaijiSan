import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDataRows: vi.fn(),
  updateRecordAtRow: vi.fn(),
  appendRow: vi.fn(),
  getTimestamp: vi.fn((_: boolean = false, date: Date = new Date()) =>
    date.toISOString().slice(0, 19).replace('T', ' '),
  ),
}));

vi.mock('../services/spreadsheet', () => ({
  spreadsheetService: {
    getDataRows: mocks.getDataRows,
    updateRecordAtRow: mocks.updateRecordAtRow,
    appendRow: mocks.appendRow,
    getTimestamp: mocks.getTimestamp,
  },
}));

import { StockTable } from './stock-table';

describe('stock table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDataRows.mockReturnValue([
      {
        rowNumber: 2,
        values: [
          'stock_1',
          '鸡蛋',
          6,
          '个/份',
          '2026-04-08 08:00:00',
          '2026-04-08 08:00:00',
          '',
          'ref_egg',
          'keep me',
        ],
      },
    ]);
  });

  it('preserves existing note when adjustStock is called without a new note', () => {
    const table = new StockTable();

    const result = table.adjustStock(
      new Date('2026-04-08T10:00:00Z'),
      '鸡蛋',
      -1,
      '个/份',
    );

    expect(result).toMatchObject({
      ok: true,
      quantity: 5,
      operation: 'adjust',
    });
    expect(mocks.updateRecordAtRow).toHaveBeenCalledWith(
      'Stock',
      [
        'stock_item_id',
        'item_name',
        'quantity',
        'unit',
        'purchased_at',
        'updated_at',
        'purchase_channel',
        'linked_food_ref_id',
        'note',
      ],
      2,
      {
        quantity: 5,
        updated_at: '2026-04-08 10:00:00',
        unit: '个/份',
      },
    );
  });
});
