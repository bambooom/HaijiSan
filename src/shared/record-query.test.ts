import { describe, expect, it, vi } from 'vitest';

import {
  listEntriesByDate,
  listEntriesByDateRange,
  listRecentEntries,
} from './record-query';

const formatter = {
  getTimestamp: vi.fn((_: boolean = false, date: Date = new Date()) => {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }),
};

describe('record query helpers', () => {
  it('filters by one day and sorts ascending', () => {
    const entries = [
      { id: '2', logged_at: '2026-04-02 10:00:00', note: '' },
      { id: '1', logged_at: '2026-04-02 08:00:00', note: '' },
      { id: '3', logged_at: '2026-04-03 08:00:00', note: '' },
    ];

    const result = listEntriesByDate({
      entries,
      date: new Date('2026-04-02T12:00:00.000Z'),
      formatter,
      matchesDate: (entry, dateStamp) => entry.logged_at.startsWith(dateStamp),
      sortValue: (entry) => entry.logged_at,
    });

    expect(result.map((entry) => entry.id)).toEqual(['1', '2']);
  });

  it('filters by date range inclusively', () => {
    const entries = [
      { id: '1', date_stamp: '2026-04-01' },
      { id: '2', date_stamp: '2026-04-02' },
      { id: '3', date_stamp: '2026-04-04' },
    ];

    const result = listEntriesByDateRange({
      entries,
      startDate: new Date('2026-04-01T12:00:00.000Z'),
      endDate: new Date('2026-04-03T12:00:00.000Z'),
      formatter,
      matchesDateRange: (entry, startDateStamp, endDateStamp) =>
        entry.date_stamp >= startDateStamp && entry.date_stamp <= endDateStamp,
      sortValue: (entry) => entry.date_stamp,
    });

    expect(result.map((entry) => entry.id)).toEqual(['1', '2']);
  });

  it('lists recent entries with an optional reference cutoff', () => {
    const entries = [
      { id: '1', logged_at: '2026-04-01 08:00:00' },
      { id: '2', logged_at: '2026-04-02 08:00:00' },
      { id: '3', logged_at: '2026-04-03 08:00:00' },
    ];

    const result = listRecentEntries({
      entries,
      limit: 2,
      sortValue: (entry) => entry.logged_at,
      referenceDate: new Date('2026-04-02T12:00:00.000Z'),
      getEntryTime: (entry) => new Date(entry.logged_at).getTime(),
    });

    expect(result.map((entry) => entry.id)).toEqual(['2', '1']);
  });
});
