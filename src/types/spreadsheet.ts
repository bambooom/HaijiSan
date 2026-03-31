export type SheetCellValue = string | number | boolean | Date | null;

export type SheetRow = SheetCellValue[];

export type SheetDataRow = {
  rowNumber: number;
  values: SheetRow;
};

export type SheetRecord<TField extends string = string> = Partial<
  Record<TField, SheetCellValue | undefined>
>;
