import { AI_INTENTS } from '../constants/ai';
import type {
  AiIntent,
  FoodItemEntry,
  MealType,
  ParseStatus,
  SleepQuality,
  StatusEntryType,
  WorkoutLevel,
} from '../types';

export const TOOL_NAMES = {
  LOG_MEAL: 'logMeal',
  LOG_BODY: 'logBody',
  ADJUST_STOCK: 'adjustStock',
  LOOKUP_STOCK: 'lookupStock',
  SUMMARIZE_NUTRITION: 'summarizeNutrition',
  LOG_SLEEP: 'logSleep',
  LOG_WORKOUT: 'logWorkout',
  LOG_STATUS: 'logStatus',
  LOG_REFERENCE: 'logReference',
  LOOKUP_REFERENCE: 'lookupReference',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

export type ToolCategory = 'read' | 'write';

export type ToolConfirmationPolicy = 'always' | 'conditional' | 'never';

export type ToolExecutionSource =
  | 'slash-command'
  | 'ai-plan'
  | 'pending-confirmation'
  | 'system';

export type ToolValidationIssueCode =
  | 'missing-field'
  | 'invalid-value'
  | 'empty-input'
  | 'unsupported-scope'
  | 'confirmation-required'
  | 'clarification-required';

export type ToolSideEffect =
  | 'write-food-log'
  | 'write-food-items'
  | 'write-body-log'
  | 'write-stock'
  | 'write-sleep-log'
  | 'write-workout-log'
  | 'write-status-log'
  | 'write-ref-calories'
  | 'read-food-log'
  | 'read-food-items'
  | 'read-stock'
  | 'read-sleep-log'
  | 'read-workout-log'
  | 'read-status-log'
  | 'read-ref-calories'
  | 'read-body-log';

export interface ToolExecutionContext {
  timestamp: Date;
  source: ToolExecutionSource;
  traceId?: string;
}

export interface ToolValidationIssue {
  code: ToolValidationIssueCode;
  message: string;
  field?: string;
}

export interface ToolValidationResult {
  ok: boolean;
  shouldClarify?: boolean;
  issues: ToolValidationIssue[];
}

export interface ToolContract<Name extends ToolName, Input, Output> {
  name: Name;
  description: string;
  category: ToolCategory;
  supportedIntents: readonly AiIntent[];
  confirmationPolicy: ToolConfirmationPolicy;
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  sideEffects: readonly ToolSideEffect[];
  validate: (
    input: Input,
    context: ToolExecutionContext,
  ) => ToolValidationResult;
  execute?: (input: Input, context: ToolExecutionContext) => Output;
}

export interface ToolMealItemInput {
  itemName: string;
  quantity?: number | null;
  unit?: string;
  estimatedCalories?: number | null;
  linkedFoodRefId?: string;
  linkedStockItemId?: string;
  aiConfidence?: number | null;
  note?: string;
}

export interface LogMealInput {
  sourceText: string;
  mealText: string;
  mealType?: MealType;
  estimatedCalories?: number | null;
  parseStatus?: ParseStatus;
  items?: ToolMealItemInput[];
  note?: string;
}

export interface LogMealOutput {
  foodLogId: string;
  persisted: boolean;
  estimatedCalories: number | null;
  parseStatus: ParseStatus;
  itemCount: number;
  stockSyncPlanned?: boolean;
}

export interface StockToolItemInput {
  name: string;
  quantity: number;
  unit?: string;
  purchaseChannel?: string;
}

export interface AdjustStockInput {
  operation: 'adjust' | 'set';
  items: StockToolItemInput[];
}

export interface AdjustStockOutput {
  operation: 'adjust' | 'set';
  updatedCount: number;
  itemNames: string[];
}

export interface LookupStockInput {
  query?: string;
}

export interface LookupStockMatch {
  itemName: string;
  amount: string;
}

export interface LookupStockOutput {
  resultCount: number;
  items: LookupStockMatch[];
}

export interface LogBodyInput {
  weightKg?: number | null;
  bmi?: number | null;
  bodyFatPct?: number | null;
  leanBodyMassKg?: number | null;
  source?: 'manual' | 'ios_health' | 'smart_scale';
  note?: string;
}

export interface LogBodyOutput {
  persisted: boolean;
  weightKg: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  leanBodyMassKg: number | null;
}

export interface SummarizeNutritionInput {
  scope?: 'today';
  date?: string;
}

export interface SummarizeNutritionOutput {
  mealsCount: number;
  totalCalories: number | null;
  totalProtein: number | null;
  proteinTarget: number | null;
  totalVegetableGrams: number | null;
  unresolvedItems: string[];
}

export interface LogSleepInput {
  sleepStart: string;
  sleepEnd: string;
  sleepQuality?: SleepQuality;
  note?: string;
}

export interface LogSleepOutput {
  persisted: boolean;
  sleepHours: number | null;
  sleepQuality?: SleepQuality;
}

export interface LogWorkoutInput {
  workoutName: string;
  durationMin?: number | null;
  workoutLevel?: WorkoutLevel;
  workoutVideoUrl?: string;
  note?: string;
}

export interface LogWorkoutOutput {
  persisted: boolean;
  workoutName: string;
  durationMin: number | null;
}

export interface LogStatusInput {
  entryType: StatusEntryType;
  value?: string | number | null;
  unit?: string;
  cycleDay?: number | null;
  note?: string;
}

export interface LogStatusOutput {
  persisted: boolean;
  entryType: StatusEntryType;
}

export interface LogReferenceInput {
  foodName: string;
  brand?: string;
  servingSize?: number | null;
  servingUnit?: string;
  caloriesKcal?: number | null;
  proteinG?: number | null;
  fatG?: number | null;
  carbsG?: number | null;
  source?:
    | 'nutrition_label'
    | 'manual_entry'
    | 'internet_reference'
    | 'ai_estimate';
  note?: string;
}

export interface LogReferenceOutput {
  persisted: boolean;
  foodName: string;
  brand?: string;
  caloriesKcal: number | null;
}

export interface LookupReferenceInput {
  query?: string;
}

export interface LookupReferenceMatch {
  foodRefId: string;
  foodName: string;
  brand?: string;
}

export interface LookupReferenceOutput {
  resultCount: number;
  references: LookupReferenceMatch[];
}

export interface ToolInputMap {
  [TOOL_NAMES.LOG_MEAL]: LogMealInput;
  [TOOL_NAMES.LOG_BODY]: LogBodyInput;
  [TOOL_NAMES.ADJUST_STOCK]: AdjustStockInput;
  [TOOL_NAMES.LOOKUP_STOCK]: LookupStockInput;
  [TOOL_NAMES.SUMMARIZE_NUTRITION]: SummarizeNutritionInput;
  [TOOL_NAMES.LOG_SLEEP]: LogSleepInput;
  [TOOL_NAMES.LOG_WORKOUT]: LogWorkoutInput;
  [TOOL_NAMES.LOG_STATUS]: LogStatusInput;
  [TOOL_NAMES.LOG_REFERENCE]: LogReferenceInput;
  [TOOL_NAMES.LOOKUP_REFERENCE]: LookupReferenceInput;
}

export interface ToolOutputMap {
  [TOOL_NAMES.LOG_MEAL]: LogMealOutput;
  [TOOL_NAMES.LOG_BODY]: LogBodyOutput;
  [TOOL_NAMES.ADJUST_STOCK]: AdjustStockOutput;
  [TOOL_NAMES.LOOKUP_STOCK]: LookupStockOutput;
  [TOOL_NAMES.SUMMARIZE_NUTRITION]: SummarizeNutritionOutput;
  [TOOL_NAMES.LOG_SLEEP]: LogSleepOutput;
  [TOOL_NAMES.LOG_WORKOUT]: LogWorkoutOutput;
  [TOOL_NAMES.LOG_STATUS]: LogStatusOutput;
  [TOOL_NAMES.LOG_REFERENCE]: LogReferenceOutput;
  [TOOL_NAMES.LOOKUP_REFERENCE]: LookupReferenceOutput;
}

export type AnyToolInput = ToolInputMap[ToolName];

export type AnyToolOutput = ToolOutputMap[ToolName];

export type AnyToolContract = {
  [Name in ToolName]: ToolContract<
    Name,
    ToolInputMap[Name],
    ToolOutputMap[Name]
  >;
}[ToolName];

export const TOOL_INTENT_MAP: Record<ToolName, readonly AiIntent[]> = {
  [TOOL_NAMES.LOG_MEAL]: [AI_INTENTS.FOOD, AI_INTENTS.FOOD_ESTIMATE],
  [TOOL_NAMES.LOG_BODY]: [AI_INTENTS.WEIGHT],
  [TOOL_NAMES.ADJUST_STOCK]: [AI_INTENTS.STOCK_ADJUST, AI_INTENTS.STOCK_SET],
  [TOOL_NAMES.LOOKUP_STOCK]: [AI_INTENTS.STOCK_CHECK],
  [TOOL_NAMES.SUMMARIZE_NUTRITION]: [AI_INTENTS.NUTRITION_SUMMARY],
  [TOOL_NAMES.LOG_SLEEP]: [AI_INTENTS.SLEEP],
  [TOOL_NAMES.LOG_WORKOUT]: [AI_INTENTS.WORKOUT],
  [TOOL_NAMES.LOG_STATUS]: [
    AI_INTENTS.POO,
    AI_INTENTS.PERIOD,
    AI_INTENTS.SYMPTOM,
  ],
  [TOOL_NAMES.LOG_REFERENCE]: [],
  [TOOL_NAMES.LOOKUP_REFERENCE]: [],
};

export function okValidationResult(): ToolValidationResult {
  return {
    ok: true,
    issues: [],
  };
}

export function clarifyValidationResult(
  issues: ToolValidationIssue[],
): ToolValidationResult {
  return {
    ok: false,
    shouldClarify: true,
    issues,
  };
}

export function invalidValidationResult(
  issues: ToolValidationIssue[],
): ToolValidationResult {
  return {
    ok: false,
    shouldClarify: false,
    issues,
  };
}

export function hasMeaningfulMealItems(
  items: ToolMealItemInput[] | undefined,
): boolean {
  return Boolean(
    items?.some(
      (item) =>
        item.itemName.trim() &&
        ((item.quantity !== null && item.quantity !== undefined) ||
          (item.estimatedCalories !== null &&
            item.estimatedCalories !== undefined)),
    ),
  );
}

export function countMealItems(
  items: FoodItemEntry[] | ToolMealItemInput[] = [],
): number {
  return items.filter((item) => {
    if ('item_name' in item) {
      return item.item_name.trim() !== '';
    }

    return item.itemName.trim() !== '';
  }).length;
}
