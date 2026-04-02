# Agent Architecture TODO

## Goal

Reframe HaijiSan as a lightweight domain-specific agent.

This project is not just a Telegram bot anymore. It already behaves like a narrow personal agent for health, food, stock, sleep, and workout workflows.

The goal of the next architecture pass is:

- make current agent layers explicit
- identify what is already solid
- identify what is weak or missing
- define a cleaner target architecture before any refactor

---

## 1. Current-State Architecture

### 1.1 Intake

Status: strong

What exists:

- Telegram webhook entrypoint
- allowed-user gating
- timestamp normalization
- top-level request handling

Current files:

- [src/index.ts](src/index.ts)
- [src/app-config.ts](src/app-config.ts)

Assessment:

- This layer is already good enough.
- It should stay thin and stable.

### 1.2 Routing

Status: usable, but mixed responsibilities

What exists:

- slash-command path
- AI-assisted natural-language path
- top-level dispatch between deterministic and model-driven handling

Current files:

- [src/commands.ts](src/commands.ts)
- [src/handlers/command-router.ts](src/handlers/command-router.ts)

Assessment:

- Good boundary exists between command and AI handling.
- Too much downstream business logic still leaks into routing decisions.

### 1.3 Planning

Status: early agent loop exists

What exists:

- reply
- clarify
- execute

Current files:

- [src/handlers/ai/index.ts](src/handlers/ai/index.ts)
- [src/handlers/ai/turn.ts](src/handlers/ai/turn.ts)

Assessment:

- This is already a minimal planning loop.
- The project already behaves like a lightweight agent.
- Planning is still too shallow and mostly mode-based.

### 1.4 Model / Intent Resolution

Status: partial

What exists:

- Gemini-based intent classification
- structured plan extraction
- meal estimation / nutrition-related model flows

Current files:

- [src/services/gemini.ts](src/services/gemini.ts)

Assessment:

- The model is already being used as a planner, not just as a chat model.
- Missing confidence scoring, rejection logic, and stronger plan validation.

### 1.5 Short-Term Memory

Status: good first step

What exists:

- pending confirmation state
- clarify follow-up continuation
- cancel flow

Current files:

- [src/services/pending-action.ts](src/services/pending-action.ts)
- [src/handlers/ai/pending.ts](src/handlers/ai/pending.ts)
- [src/handlers/ai/clarify-followup.ts](src/handlers/ai/clarify-followup.ts)

Assessment:

- This is real short-lived agent state.
- It already supports multi-turn interaction.
- It is still limited to pending actions and follow-up clarification only.

### 1.6 Tools / Actions

Status: implicit, not formalized

What exists:

- food logging
- stock update
- sleep logging
- workout logging
- status logging
- nutrition summary
- calorie reference lookup

Current files:

- [src/handlers/food.ts](src/handlers/food.ts)
- [src/handlers/stock.ts](src/handlers/stock.ts)
- [src/handlers/sleep.ts](src/handlers/sleep.ts)
- [src/handlers/workout.ts](src/handlers/workout.ts)
- [src/handlers/status.ts](src/handlers/status.ts)
- [src/handlers/reference.ts](src/handlers/reference.ts)
- [src/services/nutrition-summary.ts](src/services/nutrition-summary.ts)

Assessment:

- The project already has domain tools in practice.
- They are not yet explicit tool contracts.
- This is the biggest architectural gap.

### 1.7 Execution

Status: strong

What exists:

- execution branching
- confirmation before most AI-assisted writes
- service-level persistence flows
- repository-backed sheet updates

Current files:

- [src/handlers/ai/execute.ts](src/handlers/ai/execute.ts)
- [src/services/meal-action.ts](src/services/meal-action.ts)
- [src/services/meal-recording.ts](src/services/meal-recording.ts)
- [src/services/spreadsheet.ts](src/services/spreadsheet.ts)
- [src/repositories](src/repositories)

Assessment:

- This is one of the strongest parts of the codebase.
- Deterministic write boundaries already exist.
- This should be preserved and elevated, not replaced.

### 1.8 Persistence

Status: strong

What exists:

- sheet-backed domain repositories
- food, stock, sleep, workout, status, calorie reference storage
- bot log storage

