import { describe, expect, it } from 'vitest';

import {
  extractBackfillDate,
  isDateStampInRange,
  matchesRecordDate,
  matchesRecordDateRange,
} from './date-reference';

const pad = (value: number) => String(value).padStart(2, '0');

describe('date reference helpers', () => {
  const now = new Date('2026-04-03T10:15:30.000Z');
  const formatted = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-');

  it('stores and reads backfill dates separately from logged_at', () => {
    const note = 'manual entry; backfillDate=2026-04-02';

    expect(extractBackfillDate(note)).toBe('2026-04-02');
    expect(matchesRecordDate(formatted, note, '2026-04-02')).toBe(true);
  });

  it('matches inclusive date ranges for plain date stamps and backfill dates', () => {
    expect(isDateStampInRange('2026-04-02', '2026-04-01', '2026-04-03')).toBe(
      true,
    );
    expect(
      matchesRecordDateRange(
        '2026-04-03 09:00:00',
        'backfillDate=2026-04-01',
        '2026-04-01',
        '2026-04-02',
      ),
    ).toBe(true);
    expect(
      matchesRecordDateRange(
        '2026-04-05 09:00:00',
        '',
        '2026-04-01',
        '2026-04-02',
      ),
    ).toBe(false);
  });
});
