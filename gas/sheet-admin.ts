/**
 * Manual admin helper intended to be run directly from the GAS editor.
 */

declare const __SHEET_LAYOUTS__: Array<{ name: string; headers: string[] }>;

const SHEET_LAYOUTS = __SHEET_LAYOUTS__;

function getHeaderRow(sheetName: string): string[] {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    return [];
  }

  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((cell) => String(cell ?? ''));
}

function validateSheetHeaders() {
  const reports = SHEET_LAYOUTS.map((layout) => {
    try {
      const actualHeaders = getHeaderRow(layout.name);
      const expectedHeaders = layout.headers;
      const isMatch =
        actualHeaders.length === expectedHeaders.length &&
        actualHeaders.every(
          (header, index) => header === expectedHeaders[index],
        );

      if (isMatch) {
        return `OK ${layout.name}`;
      }

      return [
        `MISMATCH ${layout.name}`,
        `Expected: ${expectedHeaders.join(' | ')}`,
        `Actual: ${actualHeaders.join(' | ')}`,
      ].join('\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `ERROR ${layout.name}: ${message}`;
    }
  });

  const failures = reports.filter(
    (report) => report.startsWith('MISMATCH') || report.startsWith('ERROR'),
  );

  if (failures.length > 0) {
    throw new Error(failures.join('\n\n'));
  }
  Logger.log(reports.join('\n'));
}
