import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

import type {
  GenericToolRequest,
  ReadDataRequest,
  ToolSelector,
  UpdateDataRequest,
} from './types';
import type { FoodLogInsertRequest as StructuredFoodLogInsertRequest } from '../types';

let TOOL_REGISTRY: typeof import('./registry').TOOL_REGISTRY;
let executeGenericToolRequest: typeof import('./index').executeGenericToolRequest;
let executeInsertData: typeof import('./index').executeInsertData;
let executeReadData: typeof import('./index').executeReadData;
let executeUpdateData: typeof import('./index').executeUpdateData;
let validateGenericToolRequest: typeof import('./validation').validateGenericToolRequest;
let validateAiToolRequest: typeof import('./validation').validateAiToolRequest;
let validateFoodLogInsertRequest: typeof import('./validation').validateFoodLogInsertRequest;
let validateInsertDataRequest: typeof import('./validation').validateInsertDataRequest;
let validateReadDataRequest: typeof import('./validation').validateReadDataRequest;
let validateUpdateDataRequest: typeof import('./validation').validateUpdateDataRequest;
let spreadsheetService: typeof import('../services/spreadsheet').spreadsheetService;

beforeAll(async () => {
  const executionModule = await import('./index');
  const registryModule = await import('./registry');
  const validationModule = await import('./validation');
  const spreadsheetModule = await import('../services/spreadsheet');

  TOOL_REGISTRY = registryModule.TOOL_REGISTRY;
  executeGenericToolRequest = executionModule.executeGenericToolRequest;
  executeInsertData = executionModule.executeInsertData;
  executeReadData = executionModule.executeReadData;
  executeUpdateData = executionModule.executeUpdateData;
  validateAiToolRequest = validationModule.validateAiToolRequest;
  validateFoodLogInsertRequest = validationModule.validateFoodLogInsertRequest;
  validateGenericToolRequest = validationModule.validateGenericToolRequest;
  validateInsertDataRequest = validationModule.validateInsertDataRequest;
  validateReadDataRequest = validationModule.validateReadDataRequest;
  validateUpdateDataRequest = validationModule.validateUpdateDataRequest;
  spreadsheetService = spreadsheetModule.spreadsheetService;
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('generic tool contract', () => {
  it('defines the minimal selector union and request discriminants', () => {
    const selector: ToolSelector = {
      type: 'date-range',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
    };
    const readRequest: ReadDataRequest = {
      tool: 'readData',
      sheet: 'FOOD_LOG',
      selector,
      fields: ['meal_text', 'occurred_at'],
    };
    const updateRequest: UpdateDataRequest = {
      tool: 'updateData',
      sheet: 'BODY_LOG',
      selector: {
        type: 'row-number',
        rowNumber: 12,
      },
      updates: {
        occurred_at: '2026-04-02 07:30:00',
      },
    };
    const requests: GenericToolRequest[] = [
      readRequest,
      {
        tool: 'insertData',
        sheet: 'STATUS_LOG',
        record: {
          entry_type: 'symptom',
          occurred_at: '2026-04-02 09:00:00',
        },
      },
      updateRequest,
    ];

    expect(readRequest.selector.type).toBe('date-range');
    expect(updateRequest.selector.type).toBe('row-number');
    expect(requests).toHaveLength(3);
  });

  it('registers sheet schemas with table instances', () => {
    expect(TOOL_REGISTRY.FOOD_LOG.schema.name).toBe('Food_Log');
    expect(typeof TOOL_REGISTRY.FOOD_LOG.table.listEntries).toBe('function');
    expect(TOOL_REGISTRY.BOT_LOG.schema.tooling.allowedOperations).toEqual([
      'read',
    ]);
  });

  it('rejects bot log insert and update through generic tools', () => {
    expect(
      validateInsertDataRequest({
        tool: 'insertData',
        sheet: 'BOT_LOG',
        record: {
          raw_text: 'test',
        },
      }),
    ).toContain('Sheet BOT_LOG does not allow insertData.');

    expect(
      validateUpdateDataRequest({
        tool: 'updateData',
        sheet: 'BOT_LOG',
        selector: {
          type: 'row-number',
          rowNumber: 2,
        },
        updates: {
          note: 'test',
        },
      }),
    ).toContain('Sheet BOT_LOG does not allow updateData.');
  });

  it('rejects unsupported selectors and unknown fields', () => {
    expect(
      validateReadDataRequest({
        tool: 'readData',
        sheet: 'STOCK',
        selector: {
          type: 'date',
          date: '2026-04-08',
        },
      }),
    ).toContain('Sheet STOCK does not allow selector type date.');

    expect(
      validateReadDataRequest({
        tool: 'readData',
        sheet: 'FOOD_LOG',
        selector: {
          type: 'recent',
          limit: 3,
        },
        fields: ['meal_text', 'not_a_field'],
      }),
    ).toContain('Unknown field for Food_Log: not_a_field');
  });

  it('rejects auto-generated and immutable field writes', () => {
    expect(
      validateInsertDataRequest({
        tool: 'insertData',
        sheet: 'BODY_LOG',
        record: {
          body_log_id: 'body_1',
          occurred_at: '2026-04-02 07:30:00',
        },
      }),
    ).toContain(
      'Field body_log_id on BODY_LOG is auto-generated and cannot be provided.',
    );

    expect(
      validateUpdateDataRequest({
        tool: 'updateData',
        sheet: 'FOOD_LOG',
        selector: {
          type: 'row-number',
          rowNumber: 4,
        },
        updates: {
          logged_at: '2026-04-08 09:00:00',
        },
      }),
    ).toContain(
      'Field logged_at on FOOD_LOG is immutable and cannot be updated.',
    );
  });

  it('accepts a valid generic update request', () => {
    expect(
      validateGenericToolRequest({
        tool: 'updateData',
        sheet: 'STATUS_LOG',
        selector: {
          type: 'row-number',
          rowNumber: 10,
        },
        updates: {
          occurred_at: '2026-04-02 10:45:00',
          note: 'correction',
        },
      }),
    ).toEqual([]);
  });

  it('validates structured FOOD_LOG insert requests with item-level checks', () => {
    const request: StructuredFoodLogInsertRequest = {
      tool: 'insertFoodLog',
      sheet: 'FOOD_LOG',
      record: {
        occurred_at: '2026-04-08 12:30:00',
        meal_type: 'lunch',
        meal_text: '鸡蛋和菠菜',
      },
      items: [
        {
          itemName: '鸡蛋',
          quantity: 2,
          unit: 'piece',
        },
      ],
    };

    expect(validateFoodLogInsertRequest(request)).toEqual([]);
    expect(validateAiToolRequest(request)).toEqual([]);
  });

  it('rejects invalid structured FOOD_LOG insert requests', () => {
    const request: StructuredFoodLogInsertRequest = {
      tool: 'insertFoodLog',
      sheet: 'FOOD_LOG',
      record: {
        occurred_at: '2026-04-08 12:30:00',
        meal_type: 'lunch',
        meal_text: '鸡蛋和菠菜',
        food_log_id: 'food_1',
      },
      items: [
        {
          itemName: '',
          quantity: 0,
          unit: ' ',
        },
      ],
    };

    expect(validateFoodLogInsertRequest(request)).toEqual(
      expect.arrayContaining([
        'Field food_log_id on FOOD_LOG is auto-generated and cannot be provided.',
        'FOOD_LOG items[0].itemName must be a non-empty string.',
        'FOOD_LOG items[0].quantity must be a positive number.',
        'FOOD_LOG items[0].unit must be a non-empty string.',
      ]),
    );
  });

  it('executes readData with selector filtering and field projection', () => {
    vi.spyOn(spreadsheetService, 'getDataRows').mockReturnValue([
      {
        rowNumber: 2,
        values: [
          'food_1',
          '2026-04-08 10:00:00',
          '2026-04-07 19:30:00',
          'dinner',
          '牛肉面',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ],
      },
      {
        rowNumber: 3,
        values: [
          'food_2',
          '2026-04-08 11:00:00',
          '2026-04-08 08:00:00',
          'breakfast',
          '酸奶',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ],
      },
    ]);
    vi.spyOn(spreadsheetService, 'getTimestamp').mockImplementation(
      (_includeMilliseconds = false, date: Date = new Date()) =>
        date.toISOString().slice(0, 19).replace('T', ' '),
    );

    const result = executeReadData({
      tool: 'readData',
      sheet: 'FOOD_LOG',
      selector: {
        type: 'date',
        date: '2026-04-08',
      },
      fields: ['meal_text', 'occurred_at'],
    });

    expect(result.rows).toEqual([
      {
        rowNumber: 3,
        record: {
          meal_text: '酸奶',
          occurred_at: '2026-04-08 08:00:00',
        },
      },
    ]);
  });

  it('executes insertData with runtime-generated id and logged_at', () => {
    const insertSpy = vi
      .spyOn(TOOL_REGISTRY.BODY_LOG.table, 'insert')
      .mockImplementation(() => {});
    vi.spyOn(spreadsheetService, 'getTimestamp').mockImplementation(
      (includeMilliseconds = false) =>
        includeMilliseconds ? '2026-04-08 12:00:00.123' : '2026-04-08 12:00:00',
    );

    const result = executeInsertData(
      {
        tool: 'insertData',
        sheet: 'BODY_LOG',
        record: {
          occurred_at: '2026-04-07 07:30:00',
          weight_kg: 54.8,
          source: 'manual',
          note: '',
        },
      },
      new Date('2026-04-08T12:00:00Z'),
    );

    expect(insertSpy).toHaveBeenCalledWith({
      body_log_id: 'body_20260408120000123',
      logged_at: '2026-04-08 12:00:00',
      occurred_at: '2026-04-07 07:30:00',
      weight_kg: 54.8,
      source: 'manual',
      note: '',
    });
    expect(result.record).toMatchObject({
      body_log_id: 'body_20260408120000123',
      logged_at: '2026-04-08 12:00:00',
    });
  });

  it('defaults missing occurred_at to now for event-log inserts', () => {
    const insertSpy = vi
      .spyOn(TOOL_REGISTRY.FOOD_LOG.table, 'insert')
      .mockImplementation(() => {});
    vi.spyOn(spreadsheetService, 'getTimestamp').mockImplementation(
      (includeMilliseconds = false) =>
        includeMilliseconds ? '2026-04-08 08:55:00.123' : '2026-04-08 08:55:00',
    );

    const result = executeInsertData(
      {
        tool: 'insertData',
        sheet: 'FOOD_LOG',
        record: {
          meal_type: 'breakfast',
          meal_text: '2个鸡蛋，一杯咖啡（200ml牛奶）',
        },
      },
      new Date('2026-04-08T08:55:00Z'),
    );

    expect(insertSpy).toHaveBeenCalledWith({
      food_log_id: 'food_20260408085500123',
      logged_at: '2026-04-08 08:55:00',
      occurred_at: '2026-04-08 08:55:00',
      meal_type: 'breakfast',
      meal_text: '2个鸡蛋，一杯咖啡（200ml牛奶）',
    });
    expect(result.record).toMatchObject({
      food_log_id: 'food_20260408085500123',
      logged_at: '2026-04-08 08:55:00',
      occurred_at: '2026-04-08 08:55:00',
    });
  });

  it('auto-calculates sleep_hours for sleep log inserts when omitted', () => {
    const insertSpy = vi
      .spyOn(TOOL_REGISTRY.SLEEP_LOG.table, 'insert')
      .mockImplementation(() => {});
    vi.spyOn(spreadsheetService, 'getTimestamp').mockImplementation(
      (includeMilliseconds = false) =>
        includeMilliseconds ? '2026-04-08 08:00:00.123' : '2026-04-08 08:00:00',
    );

    const result = executeInsertData(
      {
        tool: 'insertData',
        sheet: 'SLEEP_LOG',
        record: {
          sleep_start_at: '2026-04-08 02:30:00',
          sleep_end_at: '2026-04-08 07:06:00',
          sleep_quality: 'poor',
          source: 'manual',
        },
      },
      new Date('2026-04-08T08:00:00Z'),
    );

    expect(insertSpy).toHaveBeenCalledWith({
      sleep_log_id: 'sleep_20260408080000123',
      logged_at: '2026-04-08 08:00:00',
      sleep_start_at: '2026-04-08 02:30:00',
      sleep_end_at: '2026-04-08 07:06:00',
      sleep_hours: 4.6,
      sleep_quality: 'poor',
      source: 'manual',
    });
    expect(result.record).toMatchObject({
      sleep_hours: 4.6,
    });
  });

  it('executes updateData and auto-refreshes editable updated_at fields', () => {
    const updateSpy = vi
      .spyOn(TOOL_REGISTRY.STOCK.table, 'updateAtRow')
      .mockImplementation(() => {});
    vi.spyOn(spreadsheetService, 'getTimestamp').mockReturnValue(
      '2026-04-08 18:30:00',
    );

    const result = executeUpdateData(
      {
        tool: 'updateData',
        sheet: 'STOCK',
        selector: {
          type: 'row-number',
          rowNumber: 9,
        },
        updates: {
          quantity: 4,
        },
      },
      new Date('2026-04-08T18:30:00Z'),
    );

    expect(updateSpy).toHaveBeenCalledWith(9, {
      quantity: 4,
      updated_at: '2026-04-08 18:30:00',
    });
    expect(result.updates).toEqual({
      quantity: 4,
      updated_at: '2026-04-08 18:30:00',
    });
  });

  it('auto-calculates sleep_hours for sleep log updates when both endpoints are provided', () => {
    const updateSpy = vi
      .spyOn(TOOL_REGISTRY.SLEEP_LOG.table, 'updateAtRow')
      .mockImplementation(() => {});

    const result = executeUpdateData(
      {
        tool: 'updateData',
        sheet: 'SLEEP_LOG',
        selector: {
          type: 'row-number',
          rowNumber: 12,
        },
        updates: {
          sleep_start_at: '2026-04-08 01:30:00',
          sleep_end_at: '2026-04-08 07:00:00',
        },
      },
      new Date('2026-04-08T18:30:00Z'),
    );

    expect(updateSpy).toHaveBeenCalledWith(12, {
      sleep_start_at: '2026-04-08 01:30:00',
      sleep_end_at: '2026-04-08 07:00:00',
      sleep_hours: 5.5,
    });
    expect(result.updates).toEqual({
      sleep_start_at: '2026-04-08 01:30:00',
      sleep_end_at: '2026-04-08 07:00:00',
      sleep_hours: 5.5,
    });
  });

  it('dispatches executeGenericToolRequest by tool discriminant', () => {
    vi.spyOn(spreadsheetService, 'getDataRows').mockReturnValue([]);

    expect(
      executeGenericToolRequest({
        tool: 'readData',
        sheet: 'BOT_LOG',
        selector: {
          type: 'recent',
          limit: 5,
        },
      }),
    ).toEqual({
      tool: 'readData',
      sheet: 'BOT_LOG',
      selector: {
        type: 'recent',
        limit: 5,
      },
      rows: [],
    });
  });
});
