const BACKFILL_DATE_NOTE_PATTERN =
  /(?:^|[;\s])backfillDate=(\d{4}-\d{2}-\d{2})(?=$|[;\s])/;

function isValidDateParts(year: number, month: number, day: number): boolean {
  const candidate = new Date(year, month - 1, day);

  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}

function isDateStamp(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return false;
  }

  return isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

function normalizeDateStampRange(
  startDateStamp: string,
  endDateStamp: string,
): { startDateStamp: string; endDateStamp: string } {
  return startDateStamp <= endDateStamp
    ? { startDateStamp, endDateStamp }
    : { startDateStamp: endDateStamp, endDateStamp: startDateStamp };
}

export function extractBackfillDate(note: string): string | null {
  const match = note.match(BACKFILL_DATE_NOTE_PATTERN);

  return match?.[1] ?? null;
}

export function matchesRecordDate(
  loggedAt: string,
  note: string,
  dateStamp: string,
): boolean {
  return (
    loggedAt.startsWith(dateStamp) || extractBackfillDate(note) === dateStamp
  );
}

export function isDateStampInRange(
  dateStamp: string | null | undefined,
  startDateStamp: string,
  endDateStamp: string,
): boolean {
  if (!isDateStamp(dateStamp)) {
    return false;
  }

  const normalizedRange = normalizeDateStampRange(startDateStamp, endDateStamp);

  return (
    dateStamp >= normalizedRange.startDateStamp &&
    dateStamp <= normalizedRange.endDateStamp
  );
}

export function matchesRecordDateRange(
  loggedAt: string,
  note: string,
  startDateStamp: string,
  endDateStamp: string,
): boolean {
  const loggedAtDateStamp = loggedAt.slice(0, 10);
  const backfillDate = extractBackfillDate(note);

  return (
    isDateStampInRange(loggedAtDateStamp, startDateStamp, endDateStamp) ||
    isDateStampInRange(backfillDate, startDateStamp, endDateStamp)
  );
}
