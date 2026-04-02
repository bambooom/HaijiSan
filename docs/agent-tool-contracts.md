# Agent Tool Contracts

This document defines the first draft of explicit tool contracts for HaijiSan as a lightweight domain-specific agent.

The purpose is to separate:

- model planning
- tool selection
- validated execution
- persistence side effects

The model should decide intent and produce arguments.
The tool layer should decide whether those arguments are sufficient, whether clarification is needed, whether confirmation is required, and how data is finally written.

---

## Design Principles

### 1. Tools are domain actions, not prompts

Each tool should represent a business action that the system already understands.

Good examples:

- `logMeal`
- `adjustStock`
- `summarizeNutrition`
- `logSleep`
- `logWorkout`
- `logStatus`
- `lookupReference`

Bad examples:

- `askGeminiAboutFood`
- `runSpreadsheetUpdate`
- `handleUserMessage`

### 2. Model output should not directly shape writes

The model can propose arguments.
The tool must validate:

- required fields
- allowed enums
- confirmation policy
- side effects
- write path

### 3. Read-only and write tools should be clearly separated

Read-only tools can run immediately.
Write tools should usually go through confirmation unless the action is deterministic and already fully structured.

### 4. One tool should have one primary responsibility

For example:

- `logMeal` records meal data
- stock updates triggered by meal logging are side effects of `logMeal`, not a separate user-visible tool call in the same turn

---

## Proposed Tool Registry Shape

```ts
type ToolConfirmationPolicy = 'always' | 'conditional' | 'never';

interface ToolContract<Input, Output> {
  name: string;
  description: string;
  category: 'write' | 'read';
  confirmationPolicy: ToolConfirmationPolicy;
  requiredFields: string[];
  optionalFields: string[];
  sideEffects: string[];
  validate: (input: Input) => ValidationResult;
  execute: (input: Input, context: ToolExecutionContext) => Output;
}

interface ValidationResult {
  ok: boolean;
  missingFields?: string[];
  errors?: string[];
  shouldClarify?: boolean;
}
```

---

## Tool 1: `logMeal`

### Purpose

Record one meal event from natural language or structured command input.

### Current implementation mapping

- AI path: [src/handlers/ai/food.ts](../src/handlers/ai/food.ts)
- persistence: [src/services/meal-action.ts](../src/services/meal-action.ts)
- persistence: [src/services/meal-recording.ts](../src/services/meal-recording.ts)
- repositories: [src/repositories/food-log.ts](../src/repositories/food-log.ts)
- repositories: [src/repositories/food-items.ts](../src/repositories/food-items.ts)

### Input

```ts
interface LogMealInput {
  sourceText: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  mealText: string;
  estimatedCalories?: number | null;
  parseStatus?: 'pending' | 'parsed' | 'failed' | 'confirmed';
  items?: Array<{
    itemName: string;
    quantity?: number | null;
    unit?: string;
    estimatedCalories?: number | null;
    linkedFoodRefId?: string;
    linkedStockItemId?: string;
    aiConfidence?: number | null;
  }>;
  note?: string;
}
```

### Required fields

- `mealText`

### Optional but strongly preferred fields

- `mealType`
- `estimatedCalories`
- `items`

### Confirmation policy

- `conditional`

Require confirmation when:

- input came from AI planning
- calories or parsed items were inferred
- stock side effects may be applied

Allow immediate execution when:

- input came from deterministic command parsing and already satisfies existing `/food` flow expectations

### Side effects

- append one record to `Food_Log`
- append or replace related rows in `Food_Items`
- optional stock deduction in later phase if item-to-stock mapping is reliable

### Validation rules

- `mealText` must not be empty
- `mealType` must be valid enum if present
- at least one of `estimatedCalories` or `items` should exist for meaningful persistence
- if all item quantities are missing and calorie estimate is missing, downgrade to clarify

### Output

```ts
interface LogMealOutput {
  foodLogId: string;
  persisted: boolean;
  estimatedCalories: number | null;
  parseStatus: 'pending' | 'parsed' | 'failed' | 'confirmed';
  itemCount: number;
  stockSyncPlanned?: boolean;
}
```

---

## Tool 2: `adjustStock`

### Purpose

Adjust one or more stock items by delta or set absolute quantity.

### Current implementation mapping

- command path: [src/handlers/stock.ts](../src/handlers/stock.ts)
- AI execution path: [src/handlers/ai/execute.ts](../src/handlers/ai/execute.ts)
- repository: [src/repositories/stock.ts](../src/repositories/stock.ts)

### Input

```ts
interface AdjustStockInput {
  operation: 'adjust' | 'set';
  items: Array<{
    name: string;
    quantity: number;
    unit?: string;
    purchaseChannel?: string;
  }>;
}
```

### Required fields

- `operation`
- `items`
- each item requires `name` and `quantity`

### Confirmation policy

- `always` for AI-originated batch writes
- `never` for fully deterministic slash commands already validated by regex

### Side effects

- update one or more records in `Stock`

### Validation rules

- `items.length > 0`
- `quantity` must be finite number
- `set` operation must not accept negative quantity
- `adjust` operation may accept positive or negative quantity

### Output

```ts
interface AdjustStockOutput {
  operation: 'adjust' | 'set';
  updatedCount: number;
  itemNames: string[];
}
```

---

## Tool 3: `summarizeNutrition`

### Purpose

Read existing records and summarize today's nutrition state.

