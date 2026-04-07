import type { SheetSchema } from '../types';
import { type SpreadsheetService } from '../services/spreadsheet';
import {
  matchesRecordDate,
  matchesRecordDateRange,
} from '../shared/date-reference';
import {
  listEntriesByDate,
  listEntriesByDateRange,
  listRecentEntries,
} from '../shared/record-query';
import { SheetTable } from './sheet-table';

type DefaultLogDateRecord = {
  logged_at: string;
  note: string;
};

type DefaultLogSortRecord = {
  logged_at: string;
};

type DateMatchPredicate<TRecord> = (
  entry: TRecord,
  dateStamp: string,
) => boolean;
type DateRangeMatchPredicate<TRecord> = (
  entry: TRecord,
  startDateStamp: string,
  endDateStamp: string,
) => boolean;

type LogSheetTableOptions<TRecord extends object> = {
  schema: SheetSchema;
  spreadsheet?: SpreadsheetService;
  matchesDate?: DateMatchPredicate<TRecord>;
  matchesDateRange?: DateRangeMatchPredicate<TRecord>;
  sortValue?: (entry: TRecord) => string;
  isIncluded?: (entry: TRecord) => boolean;
  idPrefix?: string;
};

export class LogSheetTable<TRecord extends object> {
  private readonly baseTable: SheetTable<TRecord>;

  constructor(private readonly options: LogSheetTableOptions<TRecord>) {
    this.baseTable = new SheetTable<TRecord>({
      schema: options.schema,
      spreadsheet: options.spreadsheet,
      idPrefix: options.idPrefix,
    });
  }

  private get spreadsheet(): SpreadsheetService {
    return this.baseTable['spreadsheet'];
  }

  private get matchesDate(): DateMatchPredicate<TRecord> {
    return (
      this.options.matchesDate ??
      ((entry, dateStamp) =>
        matchesRecordDate(
          (entry as DefaultLogDateRecord).logged_at,
          (entry as DefaultLogDateRecord).note,
          dateStamp,
        ))
    );
  }

  private get matchesDateRange(): DateRangeMatchPredicate<TRecord> {
    return (
      this.options.matchesDateRange ??
      ((entry, startDateStamp, endDateStamp) =>
        matchesRecordDateRange(
          (entry as DefaultLogDateRecord).logged_at,
          (entry as DefaultLogDateRecord).note,
          startDateStamp,
          endDateStamp,
        ))
    );
  }

  private get sortValue(): (entry: TRecord) => string {
    return (
      this.options.sortValue ??
      ((entry) => (entry as DefaultLogSortRecord).logged_at)
    );
  }

  private get isIncluded(): (entry: TRecord) => boolean {
    return (
      this.options.isIncluded ??
      ((entry) => {
        const primaryKey = this.options.schema.fields[0]?.key;

        if (!primaryKey) {
          return true;
        }

        const value = (entry as Record<string, unknown>)[primaryKey];
        return typeof value === 'string'
          ? value.trim() !== ''
          : value !== null && value !== undefined;
      })
    );
  }

  listEntries(): TRecord[] {
    return this.baseTable.listEntries();
  }

  listByDate(date: Date): TRecord[] {
    return listEntriesByDate({
      entries: this.listEntries(),
      date,
      formatter: this.spreadsheet,
      matchesDate: this.matchesDate,
      sortValue: this.sortValue,
      isIncluded: this.isIncluded,
    });
  }

  listByDateRange(startDate: Date, endDate: Date): TRecord[] {
    return listEntriesByDateRange({
      entries: this.listEntries(),
      startDate,
      endDate,
      formatter: this.spreadsheet,
      matchesDateRange: this.matchesDateRange,
      sortValue: this.sortValue,
      isIncluded: this.isIncluded,
    });
  }

  listRecent(limit: number, referenceDate?: Date): TRecord[] {
    return listRecentEntries({
      entries: this.listEntries(),
      limit,
      sortValue: this.sortValue,
      isIncluded: this.isIncluded,
      referenceDate,
      getEntryTime: referenceDate
        ? (entry) => new Date(this.sortValue(entry)).getTime()
        : undefined,
    });
  }

  insert(record: TRecord): void {
    this.baseTable.insert(record);
  }

  updateAtRow(rowNumber: number, updates: Partial<TRecord>): void {
    this.baseTable.updateAtRow(rowNumber, updates);
  }

  createEntryId(timestamp: Date): string {
    return this.baseTable.createEntryId(timestamp);
  }
}
