import { AI_INTENTS } from '../constants/ai';

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

export type HealthDataSource = 'manual' | 'ios_health' | 'smart_scale';

export type CommandHandlingResult = {
  reply: string;
  handlingMode: HandlingMode;
  status: HandlingStatus;
  note: string;
};

export type AiResponseMode = 'reply' | 'command' | 'clarify';

export type AiIntent = (typeof AI_INTENTS)[keyof typeof AI_INTENTS];

export type ReferenceSource =
  | 'nutrition_label'
  | 'manual_entry'
  | 'internet_reference'
  | 'ai_estimate';

export interface AiStockItem {
  name: string;
  quantity: number;
  unit?: string;
  purchaseChannel?: string;
}

export interface AiPlan {
  mode: AiResponseMode;
  intent: AiIntent;
  reply: string;
  confidence?: number | null;
  weightKg?: number | null;
  bmi?: number | null;
  bodyFatPct?: number | null;
  leanBodyMassKg?: number | null;
  cycleDay?: number | null;
  symptom?: string;
  periodNote?: string;
  sleepStart?: string;
  sleepEnd?: string;
  sleepQuality?: SleepQuality;
  workoutName?: string;
  durationMin?: number | null;
  workoutLevel?: WorkoutLevel;
  mealType?: MealType;
  mealText?: string;
  stockQuery?: string;
  stockItemName?: string;
  stockQuantity?: number | null;
  stockUnit?: string;
  stockItems?: AiStockItem[];
  purchaseChannel?: string;
  note?: string;
}
