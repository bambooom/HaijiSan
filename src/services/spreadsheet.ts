import { SHEET_ID } from '../config';

export type SheetCellValue = string | number | boolean | Date | null;
export type SheetRow = SheetCellValue[];
export type SheetRecord<TField extends string = string> = Partial<
  Record<TField, SheetCellValue | undefined>
>;

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
    record: SheetRecord<TField>,
  ): void {
    const rowData = fields.map((field) => {
      const value = record[field];
      return value === undefined ? '' : value;
    });

    this.appendRow(sheetName, rowData);
  }

  /**
   * Returns the current header row for a sheet.
   */
  getHeaderRow(sheetName: string): string[] {
    const sheet = this.getSheet(sheetName);
    const lastColumn = sheet.getLastColumn();

    if (lastColumn === 0) {
      return [];
    }

    return sheet
      .getRange(1, 1, 1, lastColumn)
      .getValues()[0]
      .map((cell) => String(cell ?? ''));
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
