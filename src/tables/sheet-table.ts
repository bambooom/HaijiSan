import type { SheetRow, SheetSchema } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { mapRowToRecord } from '../shared/record-mapper';
import {
  insertSheetRecord,
  updateSheetRecordAtRow,
} from '../shared/record-write';
import { createTimestampedEntryId } from '../shared/records';

type EntryRow<TRecord> = {
  rowNumber: number;
  entry: TRecord;
  values: SheetRow;
};

type SheetTableOptions = {
  schema: SheetSchema;
  spreadsheet?: SpreadsheetService;
  idPrefix?: string;
};

export class SheetTable<TRecord extends object> {
  constructor(private readonly options: SheetTableOptions) {}

  protected get spreadsheet(): SpreadsheetService {
    return this.options.spreadsheet ?? spreadsheetService;
  }

  protected get schema(): SheetSchema {
    return this.options.schema;
  }

  getRows(): SheetRow[] {
    return this.spreadsheet.getRows(this.schema.name);
  }

  listEntries(): TRecord[] {
    return this.listEntryRows().map(({ entry }) => entry);
  }

  listEntryRows(): EntryRow<TRecord>[] {
    return this.spreadsheet
      .getDataRows(this.schema.name)
      .map(({ rowNumber, values }) => ({
        rowNumber,
        values,
        entry: mapRowToRecord<TRecord>(this.spreadsheet, this.schema, values),
      }));
  }

  findEntryRow(
    predicate: (entry: TRecord) => boolean,
  ): EntryRow<TRecord> | null {
    return this.listEntryRows().find(({ entry }) => predicate(entry)) ?? null;
  }

  insert(record: TRecord): void {
    insertSheetRecord(this.spreadsheet, this.schema, record);
  }

  updateAtRow(rowNumber: number, updates: Partial<TRecord>): void {
    updateSheetRecordAtRow(this.spreadsheet, this.schema, rowNumber, updates);
  }

  createEntryId(timestamp: Date): string {
    if (!this.options.idPrefix) {
      throw new Error(`No idPrefix configured for ${this.schema.name}`);
    }

    return createTimestampedEntryId(
      this.spreadsheet,
      this.options.idPrefix,
      timestamp,
    );
  }
}
