import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { SleepLogEntry } from '../types';
import {
  extractBackfillDate,
  isDateStampInRange,
} from '../shared/date-reference';
import { LogSheetTable } from './log-sheet-table';

export class SleepLogTable extends LogSheetTable<SleepLogEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.SLEEP_LOG,
      matchesDate: (entry, dateStamp) =>
        entry.sleep_end_at.startsWith(dateStamp) ||
        entry.logged_at.startsWith(dateStamp) ||
        extractBackfillDate(entry.note) === dateStamp,
      matchesDateRange: (entry, startDateStamp, endDateStamp) =>
        isDateStampInRange(
          entry.sleep_end_at.slice(0, 10),
          startDateStamp,
          endDateStamp,
        ) ||
        isDateStampInRange(
          entry.logged_at.slice(0, 10),
          startDateStamp,
          endDateStamp,
        ) ||
        isDateStampInRange(
          extractBackfillDate(entry.note),
          startDateStamp,
          endDateStamp,
        ),
      idPrefix: 'sleep',
    });
  }
}

export const sleepLogTable = new SleepLogTable();
