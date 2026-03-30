import { SHEET_LAYOUTS } from '../config';
import type { StockEntry } from '../types';
import {
  spreadsheetService,
  type SpreadsheetService,
} from '../services/spreadsheet';

export type StockListItem = {
  name: string;
  amount: string;
};

export class StockRepository {
  constructor(
    private readonly spreadsheet: SpreadsheetService = spreadsheetService,
  ) {}

  private readonly layout = SHEET_LAYOUTS.STOCK;

  private createEntryId(timestamp: Date): string {
    return `stock_${this.spreadsheet.getTimestamp(true, timestamp).replace(/[^0-9]/g, '')}`;
  }

  append(entry: StockEntry): void {
    this.spreadsheet.appendRecord(this.layout.name, this.layout.fields, entry);
  }

  /**
   * Appends a stock entry using the current sheet layout.
   */
  addStock(timestamp: Date, name: string, amount: string): void {
    const formattedTimestamp = this.spreadsheet.getTimestamp(false, timestamp);

    this.append({
      stock_item_id: this.createEntryId(timestamp),
      item_name: name,
      quantity: Number.isNaN(Number(amount)) ? null : Number(amount),
      unit: '个/份',
      purchased_at: formattedTimestamp,
      updated_at: formattedTimestamp,
      purchase_channel: '',
      linked_food_ref_id: '',
      note: '',
    });
  }

  /**
   * Returns the current stock list in a simplified format.
   */
  listStock(): StockListItem[] {
    return this.spreadsheet
      .getRows(this.layout.name)
      .map((row) => ({
        name: String(row[1] ?? ''),
        amount: `${String(row[2] ?? '')}${String(row[3] ?? '')}`.trim(),
      }))
      .filter((item) => item.name !== '');
  }
}

export const stockRepository = new StockRepository();