Current files:

- [src/repositories](src/repositories)
- [README.md](README.md)

Assessment:

- This is the project's durable core.
- The system already has a real domain model and data layer.

### 1.9 Observability

Status: weak

What exists:

- bot log
- free-form notes
- some status and parse-state markers

Current files:

- [src/repositories/bot-log.ts](src/repositories/bot-log.ts)

Assessment:

- Enough for basic debugging.
- Not enough for agent engineering.
- Missing structured traces and cause analysis.

### 1.10 Evaluation

Status: very weak

What exists:

- manual natural-language cases

Current files:

- [docs/ai-natural-language-cases.md](docs/ai-natural-language-cases.md)

Assessment:

- Excellent seed material.
- Not yet executable.
- No repeatable scoring loop exists.

---

## 2. What This Project Already Is

This project is already:

- a lightweight personal agent
- a domain-specific agent
- a structured data-ingestion agent
- a multi-turn clarification agent
- a spreadsheet-backed execution agent

This project is not yet:

- a fully tooled agent platform
- a context-retrieval-aware agent
- an eval-driven agent system
- a deeply observable agent runtime

---

## 3. Main Gaps

### Gap 1: No explicit tool contracts

Problem:

- model output and business execution are too tightly coupled
- tool boundaries are implicit in handlers

Need:

- explicit tool registry
- required/optional fields per action
- confirmation policy per action
- side-effect declaration per action

### Gap 2: No context retrieval layer before planning

Problem:

- planning is mostly single-turn except pending clarifications
- the agent feels context-poor

Need:

- retrieve only relevant recent context before planning
- recent meals
- recent workout mappings
- stock baselines
- pending clarify state
- optional stable user preferences later

### Gap 3: Weak planning structure

Problem:

- reply / clarify / execute is a good start but too thin

Need:

- confidence
- missing fields
- fallback behavior
- rejection or forced clarify path

### Gap 4: Weak observability

Problem:

- hard to answer why a wrong write happened

Need:

- structured trace for each turn
- raw input
- chosen intent
- selected tool
- tool args
- confirmation state
- final write result
- later correction marker

### Gap 5: No idempotency / recovery discipline

Problem:

- repeated confirm could duplicate writes
- partial multi-step write failures are hard to reason about

Need:

- trace id per turn
- duplicate confirmation protection
- recovery rules for linked writes

### Gap 6: No executable eval harness

Problem:

- improvements are mostly based on feeling

Need:

- replay real utterances
- measure intent accuracy
- measure clarification count
- measure write correctness
- measure summary usefulness

---

## 4. Target Architecture

### 4.1 Intake Layer

Responsibility:

- receive Telegram message
- validate allowed sender
- normalize input payload

Keep:

- current webhook entrypoint

### 4.2 Context Retrieval Layer

Responsibility:

- fetch the smallest relevant history before planning

Should retrieve:

- recent meals when meal-related
- recent workout mappings when workout-related
- stock references when food/stock-related
- pending clarification state
- stable user preferences only if clearly useful later

Add:

- [src/services/context-retrieval.ts](src/services/context-retrieval.ts) or equivalent

### 4.3 Planning Layer

Responsibility:

- decide reply / clarify / execute
- attach confidence
- identify missing fields
- downgrade uncertain plans into clarify

Keep:

- current stage model in [src/handlers/ai/turn.ts](src/handlers/ai/turn.ts)

Strengthen:

- richer plan schema
- rejection / downgrade policy
- explicit required slot tracking

### 4.4 Tool Registry Layer

Responsibility:

- define domain actions as explicit tools

Target tools:

- logMeal
- adjustStock
- summarizeNutrition
- logSleep
- logWorkout
- logStatus
- lookupReference

Add:

- [src/tools/registry.ts](src/tools/registry.ts)
- [src/tools/schemas.ts](src/tools/schemas.ts)

### 4.5 Execution Layer

Responsibility:

- planner selects tool
- execution validates arguments
- service/repository layer performs writes

Refactor target:

- [src/handlers/ai/execute.ts](src/handlers/ai/execute.ts)

Rule:

