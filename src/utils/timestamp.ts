import { spreadsheetService } from '../services/spreadsheet';
import { readTrimmedString } from './value';

export function normalizeTimestampText(value: unknown, label: string): string {
  const text = readTrimmedString(value, label);

  if (text === null) {
    throw new Error(`${label} must be a non-empty string`);
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid datetime string`);
  }

  return spreadsheetService.getTimestamp(false, parsed);
}

export function parseDateStamp(dateStamp: string): Date {
  const [year, month, day] = dateStamp.split('-').map(Number);

  return new Date(year, month - 1, day);
}
