export type StatusEntryType =
  | 'bowel'
  | 'menstruation'
  | 'symptom'
  | 'medication';

export type WorkoutLevel = 'easy' | 'medium' | 'hard';

export type SleepQuality = 'good' | 'normal' | 'poor';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type ParseStatus = 'pending' | 'parsed' | 'failed' | 'confirmed';

export type HandlingMode = 'command' | 'rule' | 'ai';

export type HandlingStatus = 'success' | 'ignored' | 'failed';

export type BotLogConfirmationState =
  | 'none'
  | 'pending'
  | 'processing'
  | 'confirmed'
  | 'cancelled'
  | 'duplicate'
  | 'failed';

export type CommandResultCode = string;

export type CommandLogFields = {
  traceId: string;
  intent: string;
  tool: string;
  confirmationState: BotLogConfirmationState;
  resultCode: CommandResultCode;
};

export type CommandAuditFields = {
  toolCallCount: number;
  readCount: number;
  insertCount: number;
  updateCount: number;
  readSheetNames: string[];
  writeSheetNames: string[];
  primaryAction: string;
  primaryTargetSheet: string;
  primarySelectorType: string;
  primarySelectorValue: string;
  changedFields: string[];
};

export type ConversationTurn = {
  loggedAt: string;
  userText: string;
  assistantText: string;
};

export type HealthDataSource = 'manual' | 'ios_health' | 'smart_scale';

export type CommandHandlingResult = {
  reply: string;
  handlingMode: HandlingMode;
  status: HandlingStatus;
  note: string;
  audit?: CommandAuditFields;
} & CommandLogFields;

export type ReferenceSource =
  | 'nutrition_label'
  | 'manual_entry'
  | 'internet_reference'
  | 'ai_estimate';
