import { SHEET_ID } from '../config';
import type { SheetDataRow, SheetRecord, SheetRow } from '../types';

export class SpreadsheetService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;

  private getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    if (!this.ss) {
      this.ss = SpreadsheetApp.openById(SHEET_ID);
    }

    return this.ss;
  }

  /**
   * Returns a sheet by name and throws if it does not exist.
   */
  private getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);

    if (!sheet) {
      throw new Error(`Sheet ${sheetName} not found`);
    }

    return sheet;
  }

  /**
   * Returns all rows from a sheet, excluding the header row.
   */
  getRows(sheetName: string): SheetRow[] {
    const sheet = this.getSheet(sheetName);

    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    const lastColumn = sheet.getLastColumn();

    return sheet
      .getRange(2, 1, lastRow - 1, lastColumn)
      .getValues() as SheetRow[];
  }

  /**
   * Returns all data rows with the actual sheet row number.
   */
  getDataRows(sheetName: string): SheetDataRow[] {
    return this.getRows(sheetName).map((values, index) => ({
      rowNumber: index + 2,
      values,
    }));
  }

  /**
   * Appends a row to the target sheet.
   */
  appendRow(sheetName: string, rowData: SheetRow): void {
    const sheet = this.getSheet(sheetName);
    sheet.appendRow(rowData);
  }

  /**
   * Appends a row by mapping a field-ordered record to the target sheet.
   */
  appendRecord<TField extends string>(
    sheetName: string,
    fields: readonly TField[],
    record: object,
  ): void {
    const typedRecord = record as SheetRecord<TField>;
    const rowData = fields.map((field) => {
      const value = typedRecord[field];
      return value === undefined ? '' : value;
    });

    this.appendRow(sheetName, rowData);
  }

  /**
   * Updates selected fields on an existing row.
   */
  updateRecordAtRow<TField extends string>(
    sheetName: string,
    fields: readonly TField[],
    rowNumber: number,
    updates: object,
  ): void {
    if (rowNumber <= 1) {
      throw new Error(`Invalid row number ${rowNumber} for ${sheetName}`);
    }

    const sheet = this.getSheet(sheetName);
    const typedUpdates = updates as SheetRecord<TField>;
    const currentRow = sheet
      .getRange(rowNumber, 1, 1, fields.length)
      .getValues()[0] as SheetRow;
    const nextRow = [...currentRow];

    fields.forEach((field, index) => {
      if (!Object.prototype.hasOwnProperty.call(typedUpdates, field)) {
        return;
      }

      const value = typedUpdates[field];
      nextRow[index] = value === undefined ? '' : value;
    });

    sheet.getRange(rowNumber, 1, 1, fields.length).setValues([nextRow]);
  }

  /**
   * Returns the current timestamp in the script timezone.
   */
  getTimestamp(includeMilliseconds = false, date: Date = new Date()): string {
    return Utilities.formatDate(
      date,
      Session.getScriptTimeZone(),
      includeMilliseconds ? 'yyyy-MM-dd HH:mm:ss.SSS' : 'yyyy-MM-dd HH:mm:ss',
    );
  }
}

// Export a singleton for shared sheet access.
export const spreadsheetService = new SpreadsheetService();
