type TimestampFormatter = {
  getTimestamp: (includeMilliseconds?: boolean, date?: Date) => string;
};

type SortDirection = 'asc' | 'desc';

function compareValues(
  left: string,
  right: string,
  direction: SortDirection,
): number {
  return direction === 'asc'
    ? left.localeCompare(right)
    : right.localeCompare(left);
}

function buildDateStamp(formatter: TimestampFormatter, date: Date): string {
  return formatter.getTimestamp(false, date).slice(0, 10);
}

export function listEntriesByDate<TEntry>(input: {
  entries: TEntry[];
  date: Date;
  formatter: TimestampFormatter;
  matchesDate: (entry: TEntry, dateStamp: string) => boolean;
  sortValue: (entry: TEntry) => string;
  sortDirection?: SortDirection;
  isIncluded?: (entry: TEntry) => boolean;
}): TEntry[] {
  const {
    entries,
    date,
    formatter,
    matchesDate,
    sortValue,
    sortDirection = 'asc',
    isIncluded = () => true,
  } = input;
  const dateStamp = buildDateStamp(formatter, date);

  return entries
    .filter(isIncluded)
    .filter((entry) => matchesDate(entry, dateStamp))
    .sort((left, right) =>
      compareValues(sortValue(left), sortValue(right), sortDirection),
    );
}

export function listEntriesByDateRange<TEntry>(input: {
  entries: TEntry[];
  startDate: Date;
  endDate: Date;
  formatter: TimestampFormatter;
  matchesDateRange: (
    entry: TEntry,
    startDateStamp: string,
    endDateStamp: string,
  ) => boolean;
  sortValue: (entry: TEntry) => string;
  sortDirection?: SortDirection;
  isIncluded?: (entry: TEntry) => boolean;
}): TEntry[] {
  const {
    entries,
    startDate,
    endDate,
    formatter,
    matchesDateRange,
    sortValue,
    sortDirection = 'asc',
    isIncluded = () => true,
  } = input;
  const startDateStamp = buildDateStamp(formatter, startDate);
  const endDateStamp = buildDateStamp(formatter, endDate);

  return entries
    .filter(isIncluded)
    .filter((entry) => matchesDateRange(entry, startDateStamp, endDateStamp))
    .sort((left, right) =>
      compareValues(sortValue(left), sortValue(right), sortDirection),
    );
}

export function listRecentEntries<TEntry>(input: {
  entries: TEntry[];
  limit: number;
  sortValue: (entry: TEntry) => string;
  isIncluded?: (entry: TEntry) => boolean;
  referenceDate?: Date;
  getEntryTime?: (entry: TEntry) => number;
}): TEntry[] {
  const {
    entries,
    limit,
    sortValue,
    isIncluded = () => true,
    referenceDate,
    getEntryTime,
  } = input;

  return entries
    .filter(isIncluded)
    .filter((entry) => {
      if (!referenceDate || !getEntryTime) {
        return true;
      }

      return getEntryTime(entry) <= referenceDate.getTime();
    })
    .sort((left, right) =>
      compareValues(sortValue(left), sortValue(right), 'desc'),
    )
    .slice(0, limit);
}
