import type { SheetSchema } from '../types';
import type { SpreadsheetService } from '../services/spreadsheet';
import {
  serializePartialRecord,
  serializeRecordToRow,
  validateRecordAgainstSchema,
} from './record-mapper';

function assertValidRecord(
  errors: string[],
  action: string,
  sheetName: string,
): void {
  if (errors.length === 0) {
    return;
  }

  throw new Error(`Cannot ${action} ${sheetName}: ${errors.join('; ')}`);
}

export function insertSheetRecord(
  spreadsheet: SpreadsheetService,
  schema: SheetSchema,
  record: object,
): void {
  const errors = validateRecordAgainstSchema(schema, record);

  assertValidRecord(errors, 'insert into', schema.name);

  spreadsheet.appendRow(
    schema.name,
    serializeRecordToRow(spreadsheet, schema, record),
  );
}

export function updateSheetRecordAtRow(
  spreadsheet: SpreadsheetService,
  schema: SheetSchema,
  rowNumber: number,
  updates: object,
): void {
  const errors = validateRecordAgainstSchema(schema, updates, {
    partial: true,
  });

  assertValidRecord(errors, 'update', schema.name);

  spreadsheet.updateRecordAtRow(
    schema.name,
    schema.fields.map((field) => field.key),
    rowNumber,
    serializePartialRecord(spreadsheet, schema, updates),
  );
}
