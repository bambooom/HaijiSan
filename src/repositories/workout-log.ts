import { SHEET_LAYOUTS } from '../constants/sheets';
import type { WorkoutLevel, WorkoutLogEntry } from '../types';
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
import { matchesRecordDate } from '../shared/date-reference';

export class WorkoutLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.WORKOUT_LOG;

  private mapRow(row: SheetRow): WorkoutLogEntry {
    return {
      workout_id: formatSheetCellAsString(this.spreadsheet, row[0]),
      logged_at: formatSheetCellAsString(this.spreadsheet, row[1]),
      workout_name: formatSheetCellAsString(this.spreadsheet, row[2]),
      workout_video_url: formatSheetCellAsString(this.spreadsheet, row[3]),
      workout_level: row[4] as WorkoutLogEntry['workout_level'],
      duration_min: row[5] === '' ? null : Number(row[5]),
      avg_hr: row[6] === '' ? null : Number(row[6]),
      max_hr: row[7] === '' ? null : Number(row[7]),
      min_hr: row[8] === '' ? null : Number(row[8]),
      calories_kcal: row[9] === '' ? null : Number(row[9]),
      note: formatSheetCellAsString(this.spreadsheet, row[10]),
    };
  }

  append(entry: WorkoutLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  listByDate(date: Date): WorkoutLogEntry[] {
    const datePrefix = this.spreadsheet.getTimestamp(false, date).slice(0, 10);

    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter(
        (entry) =>
          entry.workout_id.trim() !== '' &&
          matchesRecordDate(entry.logged_at, entry.note, datePrefix),
      )
      .sort((left, right) => left.logged_at.localeCompare(right.logged_at));
  }

  createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'workout', timestamp);
  }

  logWorkout(
    timestamp: Date,
    workoutName: string,
    durationMin: number,
    workoutLevel: WorkoutLevel,
    note = '',
    workoutVideoUrl = '',
  ): void {
    this.append({
      workout_id: this.createEntryId(timestamp),
      logged_at: formatLoggedAt(this.spreadsheet, timestamp),
      workout_name: workoutName,
      workout_video_url: workoutVideoUrl,
      workout_level: workoutLevel,
      duration_min: durationMin,
      avg_hr: null,
      max_hr: null,
      min_hr: null,
      calories_kcal: null,
      note,
    });
  }

  listRecent(limit: number = 5): WorkoutLogEntry[] {
    return this.spreadsheet
      .getDataRows(this.layout.name)
      .map(({ values }) => this.mapRow(values))
      .filter((entry) => entry.workout_id.trim() !== '')
      .sort((left, right) => right.logged_at.localeCompare(left.logged_at))
      .slice(0, limit);
  }
}

export const workoutLogRepository = new WorkoutLogRepository();
