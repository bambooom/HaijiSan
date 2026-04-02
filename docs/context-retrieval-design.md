# Context Retrieval Design

This document defines the first draft of a context retrieval layer for HaijiSan.

The goal is to improve planning quality without turning the system into a bloated general-purpose memory agent.

Context retrieval in this project should be:

- minimal
- intent-aware
- deterministic
- cheap enough to run on every relevant turn

---

## Why This Layer Is Needed

Right now, most planning happens from:

- the current user message
- pending clarification state if it exists

That means the system is weak at questions like:

- what did I eat earlier today
- what workout names have I used before
- what stock references are likely related to this meal
- should this follow-up continue an earlier unfinished action

The point of context retrieval is not to dump lots of history into Gemini.
The point is to provide the smallest slice of relevant facts before planning.

---

## Design Principles

### 1. Retrieve by intent class, not by everything

Do not load the same context for every turn.

Examples:

- meal logging should load recent meal and stock context
- workout logging should load recent workout naming context
- nutrition summary should load no extra context because the execution tool already reads today's records

### 2. Prefer structured facts over raw transcript history

Good context:

- recent food log entries
- recent workout names
- pending clarification state
- matched stock item names

Bad context:

- full chat transcript
- long free-form summaries with no retrieval boundary

### 3. Context should support planning, not replace execution reads

Planning context helps decide:

- intent
- missing fields
- whether this is a continuation
- whether clarification is needed

Execution-time data reads should still happen inside the tool.

### 4. Keep prompt budget small

Prefer compact facts:

- 3 recent meals, not 30
- 5 recent workout names, not all history
- stock matches related to mentioned items, not full stock sheet dump

---

## Proposed Layer Position

Current high-level flow:

1. receive message
2. handle pending action if present
3. call planner
4. reply / clarify / execute

Target flow:

1. receive message
2. handle pending action if present
3. retrieve minimal context
4. call planner with message + context facts
5. reply / clarify / execute

Suggested insertion point:

- before planning inside [src/handlers/ai/turn.ts](../src/handlers/ai/turn.ts)
- retrieval implementation in `src/services/context-retrieval.ts`

---

## Context Buckets

### Bucket 1: Pending State

Purpose:

- continue clarification or confirmation safely

Current source:

- [src/services/pending-action.ts](../src/services/pending-action.ts)
- [src/handlers/ai/pending.ts](../src/handlers/ai/pending.ts)

Future role:

- remains the first and highest-priority context source

### Bucket 2: Recent Domain Records

Purpose:

- help the planner understand what the current message is probably referring to

Candidate data:

- recent meals from `Food_Log`
- recent workouts from `Workout_Log`
- recent sleep records from `Sleep_Log`
- latest weight from `Body_Log`

### Bucket 3: Reference Facts

Purpose:

- help interpret meal and stock-related text more accurately

Candidate data:

- matched food references from `Ref_Calories`
- likely stock item names from `Stock`

### Bucket 4: Stable Preferences

Purpose:

- optional later-phase improvements

Candidate data:

- preferred workout naming
- common meal phrasing
- user-specific assumptions such as meal defaults

This bucket is not required in the first implementation.

---

## Retrieval By Intent

### `food` / `food_estimate`

Retrieve:

- pending clarification if present
- recent meals from the last 1 to 3 days
- candidate stock items matching words in the message
- candidate food references matching parsed meal tokens

Why:

- improves continuation detection
- improves food disambiguation
- improves stock-link suggestions later

### `stock_adjust` / `stock_set` / `stock_check`

Retrieve:

- pending clarification if present
- existing stock records matching candidate names
- recent stock mutations for the same items if cheap to access

Why:

- avoids name mismatch
- improves confidence when the same item wording reappears

### `workout`

Retrieve:

- recent workouts from the last 7 to 14 days
- recent workout names or video mappings if available later

Why:

- improves naming consistency
- supports future workout-to-video linkage

### `sleep`

Retrieve:

- recent sleep records from the last 3 to 7 days

Why:

- low priority, but could help with relative-time phrasing later

