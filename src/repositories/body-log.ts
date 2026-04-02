import { SHEET_LAYOUTS } from '../constants/sheets';
import type { BodyLogEntry, HealthDataSource } from '../types';
import type { SheetRow } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import {
  createTimestampedEntryId,
  formatLoggedAt,
  formatSheetCellAsString,
} from '../shared/records';

export class BodyLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.BODY_LOG;

  private mapRow(row: SheetRow): BodyLogEntry {
    return {
      body_log_id: formatSheetCellAsString(this.spreadsheet, row[0]),
      logged_at: formatSheetCellAsString(this.spreadsheet, row[1]),
      weight_kg: row[2] === '' ? null : Number(row[2]),
      bmi: row[3] === '' ? null : Number(row[3]),
      body_fat_pct: row[4] === '' ? null : Number(row[4]),
      lean_body_mass_kg: row[5] === '' ? null : Number(row[5]),
      source: row[6] as BodyLogEntry['source'],
      note: formatSheetCellAsString(this.spreadsheet, row[7]),
    };
  }

  createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'body', timestamp);
  }

  append(entry: BodyLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  listByDate(date: Date): BodyLogEntry[] {
    const datePrefix = this.spreadsheet.getTimestamp(false, date).slice(0, 10);

    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter(
        (entry) =>
          entry.body_log_id.trim() !== '' &&
          entry.logged_at.startsWith(datePrefix),
      )
      .sort((left, right) => left.logged_at.localeCompare(right.logged_at));
  }

  listRecent(limit: number = 7): BodyLogEntry[] {
    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter((entry) => entry.body_log_id.trim() !== '')
      .sort((left, right) => right.logged_at.localeCompare(left.logged_at))
      .slice(0, limit);
  }

  logMetrics(
    timestamp: Date,
    metrics: {
      weightKg?: number | null;
      bmi?: number | null;
      bodyFatPct?: number | null;
      leanBodyMassKg?: number | null;
      source?: HealthDataSource;
      note?: string;
    },
  ): BodyLogEntry {
    const entry: BodyLogEntry = {
      body_log_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      weight_kg: metrics.weightKg ?? null,
      bmi: metrics.bmi ?? null,
      body_fat_pct: metrics.bodyFatPct ?? null,
      lean_body_mass_kg: metrics.leanBodyMassKg ?? null,
      source: metrics.source ?? 'manual',
      note: metrics.note ?? '',
    };

    this.append(entry);

    return entry;
  }

  getLatestWeight(): number | null {
    const rows = this.spreadsheet.getRows(this.layout.name);

    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const value = rows[index]?.[2];

      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  logWeight(timestamp: Date, weight: string): void {
    this.logMetrics(timestamp, {
      weightKg: Number(weight),
      source: 'manual',
      note: '',
    });
  }
}

export const bodyLogRepository = new BodyLogRepository();
