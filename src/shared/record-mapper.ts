import { formatSheetCellAsString } from './records';
import type {
  FieldSchema,
  SheetCellValue,
  SheetRow,
  SheetSchema,
} from '../types';

type TimestampFormatter = {
  getTimestamp: (includeMilliseconds?: boolean, date?: Date) => string;
};

const SHEET_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const SHEET_TIMESTAMP_WITH_MILLISECONDS_PATTERN =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;

function isEmptyCellValue(value: SheetCellValue | undefined): boolean {
  return value === '' || value === null || value === undefined;
}

function isMissingRecordValue(value: unknown): boolean {
  return value === '' || value === null || value === undefined;
}

function getTimestampValidationPattern(field: FieldSchema): RegExp {
  if (field.validator === 'timestamp-with-milliseconds') {
    return SHEET_TIMESTAMP_WITH_MILLISECONDS_PATTERN;
  }

  return SHEET_TIMESTAMP_PATTERN;
}

function getTimestampValidationMessage(field: FieldSchema): string {
  if (field.validator === 'timestamp-with-milliseconds') {
    return `Field ${field.key} must use timestamp format yyyy-MM-dd HH:mm:ss.SSS`;
  }

  return `Field ${field.key} must use timestamp format yyyy-MM-dd HH:mm:ss`;
}

function coerceRowValue(
  spreadsheet: TimestampFormatter,
  field: FieldSchema,
  value: SheetCellValue | undefined,
): unknown {
  if (isEmptyCellValue(value)) {
    switch (field.type) {
      case 'number':
        return null;
      case 'string':
      case 'timestamp':
      case 'enum':
      case 'string-or-number':
        return '';
      default:
        return field.required ? '' : null;
    }
  }

  switch (field.type) {
    case 'string':
    case 'timestamp':
      return formatSheetCellAsString(spreadsheet, value ?? null);
    case 'number':
      return Number(value);
    case 'enum':
      return formatSheetCellAsString(spreadsheet, value ?? null);
    case 'string-or-number':
      return typeof value === 'number'
        ? value
        : formatSheetCellAsString(spreadsheet, value ?? null);
    default:
      return value;
  }
}

function serializeRecordValue(
  spreadsheet: TimestampFormatter,
  field: FieldSchema,
  value: unknown,
): SheetCellValue {
  if (value === null || value === undefined) {
    return '';
  }

  if (field.type === 'timestamp' && value instanceof Date) {
    return spreadsheet.getTimestamp(false, value);
  }

  return value as SheetCellValue;
}

export function mapRowToRecord<TRecord extends object>(
  spreadsheet: TimestampFormatter,
  schema: SheetSchema,
  row: SheetRow,
): TRecord {
  return Object.fromEntries(
    schema.fields.map((field, index) => [
      field.key,
      coerceRowValue(spreadsheet, field, row[index]),
    ]),
  ) as TRecord;
}

export function serializeRecordToRow(
  spreadsheet: TimestampFormatter,
  schema: SheetSchema,
  record: object,
): SheetRow {
  const typedRecord = record as Record<string, unknown>;

  return schema.fields.map((field) =>
    serializeRecordValue(spreadsheet, field, typedRecord[field.key]),
  );
}

export function serializePartialRecord(
  spreadsheet: TimestampFormatter,
  schema: SheetSchema,
  record: object,
): Record<string, SheetCellValue> {
  const typedRecord = record as Record<string, unknown>;

  return Object.fromEntries(
    schema.fields
      .filter((field) =>
        Object.prototype.hasOwnProperty.call(typedRecord, field.key),
      )
      .map((field) => [
        field.key,
        serializeRecordValue(spreadsheet, field, typedRecord[field.key]),
      ]),
  );
}

export function validateRecordAgainstSchema(
  schema: SheetSchema,
  record: object,
  options: { partial?: boolean } = {},
): string[] {
  const { partial = false } = options;
  const typedRecord = record as Record<string, unknown>;
  const fieldMap = new Map(schema.fields.map((field) => [field.key, field]));
  const errors: string[] = [];

  for (const key of Object.keys(typedRecord)) {
    if (!fieldMap.has(key)) {
      errors.push(`Unknown field: ${key}`);
    }
  }

  for (const field of schema.fields) {
    const hasKey = Object.prototype.hasOwnProperty.call(typedRecord, field.key);
    const value = typedRecord[field.key];

    if (!hasKey) {
      if (!partial && field.required) {
        errors.push(`Missing required field: ${field.key}`);
      }

      continue;
    }

    if (isMissingRecordValue(value)) {
      if (field.required) {
        errors.push(`Required field is empty: ${field.key}`);
      }

      continue;
    }

    switch (field.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`Field ${field.key} must be a string`);
        }

        break;
      case 'timestamp':
        if (
          typeof value !== 'string' &&
          !(field.type === 'timestamp' && value instanceof Date)
        ) {
          errors.push(`Field ${field.key} must be a string`);
          break;
        }

        if (
          typeof value === 'string' &&
          !getTimestampValidationPattern(field).test(value)
        ) {
          errors.push(getTimestampValidationMessage(field));
        }

        break;
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`Field ${field.key} must be a finite number`);
        }

        break;
      }
      case 'enum': {
        if (typeof value !== 'string') {
          errors.push(`Field ${field.key} must be a string enum`);
          break;
        }

        if (field.enumValues && !field.enumValues.includes(value)) {
          errors.push(
            `Field ${field.key} must be one of: ${field.enumValues.join(', ')}`,
          );
        }

        break;
      }
      case 'string-or-number':
        if (typeof value !== 'string' && typeof value !== 'number') {
          errors.push(`Field ${field.key} must be a string or number`);
        }

        break;
    }
  }

  return errors;
}
