import type { SheetCellValue, TimestampFormatter } from '../types';

export function createTimestampedEntryId(
  spreadsheet: TimestampFormatter,
  prefix: string,
  timestamp: Date,
): string {
  return `${prefix}_${spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
}

export function formatLoggedAt(
  spreadsheet: TimestampFormatter,
  timestamp: Date,
): string {
  return spreadsheet.getTimestamp(false, timestamp);
}

export function formatSheetCellAsString(
  spreadsheet: TimestampFormatter,
  value: SheetCellValue,
): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return spreadsheet.getTimestamp(false, value);
  }

  return '';
}
