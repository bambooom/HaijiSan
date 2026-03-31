import type { SpreadsheetService } from '../services/spreadsheet';

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
