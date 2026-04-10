import type { InsertDataRequest, UpdateDataRequest } from './tools';
import type { PendingStockDeductionDraft } from './food';

export type PendingConfirmation<TKind extends string, TPayload> = {
  id: string;
  kind: TKind;
  chatId: string;
  traceId: string;
  createdAtIso: string;
  previewMessageId: number | null;
  payload: TPayload;
};

export type NutritionRequest = InsertDataRequest | UpdateDataRequest;

export type EditableNutritionField = 'calories_kcal';

export type PendingOcrPayload = {
  request: NutritionRequest;
  editPromptMessageId: number | null;
  awaitingField: EditableNutritionField | null;
};

export type PendingOcrConfirmation = PendingConfirmation<
  'nutrition_label',
  PendingOcrPayload
>;

export type PendingStockDeductionPayload = PendingStockDeductionDraft & {
  editPromptMessageId: number | null;
  awaitingCandidateIndex: number | null;
};

export type OcrCallbackData =
  | {
      action: 'confirm' | 'cancel' | 'edit' | 'back';
      id: string;
    }
  | {
      action: 'field';
      id: string;
      field: EditableNutritionField;
    };

export type PendingStockDeductionConfirmation = PendingConfirmation<
  'stock_deduction',
  PendingStockDeductionPayload
>;

export type StockCallbackData =
  | {
      action: 'confirm' | 'cancel' | 'edit' | 'back';
      id: string;
    }
  | {
      action: 'item';
      id: string;
      index: number;
    };
