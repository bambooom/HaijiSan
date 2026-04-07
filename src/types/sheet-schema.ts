export type FieldSchemaType =
  | 'string'
  | 'number'
  | 'timestamp'
  | 'enum'
  | 'string-or-number';

export type FieldSchema = {
  key: string;
  type: FieldSchemaType;
  required: boolean;
  enumValues?: readonly string[];
  validator?: string;
};

export type SheetSchema = {
  name: string;
  fields: readonly FieldSchema[];
};
