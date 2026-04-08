import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import type { BodyLogEntry } from '../types';
import { LogSheetTable } from './log-sheet-table';

export class BodyLogTable extends LogSheetTable<BodyLogEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.BODY_LOG,
      eventTimeKey: 'occurred_at',
      idPrefix: 'body',
    });
  }
}

export const bodyLogTable = new BodyLogTable();
