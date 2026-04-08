import { describe, expect, it, vi } from 'vitest';

import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import { insertSheetRecord, updateSheetRecordAtRow } from './record-write';

describe('record write helpers', () => {
  it('serializes and inserts a record using the schema', () => {
    const spreadsheet = {
      appendRow: vi.fn(),
      getTimestamp: vi.fn().mockReturnValue('2026-04-02 08:30:00'),
    } as const;

    insertSheetRecord(spreadsheet as never, SHEET_SCHEMAS.BODY_LOG, {
      body_log_id: 'body_1',
      logged_at: '2026-04-02 08:30:00',
      occurred_at: '2026-04-02 07:45:00',
      weight_kg: 55.1,
      bmi: null,
      body_fat_pct: null,
      lean_body_mass_kg: null,
      source: 'manual',
      note: '',
    });

    expect(spreadsheet.appendRow).toHaveBeenCalledWith('Body_Log', [
      'body_1',
      '2026-04-02 08:30:00',
      '2026-04-02 07:45:00',
      55.1,
      '',
      '',
      '',
      'manual',
      '',
    ]);
  });

  it('validates partial updates and serializes only provided keys', () => {
    const spreadsheet = {
      updateRecordAtRow: vi.fn(),
      getTimestamp: vi.fn().mockReturnValue('2026-04-02 08:30:00'),
    } as const;

    updateSheetRecordAtRow(spreadsheet as never, SHEET_SCHEMAS.STOCK, 3, {
      quantity: 12,
      updated_at: '2026-04-02 08:30:00',
    });

    expect(spreadsheet.updateRecordAtRow).toHaveBeenCalledWith(
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
      3,
      {
        quantity: 12,
        updated_at: '2026-04-02 08:30:00',
      },
    );
  });

  it('rejects invalid inserts before writing', () => {
    const spreadsheet = {
      appendRow: vi.fn(),
      getTimestamp: vi.fn().mockReturnValue('2026-04-02 08:30:00'),
    } as const;

    expect(() =>
      insertSheetRecord(spreadsheet as never, SHEET_SCHEMAS.BODY_LOG, {
        body_log_id: '',
        logged_at: '2026-04-02 08:30:00',
        occurred_at: '2026-04-02 07:45:00',
        source: 'oops',
      }),
    ).toThrow('Cannot insert into Body_Log');
    expect(spreadsheet.appendRow).not.toHaveBeenCalled();
  });
});
