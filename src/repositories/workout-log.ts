import { SHEET_LAYOUTS } from '../constants/sheets';
import type { WorkoutLevel, WorkoutLogEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

export class WorkoutLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.WORKOUT_LOG;

  append(entry: WorkoutLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
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
      .map(({ values }) => ({
        workout_id: String(values[0] ?? ''),
        logged_at: String(values[1] ?? ''),
        workout_name: String(values[2] ?? ''),
        workout_video_url: String(values[3] ?? ''),
        workout_level: values[4] as WorkoutLogEntry['workout_level'],
        duration_min: values[5] === '' ? null : Number(values[5]),
        avg_hr: values[6] === '' ? null : Number(values[6]),
        max_hr: values[7] === '' ? null : Number(values[7]),
        min_hr: values[8] === '' ? null : Number(values[8]),
        calories_kcal: values[9] === '' ? null : Number(values[9]),
        note: String(values[10] ?? ''),
      }))
      .filter((entry) => entry.workout_id.trim() !== '')
      .sort((left, right) => right.logged_at.localeCompare(left.logged_at))
      .slice(0, limit);
  }
}

export const workoutLogRepository = new WorkoutLogRepository();
