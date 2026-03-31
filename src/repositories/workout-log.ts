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
}

export const workoutLogRepository = new WorkoutLogRepository();
