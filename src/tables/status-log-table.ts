import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { StatusLogEntry } from '../types';
import { LogSheetTable } from './log-sheet-table';

export class StatusLogTable extends LogSheetTable<StatusLogEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.STATUS_LOG,
      eventTimeKey: 'occurred_at',
      idPrefix: 'status',
    });
  }
}

export const statusLogTable = new StatusLogTable();
