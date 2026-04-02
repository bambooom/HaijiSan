import type { SpreadsheetService } from '../services/spreadsheet';
import type { SheetCellValue } from '../types';

export function createTimestampedEntryId(
  spreadsheet: SpreadsheetService,
  prefix: string,
  timestamp: Date,
): string {
  return `${prefix}_${spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
}

export function formatLoggedAt(
  spreadsheet: SpreadsheetService,
  timestamp: Date,
): string {
  return spreadsheet.getTimestamp(false, timestamp);
}

export function formatSheetCellAsString(
  spreadsheet: SpreadsheetService,
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
