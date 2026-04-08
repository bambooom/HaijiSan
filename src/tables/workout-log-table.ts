import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { WorkoutLogEntry } from '../types';
import { LogSheetTable } from './log-sheet-table';

export class WorkoutLogTable extends LogSheetTable<WorkoutLogEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.WORKOUT_LOG,
      eventTimeKey: 'occurred_at',
      idPrefix: 'workout',
    });
  }
}

export const workoutLogTable = new WorkoutLogTable();
