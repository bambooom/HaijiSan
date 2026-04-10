import type {
  GenericToolRequest,
  GenericToolResult,
  InsertDataRequest,
  InsertDataResult,
  ReadDataRequest,
  ReadDataResult,
  UpdateDataRequest,
  UpdateDataResult,
} from '../types';
import { TOOL_REGISTRY } from './registry';
import {
  assertValidRequest,
  selectRows,
  projectRecord,
  applyRuntimeInsertDefaults,
  applyRuntimeUpdateDefaults,
} from './execute';

export function executeGenericToolRequest(
  request: GenericToolRequest,
  timestamp?: Date,
): GenericToolResult {
  switch (request.tool) {
    case 'readData':
      return executeReadData(request);
    case 'insertData':
      return executeInsertData(request, timestamp);
    case 'updateData':
      return executeUpdateData(request, timestamp);
  }
}

export function executeReadData(request: ReadDataRequest): ReadDataResult {
  assertValidRequest(request);

  return {
    tool: 'readData',
    sheet: request.sheet,
    selector: request.selector,
    rows: selectRows(request.sheet, request.selector).map((row) => ({
      rowNumber: row.rowNumber,
      record: projectRecord(row.record, request.fields),
    })),
  };
}

export function executeInsertData(
  request: InsertDataRequest,
  timestamp: Date = new Date(),
): InsertDataResult {
  assertValidRequest(request);

  const entry = TOOL_REGISTRY[request.sheet];
  const record = applyRuntimeInsertDefaults(entry, request.record, timestamp);

  entry.table.insert(record);

  return {
    tool: 'insertData',
    sheet: request.sheet,
    record,
  };
}

export function executeUpdateData(
  request: UpdateDataRequest,
  timestamp: Date = new Date(),
): UpdateDataResult {
  assertValidRequest(request);

  const entry = TOOL_REGISTRY[request.sheet];
  const updates = applyRuntimeUpdateDefaults(
    request.sheet,
    entry.schema,
    request.updates,
    timestamp,
  );

  entry.table.updateAtRow(request.selector.rowNumber, updates);

  return {
    tool: 'updateData',
    sheet: request.sheet,
    selector: request.selector,
    updates,
  };
}
