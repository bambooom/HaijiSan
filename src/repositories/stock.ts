import { SHEET_LAYOUTS } from '../config';
import type {
  SheetRow,
  StockAdjustResult,
  StockEntry,
  StockListItem,
} from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';
import { createTimestampedEntryId, formatLoggedAt } from '../shared/records';

const DEFAULT_STOCK_UNIT = '个/份';

export class StockRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.STOCK;

  private readonly fields = this.layout.fields;

  private resolveUnit(
    unit?: string,
    fallbackUnit: string = DEFAULT_STOCK_UNIT,
  ): string {
    const normalizedUnit = unit?.trim();

    return normalizedUnit || fallbackUnit;
  }

  private mapRow(row: SheetRow): StockEntry {
    return {
      stock_item_id: String(row[0] ?? ''),
      item_name: String(row[1] ?? ''),
      quantity: row[2] === '' ? null : Number(row[2]),
      unit: String(row[3] ?? ''),
      purchased_at: String(row[4] ?? ''),
      updated_at: String(row[5] ?? ''),
      purchase_channel: String(row[6] ?? ''),
      linked_food_ref_id: String(row[7] ?? ''),
      note: String(row[8] ?? ''),
    };
  }

  private createEntryId(timestamp: Date): string {
    return createTimestampedEntryId(this.spreadsheet, 'stock', timestamp);
  }

  append(entry: StockEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.fields, entry);
  }

  setStock(
    timestamp: Date,
    name: string,
    quantity: number,
    unit?: string,
    purchaseChannel?: string,
    note = '',
  ): StockAdjustResult {
    const normalizedName = name.trim();

    if (!normalizedName) {
      return { ok: false, reason: 'invalid-name' };
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      return { ok: false, reason: 'invalid-quantity', quantity };
    }

    const existingEntry = this.findByName(normalizedName);

    if (!existingEntry) {
      const formattedTimestamp = formatLoggedAt(this.spreadsheet, timestamp);
      const entry: StockEntry = {
        stock_item_id: this.createEntryId(timestamp),
        item_name: normalizedName,
        quantity,
        unit: this.resolveUnit(unit),
        purchased_at: formattedTimestamp,
        updated_at: formattedTimestamp,
        purchase_channel: purchaseChannel?.trim() ?? '',
        linked_food_ref_id: '',
        note,
      };

      this.append(entry);

      return {
        ok: true,
        entry,
        quantity,
        operation: 'create',
      };
    }

    this.updateQuantity(
      normalizedName,
      quantity,
      timestamp,
      unit,
      purchaseChannel,
      note,
    );

    return {
      ok: true,
      entry: {
        ...existingEntry,
        item_name: normalizedName,
        quantity,
        unit: this.resolveUnit(unit, existingEntry.unit),
        updated_at: formatLoggedAt(this.spreadsheet, timestamp),
        purchase_channel:
          purchaseChannel?.trim() || existingEntry.purchase_channel,
        note,
      },
      quantity,
      operation: 'set',
    };
  }

  adjustStock(
    timestamp: Date,
    name: string,
    delta: number,
    unit?: string,
    purchaseChannel?: string,
    note = '',
  ): StockAdjustResult {
    const normalizedName = name.trim();

    if (!normalizedName) {
      return { ok: false, reason: 'invalid-name' };
    }

    if (!Number.isFinite(delta) || delta === 0) {
      return { ok: false, reason: 'invalid-quantity', quantity: delta };
    }

    const existingEntry = this.findByName(normalizedName);

    if (!existingEntry) {
      if (delta < 0) {
        return { ok: false, reason: 'not-found' };
      }

      return this.setStock(
        timestamp,
        normalizedName,
        delta,
        unit,
        purchaseChannel,
        note,
      );
    }

    const currentQuantity = existingEntry.quantity ?? 0;
    const nextQuantity = currentQuantity + delta;

    if (nextQuantity < 0) {
      return {
        ok: false,
        reason: 'negative-stock',
        quantity: nextQuantity,
        currentQuantity,
      };
    }

    this.updateQuantity(
      normalizedName,
      nextQuantity,
      timestamp,
      unit,
      purchaseChannel,
      note,
    );

    return {
      ok: true,
      entry: {
        ...existingEntry,
        item_name: normalizedName,
        quantity: nextQuantity,
        unit: this.resolveUnit(unit, existingEntry.unit),
        updated_at: formatLoggedAt(this.spreadsheet, timestamp),
        purchase_channel:
          purchaseChannel?.trim() || existingEntry.purchase_channel,
        note,
      },
      quantity: nextQuantity,
      operation: 'adjust',
    };
  }

  /**
   * Returns the current stock list in a simplified format.
   */
  listStock(): StockListItem[] {
    return this.spreadsheet
      .getRows(this.layout.name)
      .map((row) => this.mapRow(row))
      .map((entry) => ({
        name: entry.item_name,
        amount: `${String(entry.quantity ?? '')}${entry.unit}`.trim(),
      }))
      .filter((item) => item.name !== '');
  }

  findByName(name: string): StockEntry | null {
    const normalizedName = name.trim().toLowerCase();

    if (!normalizedName) {
      return null;
    }

    const matchedRow = this.spreadsheet
      .getDataRows(this.layout.name)
      .find(({ values }) => {
        return (
          String(values[1] ?? '')
            .trim()
            .toLowerCase() === normalizedName
        );
      });

    return matchedRow ? this.mapRow(matchedRow.values) : null;
  }

  updateQuantity(
    name: string,
    quantity: number | null,
    timestamp: Date = new Date(),
    unit?: string,
    purchaseChannel?: string,
    note?: string,
  ): boolean {
    const normalizedName = name.trim().toLowerCase();

    if (!normalizedName) {
      return false;
    }

    const matchedRow = this.spreadsheet
      .getDataRows(this.layout.name)
      .find(({ values }) => {
        return (
          String(values[1] ?? '')
            .trim()
            .toLowerCase() === normalizedName
        );
      });

    if (!matchedRow) {
      return false;
    }

    const updates: Partial<StockEntry> = {
      quantity,
      updated_at: formatLoggedAt(this.spreadsheet, timestamp),
    };

    if (unit !== undefined) {
      updates.unit = this.resolveUnit(unit, String(matchedRow.values[3] ?? ''));
    }

    if (purchaseChannel !== undefined) {
      updates.purchase_channel = purchaseChannel.trim();
    }

    if (note !== undefined) {
      updates.note = note;
    }

    this.spreadsheet.updateRecordAtRow(
      this.layout.name,
      this.fields,
      matchedRow.rowNumber,
      updates,
    );

    return true;
  }
}

export const stockRepository = new StockRepository();
