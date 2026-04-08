import type { SheetSchema, ToolSelectorType } from '../types';

export type ToolSheetKey =
  keyof typeof import('../constants/sheet-schema').SHEET_SCHEMAS;

export type ToolRecord = Record<string, unknown>;

type BaseSelector<TType extends ToolSelectorType> = {
  type: TType;
};

export type DateSelector = BaseSelector<'date'> & {
  date: string;
};

export type DateRangeSelector = BaseSelector<'date-range'> & {
  startDate: string;
  endDate: string;
};

export type RecentSelector = BaseSelector<'recent'> & {
  limit: number;
  referenceDate?: string;
};

export type RowNumberSelector = BaseSelector<'row-number'> & {
  rowNumber: number;
};

export type ToolSelector =
  | DateSelector
  | DateRangeSelector
  | RecentSelector
  | RowNumberSelector;

export type ReadDataRequest = {
  tool: 'readData';
  sheet: ToolSheetKey;
  selector: ToolSelector;
  fields?: string[];
};

export type ReadDataRow = {
  rowNumber: number;
  record: ToolRecord;
};

export type ReadDataResult = {
  tool: 'readData';
  sheet: ToolSheetKey;
  selector: ToolSelector;
  rows: ReadDataRow[];
};

export type InsertDataRequest = {
  tool: 'insertData';
  sheet: ToolSheetKey;
  record: ToolRecord;
};

export type InsertDataResult = {
  tool: 'insertData';
  sheet: ToolSheetKey;
  record: ToolRecord;
  rowNumber?: number;
};

export type UpdateDataRequest = {
  tool: 'updateData';
  sheet: ToolSheetKey;
  selector: RowNumberSelector;
  updates: ToolRecord;
};

export type UpdateDataResult = {
  tool: 'updateData';
  sheet: ToolSheetKey;
  selector: RowNumberSelector;
  updates: ToolRecord;
};

export type GenericToolRequest =
  | ReadDataRequest
  | InsertDataRequest
  | UpdateDataRequest;

export type GenericToolResult =
  | ReadDataResult
  | InsertDataResult
  | UpdateDataResult;

export type ToolTableLike = {
  listEntries(): unknown[];
  insert(record: unknown): void;
  updateAtRow(rowNumber: number, updates: Record<string, unknown>): void;
};

export type ToolRegistryEntry = {
  schema: SheetSchema;
  table: ToolTableLike;
  eventTimeKey?: string;
  matchesDate?: (record: ToolRecord, dateStamp: string) => boolean;
  matchesDateRange?: (
    record: ToolRecord,
    startDateStamp: string,
    endDateStamp: string,
  ) => boolean;
  sortValue?: (record: ToolRecord) => string;
};

export type RuntimeRow = {
  rowNumber: number;
  record: ToolRecord;
};
