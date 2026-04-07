import type {
  HealthDataSource,
  HandlingMode,
  HandlingStatus,
  MealType,
  ReferenceSource,
  SleepQuality,
  StatusEntryType,
  WorkoutLevel,
} from './core';

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

export type StockListItem = {
  name: string;
  amount: string;
};

export type StockAdjustResult =
  | {
      ok: true;
      entry: StockEntry;
      quantity: number;
      operation: 'create' | 'adjust' | 'set';
    }
  | {
      ok: false;
      reason:
        | 'invalid-name'
        | 'invalid-quantity'
        | 'not-found'
        | 'negative-stock';
      quantity?: number;
      currentQuantity?: number;
    };

export interface FoodLogEntry {
  food_log_id: string;
  logged_at: string;
  meal_type: MealType;
  meal_text: string;
  calories_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  vegetable_g: number | null;
  linked_food_ref_ids: string;
  linked_stock_item_ids: string;
  note: string;
}

export interface BotLogEntry {
  logged_at: string;
  raw_text: string;
  final_reply: string;
  handling_mode: HandlingMode;
  status: HandlingStatus;
  trace_id: string;
  tool_call_count: number | null;
  read_count: number | null;
  insert_count: number | null;
  update_count: number | null;
  read_sheet_names: string;
  write_sheet_names: string;
  primary_action: string;
  primary_target_sheet: string;
  primary_selector_type: string;
  primary_selector_value: string;
  changed_fields: string;
  action_summary: string;
  result_code: string;
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
