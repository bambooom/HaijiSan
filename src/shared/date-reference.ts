import type { AiIntent } from '../types';

const BACKFILL_SUPPORTED_INTENTS = new Set<AiIntent>([
  'weight',
  'poo',
  'period',
  'symptom',
  'sleep',
  'workout',
  'food',
  'nutrition_summary',
]);

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const candidate = new Date(year, month - 1, day);

  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}

export function formatDateStamp(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
}

export function isDateStamp(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return false;
  }

  return isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

function shiftDays(baseDate: Date, offset: number): string {
  const shifted = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + offset,
    baseDate.getHours(),
    baseDate.getMinutes(),
    baseDate.getSeconds(),
    baseDate.getMilliseconds(),
  );

  return formatDateStamp(shifted);
}

function normalizeExplicitDate(
  year: number,
  month: number,
  day: number,
): string | null {
  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return [year, pad(month), pad(day)].join('-');
}

export function parseTargetDateReference(
  text: string,
  referenceDate: Date,
): string | null {
  const normalized = text.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.includes('今天')) {
    return formatDateStamp(referenceDate);
  }

  if (normalized.includes('大前天')) {
    return shiftDays(referenceDate, -3);
  }

  if (normalized.includes('前天')) {
    return shiftDays(referenceDate, -2);
  }

  if (normalized.includes('昨天')) {
    return shiftDays(referenceDate, -1);
  }

  const fullDateMatch = normalized.match(
    /(?<!\d)(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})(?:日|号)?(?!\d)/,
  );

  if (fullDateMatch) {
    return normalizeExplicitDate(
      Number(fullDateMatch[1]),
      Number(fullDateMatch[2]),
      Number(fullDateMatch[3]),
    );
  }

  const monthDayMatch = normalized.match(
    /(?<!\d)(\d{1,2})[月/.-](\d{1,2})(?:日|号)?(?!\d)/,
  );

  if (!monthDayMatch) {
    return null;
  }

  const month = Number(monthDayMatch[1]);
  const day = Number(monthDayMatch[2]);
  const currentYear = referenceDate.getFullYear();
  const currentYearCandidate = normalizeExplicitDate(currentYear, month, day);

  if (!currentYearCandidate) {
    return null;
  }

  const candidateDate = new Date(currentYear, month - 1, day);
  const referenceDay = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );

  if (candidateDate.getTime() <= referenceDay.getTime()) {
    return currentYearCandidate;
  }

  return normalizeExplicitDate(currentYear - 1, month, day);
}

export function resolveTargetDateTimestamp(
  baseTimestamp: Date,
  targetDate: string | null | undefined,
): Date {
  if (!isDateStamp(targetDate)) {
    return baseTimestamp;
  }

  const [year, month, day] = targetDate.split('-').map(Number);

  return new Date(
    year,
    month - 1,
    day,
    baseTimestamp.getHours(),
    baseTimestamp.getMinutes(),
    baseTimestamp.getSeconds(),
    baseTimestamp.getMilliseconds(),
  );
}

export function supportsBackfillForIntent(intent: AiIntent): boolean {
  return BACKFILL_SUPPORTED_INTENTS.has(intent);
}

export function formatDateLabel(targetDate: string): string {
  return targetDate;
}