### `nutrition_summary`

Retrieve:

- no extra planning context required in first phase

Why:

- this should be a read-only tool that directly loads today's records at execution time

### `status` intents

Retrieve:

- minimal or none in first phase

Why:

- these are simpler write actions and do not benefit much from extra planning context initially

---

## Proposed Retrieval Contract

```ts
interface PlanningContext {
  pendingAction: PendingAiAction | null;
  recentMeals?: Array<{
    loggedAt: string;
    mealType: string;
    mealText: string;
    estimatedCalories: number | null;
  }>;
  recentWorkouts?: Array<{
    loggedAt: string;
    workoutName: string;
    durationMin: number | null;
  }>;
  recentSleep?: Array<{
    loggedAt: string;
    sleepStartAt: string;
    sleepEndAt: string;
  }>;
  stockCandidates?: Array<{
    itemName: string;
    quantity: number | null;
    unit?: string;
  }>;
  referenceCandidates?: Array<{
    foodRefId: string;
    foodName: string;
    brand?: string;
    caloriesKcal?: number | null;
  }>;
}
```

---

## Proposed Retrieval API

```ts
interface ContextRetrievalInput {
  text: string;
  timestamp: Date;
  predictedIntent?: string;
}

function retrievePlanningContext(
  input: ContextRetrievalInput,
): PlanningContext {
  // 1. read pending state
  // 2. infer lightweight candidate intent if needed
  // 3. load only matching context buckets
  // 4. return compact structured facts
}
```

Notes:

- first version can use a lightweight heuristic intent guess before full planning
- later version can use a two-pass approach if needed

---

## Integration Strategy

### Phase 1: Minimal Integration

Goal:

- add retrieval without changing too many existing components

Approach:

- keep current pending handling first
- call `retrievePlanningContext()` in [src/handlers/ai/turn.ts](../src/handlers/ai/turn.ts)
- pass compact context facts into Gemini planner as a structured preamble

### Phase 2: Better Planner Inputs

Goal:

- stop relying on one giant system instruction

Approach:

- split planner inputs into:
  - static system rules
  - current user message
  - compact planning context

### Phase 3: Retrieval-Aware Clarify

Goal:

- reduce unnecessary clarifications

Approach:

- if recent context fills obvious missing slots, still require safe thresholds
- do not silently invent values that affect writes

---

## Prompt Budget Guidance

Use compact bullet-like facts.

Example meal context payload:

```text
Recent meals:
- today lunch: 牛肉粉, 620 kcal
- today snack: 香蕉 1 根

Matching stock items:
- 鸡蛋: 8 个
- 西兰花: 320 g

Matching references:
- 鸡蛋, 1 个, 70 kcal
- 香蕉, 100 g, 89 kcal
```

Avoid:

- large raw JSON dumps
- full row payloads from multiple sheets
- old context unrelated to the current turn

---

## Failure And Fallback Rules

### If retrieval fails

- planner should still run with current behavior
- retrieval failure must not block the turn

### If retrieval returns too much data

- trim to top matches only
- prefer recency and exact name match over breadth

### If retrieval and message disagree

- prefer the current user message
- use context only to support clarification or confidence, not to override explicit user input

---

## Suggested First Implementation Scope

Implement first only for:

1. `food` / `food_estimate`
2. `stock_adjust` / `stock_set`
3. `workout`

Do not start with:

- full historical memory
- stable preference memory
- transcript summarization
- vector search or embedding-based retrieval

This project does not need a heavy memory system yet.
It needs precise, cheap, structured retrieval.

---

## Proposed File Split

- `src/services/context-retrieval.ts`
- `src/services/context-formatting.ts` optional later

Suggested responsibilities:

- `context-retrieval.ts`: gather structured context facts
- `context-formatting.ts`: convert facts into compact planner input if the formatting grows complex

---

## Decision Summary

- context retrieval should be minimal and intent-aware
- pending state remains the first memory layer
- planning context should be structured facts, not transcript dumps
- execution tools should still perform their own authoritative reads
- meal, stock, and workout flows should get retrieval first
