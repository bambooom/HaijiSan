export type BodyEntryType = 'weight' | 'bowel' | 'menstruation' | 'sleep';

export type WorkoutLevel = 'easy' | 'medium' | 'hard';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type ParseStatus = 'pending' | 'parsed' | 'failed' | 'confirmed';

export type HandlingMode = 'command' | 'rule' | 'ai';

export type HandlingStatus = 'success' | 'ignored' | 'failed';

export type ReferenceSource =
  | 'nutrition_label'
  | 'manual_entry'
  | 'internet_reference'
  | 'ai_estimate';

export interface StatusBodyEntry {
  entry_id: string;
  logged_at: string;
  entry_type: BodyEntryType;
  value: string | number;
  unit: string;
  note: string;
  cycle_day: number | null;
  sleep_start_at: string;
  sleep_end_at: string;
  sleep_hours: number | null;
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

export interface MasterStockEntry {
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

export interface JournalFoodEntry {
  journal_entry_id: string;
  logged_at: string;
  meal_type: MealType;
  meal_text: string;
  estimated_calories: number | null;
  parse_status: ParseStatus;
  note: string;
}

export interface JournalFoodItemEntry {
  parent_journal_entry_id: string;
  item_name: string;
  quantity: number | null;
  unit: string;
  estimated_calories: number | null;
  linked_food_ref_id: string;
  linked_stock_item_id: string;
  ai_confidence: number | null;
  note: string;
}

export interface AllLogEntry {
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
