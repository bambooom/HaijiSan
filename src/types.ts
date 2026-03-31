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

export type AiIntent =
  | 'chat'
  | 'weight'
  | 'poo'
  | 'period'
  | 'symptom'
  | 'sleep'
  | 'workout'
  | 'food'
  | 'food_estimate'
  | 'stock_adjust'
  | 'stock_set'
  | 'stock_check';

export interface AiPlan {
  mode: AiResponseMode;
  intent: AiIntent;
  reply: string;
  weightKg?: number | null;
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
  stockItemName?: string;
  stockQuantity?: number | null;
  stockUnit?: string;
  purchaseChannel?: string;
  note?: string;
}

export type IngredientEstimateConfidence = 'low' | 'medium' | 'high';

export interface IngredientEstimateInput {
  itemName: string;
  quantity: number;
  unit: string;
}

export interface IngredientEstimateResult extends IngredientEstimateInput {
  estimatedCalories: number | null;
  confidence: IngredientEstimateConfidence;
  note: string;
}

export interface MealStructureResult {
  mealType: MealType;
  mealText: string;
  shouldPersist: boolean;
  items: IngredientEstimateInput[];
  note: string;
}

export type MealResolvedItemSource = 'reference' | 'ai';

export interface MealResolvedItem extends IngredientEstimateInput {
  estimatedCalories: number | null;
  source: MealResolvedItemSource;
  note: string;
}

export interface MealResolutionResult {
  mealType: MealType;
  mealText: string;
  shouldPersist: boolean;
  estimatedCalories: number | null;
  items: MealResolvedItem[];
  note: string;
}

export type ReferenceSource =
  | 'nutrition_label'
  | 'manual_entry'
  | 'internet_reference'
  | 'ai_estimate';

export interface StatusLogEntry {
  entry_id: string;
  logged_at: string;
  entry_type: StatusEntryType;
  value: string | number;
  unit: string;
  note: string;
  cycle_day: number | null;
}

export interface BodyLogEntry {
  body_log_id: string;
  logged_at: string;
  weight_kg: number | null;
  bmi: number | null;
  body_fat_pct: number | null;
  lean_body_mass_kg: number | null;
  source: HealthDataSource;
  note: string;
}

export interface SleepLogEntry {
  sleep_log_id: string;
  logged_at: string;
  sleep_start_at: string;
  sleep_end_at: string;
  sleep_hours: number | null;
  sleep_quality: SleepQuality;
  source: HealthDataSource;
  note: string;
}

export interface WorkoutLogEntry {
  workout_id: string;
  logged_at: string;
  workout_name: string;
  workout_video_url: string;
  workout_level: WorkoutLevel;
  duration_min: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr: number | null;
  calories_kcal: number | null;
  note: string;
}

export interface StockEntry {
  stock_item_id: string;
  item_name: string;
  quantity: number | null;
  unit: string;
  purchased_at: string;
  updated_at: string;
  purchase_channel: string;
  linked_food_ref_id: string;
  note: string;
}

export interface FoodLogEntry {
  food_log_id: string;
  logged_at: string;
  meal_type: MealType;
  meal_text: string;
  estimated_calories: number | null;
  parse_status: ParseStatus;
  note: string;
}

export interface FoodItemEntry {
  parent_food_log_id: string;
  item_name: string;
  quantity: number | null;
  unit: string;
  estimated_calories: number | null;
  linked_food_ref_id: string;
  linked_stock_item_id: string;
  ai_confidence: number | null;
  note: string;
}

export interface PendingMealRecordInput {
  createdAt: string;
  mealType: MealType;
  mealText: string;
  estimatedCalories: number | null;
  parseStatus: ParseStatus;
  note: string;
  items: FoodItemEntry[];
}

export interface PendingMappedCommandAction {
  kind: 'mapped-command';
  createdAt: string;
  sourceText: string;
  previewText: string;
  commandText: string;
  note: string;
}

export interface PendingMealRecordAction {
  kind: 'meal-record';
  createdAt: string;
  sourceText: string;
  previewText: string;
  mealRecord: PendingMealRecordInput;
  note: string;
}

export type PendingAiAction =
  | PendingMappedCommandAction
  | PendingMealRecordAction;

export interface BotLogEntry {
  logged_at: string;
  raw_text: string;
  handling_mode: HandlingMode;
  status: HandlingStatus;
  note: string;
}

export interface FoodReferenceEntry {
  food_ref_id: string;
  food_name: string;
  brand: string;
  serving_size: number | null;
  serving_unit: string;
  calories_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  source: ReferenceSource;
  updated_at: string;
  note: string;
}