- model does not directly control final persistence shape
- tools do

### 4.6 Safety / Recovery Layer

Responsibility:

- confirm risky writes
- support cancel
- prevent duplicates
- recover from partial failures

Keep:

- current pending confirmation flow

Add:

- trace id per action
- dedupe on repeated confirmations
- clearer side-effect boundaries

### 4.7 Observability Layer

Responsibility:

- make every turn traceable

Need to record:

- raw input
- context used
- chosen intent
- confidence
- selected tool
- produced args
- confirmation needed
- final write outcome
- user correction later

Add:

- [src/services/observability.ts](src/services/observability.ts)
- possibly [src/repositories/action-trace.ts](src/repositories/action-trace.ts)

### 4.8 Evaluation Layer

Responsibility:

- replay real utterances offline
- score correctness

Seed:

- [docs/ai-natural-language-cases.md](docs/ai-natural-language-cases.md)

Add:

- [tests/evaluation](tests/evaluation)

---

## 5. Proposed Module Split

### Keep Mostly As-Is

- [src/index.ts](src/index.ts)
- [src/commands.ts](src/commands.ts)
- [src/repositories](src/repositories)
- [src/services/spreadsheet.ts](src/services/spreadsheet.ts)

### Refactor

- [src/services/gemini.ts](src/services/gemini.ts)
- [src/handlers/ai/turn.ts](src/handlers/ai/turn.ts)
- [src/handlers/ai/execute.ts](src/handlers/ai/execute.ts)

### Add

- [src/services/context-retrieval.ts](src/services/context-retrieval.ts)
- [src/tools/registry.ts](src/tools/registry.ts)
- [src/tools/schemas.ts](src/tools/schemas.ts)
- [src/services/observability.ts](src/services/observability.ts)
- [src/repositories/action-trace.ts](src/repositories/action-trace.ts)
- [tests/evaluation](tests/evaluation)

---

## 6. Refactor Priority

### Phase 1: Define Tool Contracts

Goal:

- make core actions explicit

Tasks:

- define 5 to 7 core tools
- define required fields
- define optional fields
- define confirmation requirements
- define side effects

### Phase 2: Add Context Retrieval

Goal:

- stop planning in near-total isolation

Tasks:

- fetch recent relevant data before planning
- inject only relevant context
- avoid overstuffing prompts

### Phase 3: Add Structured Tracing

Goal:

- explain every decision and write

Tasks:

- generate trace id per turn
- log planning decision
- log chosen tool and args
- log write result
- log correction if later fixed

### Phase 4: Add Eval Harness

Goal:

- improve with evidence

Tasks:

- convert case list into executable scenarios
- measure intent accuracy
- measure clarification burden
- measure write correctness
- track regressions after prompt/code changes

### Phase 5: Reassess Broader Agent Runtime

Goal:

- decide later whether outer orchestration adds value

Rule:

- do not introduce a larger framework until tools, context, traces, and evals exist

---

## 7. Explicit Product Boundary

### Included

- natural-language record intake
- linked updates across records
- historical lookups
- summaries over personal records

### Excluded

- charts and dashboards
- general open-ended assistant behavior
- replacing deterministic domain rules with free-form model output
- broad consumer-app UX

---

## 8. Career / Learning Framing

Best framing for this project:

- lightweight domain-specific personal agent
- structured tool invocation over spreadsheet-backed persistence
- clarification and confirmation loops for safe writes
- retrieval-aware planning over personal data
- measurable reliability via traces and evals

Avoid underselling it as:

- just a Telegram bot
- just a Gemini integration
- just a spreadsheet automation script

---

## 9. Immediate Next TODO

1. Write explicit tool definitions for the top 5 to 7 actions.
2. Design a context-retrieval function for planning.
3. Add a trace id that survives clarify and confirm flows.
4. Define what a low-confidence plan should do.
5. Convert natural-language cases into executable eval scenarios.

---

## 10. Decision Summary

Current conclusion:

- the project already has real agent bones
- the strongest existing layers are intake, execution, and persistence
- the most urgent missing layers are tool contracts, context retrieval, observability, and evals
- the next architecture pass should make the agent explicit, not larger
