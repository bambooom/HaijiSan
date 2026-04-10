import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import {
  bodyLogTable,
  botLogTable,
  foodLogTable,
  refCaloriesTable,
  sleepLogTable,
  statusLogTable,
  stockTable,
  workoutLogTable,
} from '../tables';
import {
  extractBackfillDate,
  isDateStampInRange,
} from '../shared/date-reference';
import type { ToolRecord, ToolRegistryEntry, ToolSheetKey } from '../types';

export function getStringRecordValue(record: ToolRecord, key: string): string {
  const value = record[key];

  return typeof value === 'string' ? value : '';
}

export const TOOL_REGISTRY: Record<ToolSheetKey, ToolRegistryEntry> = {
  STATUS_LOG: {
    schema: SHEET_SCHEMAS.STATUS_LOG,
    table: statusLogTable,
    eventTimeKey: 'occurred_at',
  },
  BODY_LOG: {
    schema: SHEET_SCHEMAS.BODY_LOG,
    table: bodyLogTable,
    eventTimeKey: 'occurred_at',
  },
  SLEEP_LOG: {
    schema: SHEET_SCHEMAS.SLEEP_LOG,
    table: sleepLogTable,
    matchesDate: (record, dateStamp) =>
      getStringRecordValue(record, 'sleep_end_at').startsWith(dateStamp) ||
      getStringRecordValue(record, 'logged_at').startsWith(dateStamp) ||
      extractBackfillDate(getStringRecordValue(record, 'note')) === dateStamp,
    matchesDateRange: (record, startDateStamp, endDateStamp) =>
      isDateStampInRange(
        getStringRecordValue(record, 'sleep_end_at').slice(0, 10),
        startDateStamp,
        endDateStamp,
      ) ||
      isDateStampInRange(
        getStringRecordValue(record, 'logged_at').slice(0, 10),
        startDateStamp,
        endDateStamp,
      ) ||
      isDateStampInRange(
        extractBackfillDate(getStringRecordValue(record, 'note')),
        startDateStamp,
        endDateStamp,
      ),
  },
  WORKOUT_LOG: {
    schema: SHEET_SCHEMAS.WORKOUT_LOG,
    table: workoutLogTable,
    eventTimeKey: 'occurred_at',
  },
  FOOD_LOG: {
    schema: SHEET_SCHEMAS.FOOD_LOG,
    table: foodLogTable,
    eventTimeKey: 'occurred_at',
  },
  STOCK: {
    schema: SHEET_SCHEMAS.STOCK,
    table: stockTable,
  },
  REF_CALORIES: {
    schema: SHEET_SCHEMAS.REF_CALORIES,
    table: refCaloriesTable,
  },
  BOT_LOG: {
    schema: SHEET_SCHEMAS.BOT_LOG,
    table: botLogTable,
  },
};