### Current implementation mapping

- AI path: [src/handlers/ai/nutrition.ts](../src/handlers/ai/nutrition.ts)
- summary service: [src/services/nutrition-summary.ts](../src/services/nutrition-summary.ts)

### Input

```ts
interface SummarizeNutritionInput {
  date?: string;
  scope?: 'today';
}
```

### Required fields

- none if defaulting to `today`

### Confirmation policy

- `never`

### Side effects

- none

### Validation rules

- current version supports `today` only
- if no meals exist, return a non-persisting informative reply

### Output

```ts
interface SummarizeNutritionOutput {
  mealsCount: number;
  totalCalories: number | null;
  totalProtein: number | null;
  proteinTarget: number | null;
  totalVegetableGrams: number | null;
  unresolvedItems: string[];
}
```

---

## Tool 4: `logSleep`

### Purpose

Record sleep start, sleep end, and optional quality.

### Current implementation mapping

- command path: [src/handlers/sleep.ts](../src/handlers/sleep.ts)

### Input

```ts
interface LogSleepInput {
  sleepStart: string;
  sleepEnd: string;
  sleepQuality?: 'good' | 'normal' | 'poor';
  note?: string;
}
```

### Required fields

- `sleepStart`
- `sleepEnd`

### Confirmation policy

- `conditional`

Allow immediate execution when deterministic command parsing succeeds.
Require confirmation when AI inferred time normalization or missing fields were backfilled.

### Side effects

- append one record to `Sleep_Log`

### Validation rules

- time strings must parse into supported local time format
- if either time is missing, downgrade to clarify

### Output

```ts
interface LogSleepOutput {
  persisted: boolean;
  sleepHours: number | null;
  sleepQuality?: 'good' | 'normal' | 'poor';
}
```

---

## Tool 5: `logWorkout`

### Purpose

Record workout identity and basic metrics.

### Current implementation mapping

- command path: [src/handlers/workout.ts](../src/handlers/workout.ts)

### Input

```ts
interface LogWorkoutInput {
  workoutName: string;
  durationMin?: number | null;
  workoutLevel?: 'easy' | 'medium' | 'hard';
  workoutVideoUrl?: string;
  note?: string;
}
```

### Required fields

- `workoutName`

### Confirmation policy

- `conditional`

Require confirmation when AI generated or normalized the workout identity.

### Side effects

- append one record to `Workout_Log`
- future phase: attach workout-video mapping or external workout identity

### Validation rules

- `workoutName` must not be empty
- `durationMin` must be positive if present

### Output

```ts
interface LogWorkoutOutput {
  persisted: boolean;
  workoutName: string;
  durationMin: number | null;
}
```

---

## Tool 6: `logStatus`

### Purpose

Record body status or symptom-style entries.

### Current implementation mapping

- command path: [src/handlers/status.ts](../src/handlers/status.ts)

### Input

```ts
interface LogStatusInput {
  entryType: 'bowel' | 'menstruation' | 'symptom' | 'medication';
  value?: number | null;
  unit?: string;
  cycleDay?: number | null;
  note?: string;
}
```

### Required fields

- `entryType`

### Confirmation policy

- `conditional`

Allow immediate execution for deterministic slash commands.

### Side effects

- append one record to `Status_Log`
- future phase: special routing for weight may continue using `Body_Log`

### Validation rules

- `entryType` must be valid enum
- symptom or medication flows should usually include note text

### Output

```ts
interface LogStatusOutput {
  persisted: boolean;
  entryType: 'bowel' | 'menstruation' | 'symptom' | 'medication';
}
```

---

## Tool 7: `lookupReference`

### Purpose

Read calorie and nutrition references by keyword.

### Current implementation mapping

- command path: [src/handlers/reference.ts](../src/handlers/reference.ts)

### Input

```ts
interface LookupReferenceInput {
  query?: string;
}
```

### Required fields

- none

### Confirmation policy

- `never`

### Side effects

- none

### Validation rules

- empty query returns the default reference listing behavior

### Output

```ts
interface LookupReferenceOutput {
  resultCount: number;
  references: Array<{
    foodRefId: string;
    foodName: string;
    brand?: string;
  }>;
}
```

---

## Recommended First Tool Registry Order

The first tool registry should be implemented in this order:

1. `logMeal`
2. `adjustStock`
3. `summarizeNutrition`
4. `logSleep`
5. `logWorkout`
6. `logStatus`
7. `lookupReference`

Why this order:

- meal and stock are the highest-value cross-record workflows
- nutrition summary is already a clean read-only tool
- sleep and workout are straightforward write tools
- status and reference lookup are simpler and can follow once the pattern is stable

---

## Proposed File Split

First draft target:

- `src/tools/registry.ts`
- `src/tools/schemas.ts`
- `src/tools/execute.ts`

Suggested responsibility split:

- `registry.ts`: tool definitions and metadata
- `schemas.ts`: shared input/output types and validation helpers
- `execute.ts`: tool dispatch entrypoint used by AI execution flow

---

## Non-Goals For This Phase

- do not build a general tool system for arbitrary plugins
- do not move repository logic out of the existing persistence layer yet
- do not merge all handlers immediately
- do not remove the current confirmation flow before tool validation exists

---

## Decision Summary

- HaijiSan already has tool-like business actions
- the next step is to formalize them, not reinvent them
- the first registry should stay small and domain-specific
- tool contracts should become the boundary between planning and persistence
