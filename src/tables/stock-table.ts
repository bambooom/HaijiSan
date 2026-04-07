import type { StockAdjustResult, StockEntry, StockListItem } from '../types';
import { SHEET_SCHEMAS } from '../constants/sheet-schema';
import { formatLoggedAt } from '../shared/records';
import { SheetTable } from './sheet-table';

const DEFAULT_STOCK_UNIT = '个/份';

export class StockTable extends SheetTable<StockEntry> {
  constructor() {
    super({
      schema: SHEET_SCHEMAS.STOCK,
      idPrefix: 'stock',
    });
  }

  private resolveUnit(
    unit?: string,
    fallbackUnit: string = DEFAULT_STOCK_UNIT,
  ): string {
    const normalizedUnit = unit?.trim();

    return normalizedUnit || fallbackUnit;
  }

  listStock(): StockListItem[] {
    return this.listEntries()
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

    const matchedRow = this.findEntryRow(
      (entry) => entry.item_name.trim().toLowerCase() === normalizedName,
    );

    return matchedRow?.entry ?? null;
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

    const matchedRow = this.findEntryRow(
      (entry) => entry.item_name.trim().toLowerCase() === normalizedName,
    );

    if (!matchedRow) {
      return false;
    }

    const updates: Partial<StockEntry> = {
      quantity,
      updated_at: formatLoggedAt(this['spreadsheet'], timestamp),
    };

    if (unit !== undefined) {
      updates.unit = this.resolveUnit(unit, matchedRow.entry.unit);
    }

    if (purchaseChannel !== undefined) {
      updates.purchase_channel = purchaseChannel.trim();
    }

    if (note !== undefined) {
      updates.note = note;
    }

    this.updateAtRow(matchedRow.rowNumber, updates);

    return true;
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
      const formattedTimestamp = formatLoggedAt(this['spreadsheet'], timestamp);
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

      this.insert(entry);

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
        updated_at: formatLoggedAt(this['spreadsheet'], timestamp),
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
        updated_at: formatLoggedAt(this['spreadsheet'], timestamp),
        purchase_channel:
          purchaseChannel?.trim() || existingEntry.purchase_channel,
        note,
      },
      quantity: nextQuantity,
      operation: 'adjust',
    };
  }
}

export const stockTable = new StockTable();
