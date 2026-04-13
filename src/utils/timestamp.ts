import { spreadsheetService } from '../services/spreadsheet';
import { readTrimmedString } from './value';

const IOS_SHORTCUT_DATETIME_PATTERN =
  /^(\d{2,4})\/(\d{1,2})\/(\d{1,2}),\s*[^,]+,\s*(\d{1,2}):(\d{2})\s*([AP]M)$/i;

function normalizeLocalizedDateText(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ').trim();
}

function parseIosShortcutDateText(text: string): Date | null {
  const normalized = normalizeLocalizedDateText(text);
  const match = normalized.match(IOS_SHORTCUT_DATETIME_PATTERN);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, meridiem] =
    match;
  const year =
    yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const minute = Number(minuteText);
  let hour = Number(hourText);

  if (meridiem.toUpperCase() === 'AM') {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }

  const parsed = new Date(year, month - 1, day, hour, minute, 0);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTimestampText(text: string): Date | null {
  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return parseIosShortcutDateText(text);
}

export function normalizeTimestampText(value: unknown, label: string): string {
  const text = readTrimmedString(value, label);

  if (text === null) {
    throw new Error(`${label} must be a non-empty string`);
  }

  const parsed = parseTimestampText(text);

  if (!parsed) {
    throw new Error(`${label} must be a valid datetime string`);
  }

  return spreadsheetService.getTimestamp(false, parsed);
}

export function parseDateStamp(dateStamp: string): Date {
  const [year, month, day] = dateStamp.split('-').map(Number);

  return new Date(year, month - 1, day);
}
