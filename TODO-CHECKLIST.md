# Agent Refactor Checklist

This is the execution version of [TODO.md](TODO.md).

Use it as the working checklist for the next architecture pass.

---

## A. Confirm Scope

- [ ] Keep the project boundary narrow: record, update linked data, read back, summarize.
- [ ] Explicitly avoid dashboards, charts, and presentation features.
- [ ] Explicitly avoid turning the bot into a general-purpose chat assistant.
- [ ] Keep deterministic business writes as the final source of truth.

---

## B. Document Current Agent Layers

- [ ] Confirm intake layer responsibilities in [src/index.ts](src/index.ts).
- [ ] Confirm routing boundary in [src/commands.ts](src/commands.ts).
- [ ] Confirm current planning loop in [src/handlers/ai/index.ts](src/handlers/ai/index.ts) and [src/handlers/ai/turn.ts](src/handlers/ai/turn.ts).
- [ ] Confirm current execution branching in [src/handlers/ai/execute.ts](src/handlers/ai/execute.ts).
- [ ] Confirm pending-state memory flow in [src/services/pending-action.ts](src/services/pending-action.ts).
- [ ] Confirm repository-backed persistence boundaries in [src/repositories](src/repositories).

---

## C. Define Core Tools

- [x] List the top 5 to 7 domain actions that should become explicit tools.
- [x] Define `logMeal` input and output contract.
- [x] Define `adjustStock` input and output contract.
- [x] Define `summarizeNutrition` input and output contract.
- [x] Define `logSleep` input and output contract.
- [x] Define `logWorkout` input and output contract.
- [x] Define `logStatus` input and output contract.
- [x] Define `lookupReference` input and output contract.
- [x] Mark which tools always require confirmation.
- [x] Mark which tools are read-only and can execute immediately.
- [x] Mark each tool's side effects.

---

## D. Add Context Retrieval

- [x] Decide what minimum context should be fetched before planning.
- [x] Add recent meals retrieval rules.
- [x] Add recent workout mapping retrieval rules.
- [x] Add stock-related reference retrieval rules.
- [x] Add pending clarification state retrieval rules.
- [x] Decide whether stable user preferences are needed now or later.
- [x] Design [src/services/context-retrieval.ts](src/services/context-retrieval.ts).
- [x] Define how retrieved context is passed into planning without bloating prompts.

---

## E. Strengthen Planning

- [x] Decide what fields the plan object must carry beyond reply / clarify / execute.
- [x] Add a confidence field design.
- [x] Add missing-required-fields design.
- [x] Add downgrade-to-clarify rules for low-confidence plans.
- [x] Add plan validation rules before execution.
- [x] Clarify what [src/services/gemini.ts](src/services/gemini.ts) should own vs. not own.

---

## F. Refactor Execution Toward Tool Dispatch

- [x] Design a tool registry module.
- [x] Design tool schemas module.
- [x] Decide how [src/handlers/ai/execute.ts](src/handlers/ai/execute.ts) should call tools instead of branching ad hoc.
- [x] Ensure planner output never directly controls final write shape.
- [x] Keep repository and spreadsheet services as the persistence boundary.

---

## G. Improve Safety And Recovery

- [x] Add a trace id that survives initial turn, clarify turn, and confirmation turn.
- [x] Define repeated-confirmation dedupe behavior.
- [x] Define what happens when a linked multi-step write partially fails.
- [x] Keep `/cancel` behavior as a first-class safety mechanism.
- [x] Re-check which AI-assisted writes should always require confirmation.

---

## H. Add Observability

- [x] Decide the minimum structured trace fields.
- [x] Record raw input.
- [x] Record selected intent.
- [x] Record selected tool.
- [x] Record tool arguments.
- [x] Record confidence.
- [x] Record confirmation state.
- [x] Record final write result.
- [x] Record later correction or cancellation.
- [ ] Decide whether to add a dedicated action trace repository or extend the current bot log.

---

## I. Add Evaluation

- [ ] Convert [docs/ai-natural-language-cases.md](docs/ai-natural-language-cases.md) into structured executable scenarios.
- [ ] Define intent accuracy metric.
- [ ] Define clarification-count metric.
- [ ] Define write-correctness metric.
- [ ] Define summary-quality metric.
- [ ] Create an evaluation runner under [tests/evaluation](tests/evaluation).
- [ ] Decide when to run evals: manual, pre-merge, or both.

---

## J. Keep Product Boundary Tight

- [ ] Reconfirm that visualization stays out of scope.
- [ ] Reconfirm that broad free-form assistant behavior stays out of scope.
- [ ] Reconfirm that the agent remains domain-specific.
- [ ] Reconfirm that the highest priority is reducing recording friction.

---

## K. Career Framing

- [ ] Rewrite the project description as a lightweight domain-specific agent.
- [ ] Document the architecture in agent terms instead of bot terms.
- [ ] Capture future improvements as tool, memory, observability, and eval work.
- [ ] Prepare a concise resume-safe description once the first refactor phase is done.

---

## L. Suggested Implementation Order

- [x] Phase 1: explicit tool contracts
- [x] Phase 2: context retrieval
- [ ] Phase 3: structured tracing
- [ ] Phase 4: executable evals
- [ ] Phase 5: reassess broader orchestration only after the first four are stable
