import { SHEET_LAYOUTS } from '../constants/sheets';
import type { BodyLogEntry, HealthDataSource } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

export class BodyLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.BODY_LOG;

  createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'body', timestamp);
  }

  append(entry: BodyLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
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
      const value = rows[index]?.[1];

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
