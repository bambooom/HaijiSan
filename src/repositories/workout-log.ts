import { SHEET_LAYOUTS } from '../config';
import type { WorkoutLogEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export class WorkoutLogRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.WORKOUT_LOG;

  append(entry: WorkoutLogEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  createEntryId(timestamp: Date): string {
    return `workout_${this.spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
  }
}

export const workoutLogRepository = new WorkoutLogRepository();
