import { describe, expect, it } from 'vitest';

import {
  appendBackfillDateNote,
  extractBackfillDate,
  formatDateStamp,
  matchesRecordDate,
  parseTargetDateReference,
  resolveTargetDateTimestamp,
} from './date-reference';

describe('date reference helpers', () => {
  const now = new Date('2026-04-03T10:15:30.000Z');

  it('parses relative Chinese date words', () => {
    expect(parseTargetDateReference('昨天睡眠 02:42-08:20', now)).toBe(
      '2026-04-02',
    );
    expect(parseTargetDateReference('前天体重 55.1kg', now)).toBe('2026-04-01');
  });

  it('parses explicit month-day dates', () => {
    expect(
      parseTargetDateReference('更新4月2号的睡眠 2:42-8:20，一般', now),
    ).toBe('2026-04-02');
    expect(parseTargetDateReference('补记 4/2 晚饭 牛肉粉', now)).toBe(
      '2026-04-02',
    );
  });

  it('resolves a target date while preserving the original clock time', () => {
    const resolved = resolveTargetDateTimestamp(now, '2026-04-02');

    expect(resolved.getFullYear()).toBe(2026);
    expect(resolved.getMonth()).toBe(3);
    expect(resolved.getDate()).toBe(2);
    expect(resolved.getHours()).toBe(now.getHours());
    expect(resolved.getMinutes()).toBe(now.getMinutes());
  });

  it('stores and reads backfill dates separately from logged_at', () => {
    const note = appendBackfillDateNote('manual entry', '2026-04-02', now);

    expect(extractBackfillDate(note)).toBe('2026-04-02');
    expect(matchesRecordDate(formatDateStamp(now), note, '2026-04-02')).toBe(
      true,
    );
  });
});
