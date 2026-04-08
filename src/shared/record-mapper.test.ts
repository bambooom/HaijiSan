import { describe, expect, it, vi } from 'vitest';

import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import {
  mapRowToRecord,
  serializeRecordToRow,
  validateRecordAgainstSchema,
} from './record-mapper';

const spreadsheet = {
  getTimestamp: vi.fn().mockReturnValue('2026-04-02 08:30:00'),
} as const;

describe('record mapper', () => {
  it('maps a Date-valued row to a typed record using field schema metadata', () => {
    const record = mapRowToRecord(spreadsheet, SHEET_SCHEMAS.BODY_LOG, [
      'body_1',
      new Date('2026-04-02T00:30:00.000Z'),
      '2026-04-01 22:30:00',
      55.3,
      '',
      '',
      '',
      'manual',
      '',
    ]);

    expect(record).toEqual({
      body_log_id: 'body_1',
      logged_at: '2026-04-02 08:30:00',
      occurred_at: '2026-04-01 22:30:00',
      weight_kg: 55.3,
      bmi: null,
      body_fat_pct: null,
      lean_body_mass_kg: null,
      source: 'manual',
      note: '',
    });
  });

  it('serializes a record to row order using the shared schema', () => {
    const row = serializeRecordToRow(spreadsheet, SHEET_SCHEMAS.FOOD_LOG, {
      food_log_id: 'food_1',
      logged_at: '2026-04-02 08:30:00',
      occurred_at: '2026-04-02 08:10:00',
      meal_type: 'breakfast',
      meal_text: '鸡蛋燕麦',
      calories_kcal: 360,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
      vegetable_g: null,
      linked_food_ref_ids: '',
      linked_stock_item_ids: '',
      note: '',
    });

    expect(row).toEqual([
      'food_1',
      '2026-04-02 08:30:00',
      '2026-04-02 08:10:00',
      'breakfast',
      '鸡蛋燕麦',
      360,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('validates required fields, enums, and unknown keys', () => {
    const errors = validateRecordAgainstSchema(SHEET_SCHEMAS.BODY_LOG, {
      body_log_id: '',
      logged_at: '2026-04-02 08:30:00',
      occurred_at: '2026-04-02 07:45:00',
      source: 'robot',
      unexpected: 'x',
    });

    expect(errors).toEqual([
      'Unknown field: unexpected',
      'Required field is empty: body_log_id',
      'Field source must be one of: manual, ios_health, smart_scale',
    ]);
  });

  it('rejects timestamp strings that do not use sheet timestamp format', () => {
    const errors = validateRecordAgainstSchema(SHEET_SCHEMAS.FOOD_LOG, {
      food_log_id: 'food_1',
      logged_at: '2026-04-02 08:30:00',
      occurred_at: 'today 08:55',
      meal_type: 'breakfast',
      meal_text: '鸡蛋和咖啡',
    });

    expect(errors).toEqual([
      'Field occurred_at must use timestamp format yyyy-MM-dd HH:mm:ss',
    ]);
  });

  it('allows millisecond timestamps for Bot_Log logged_at', () => {
    const errors = validateRecordAgainstSchema(SHEET_SCHEMAS.BOT_LOG, {
      logged_at: '2026-04-02 08:30:00.123',
      raw_text: 'hello',
      final_reply: 'world',
      handling_mode: 'ai',
      status: 'success',
    });

    expect(errors).toEqual([]);
  });

  it('allows partial validation for update-style payloads', () => {
    const errors = validateRecordAgainstSchema(
      SHEET_SCHEMAS.STOCK,
      {
        quantity: 12,
      },
      { partial: true },
    );

    expect(errors).toEqual([]);
  });
});
