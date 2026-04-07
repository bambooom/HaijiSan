import sheetLayoutsJson from './sheet-layouts.json';

export const SHEET_LAYOUTS = sheetLayoutsJson;

export const SHEET_NAMES = Object.fromEntries(
  Object.entries(SHEET_LAYOUTS).map(([key, layout]) => [key, layout.name]),
) as Record<keyof typeof SHEET_LAYOUTS, string>;
