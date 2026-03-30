/**
 * Styling helper intended to be run manually from the GAS editor.
 */

const PALETTE_SHEET_NAME = 'Palette';
const PALETTE_RANGE = 'B2:D10';

function applyHexColors() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PALETTE_SHEET_NAME);
  if (!sheet) return;

  const range = sheet.getRange(PALETTE_RANGE);
  const values = range.getValues();
  const backgrounds = range.getBackgrounds();

  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values[i].length; j++) {
      const hex = String(values[i][j]).trim();
      if (isValidHex(hex)) {
        backgrounds[i][j] = hex;
      }
    }
  }

  // Apply backgrounds in a single batch for better performance.
  range.setBackgrounds(backgrounds);
}

/**
 * Applies header and tab colors to all sheets using the palette sheet.
 */
function initializeAllSheetStyles() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const configSheet = ss.getSheetByName(PALETTE_SHEET_NAME);
  if (!configSheet) {
    Logger.log('Palette sheet not found.');
    return;
  }

  // Expected columns: A = sheet name, B = tab color, C = header background, D = header text.
  const lastRow = configSheet.getLastRow();
  const configData = configSheet.getRange(2, 1, lastRow - 1, 4).getValues();

  configData.forEach((row) => {
    const sheetName = String(row[0]).trim();
    const tabColor = String(row[1]).trim();
    const headerBg = String(row[2]).trim();
    const headerText = String(row[3]).trim();

    const targetSheet = ss.getSheetByName(sheetName);

    if (targetSheet) {
      Logger.log(`Styling sheet: ${sheetName}`);

      if (isValidHex(tabColor)) {
        targetSheet.setTabColor(tabColor);
      }

      const headerRange = targetSheet.getRange(
        1,
        1,
        1,
        targetSheet.getLastColumn(),
      );

      if (isValidHex(headerBg)) {
        headerRange.setBackground(headerBg);
      }
      if (isValidHex(headerText)) {
        headerRange.setFontColor(headerText);
      }

      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');

      targetSheet.setFrozenRows(1);
    } else {
      Logger.log(`Target sheet not found: ${sheetName}`);
    }
  });

  SpreadsheetApp.getUi().alert(
    'Styling complete. All sheet headers and tabs have been updated.',
  );
}

/**
 * Simple HEX color validation.
 */
function isValidHex(hex: string) {
  return /^#([0-9A-F]{3}){1,2}$/i.test(hex);
}
