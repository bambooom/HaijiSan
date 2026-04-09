# HaijiSan AI Use Cases

This document collects real-world natural-language inputs that are already showing up during actual usage and testing.

The goal is not to define a rigid grammar. The goal is to preserve the way the user actually speaks, so prompt design, tool behavior, and tests can stay aligned with real inputs.

## How To Use This File

- Add new examples when a real message exposed a gap, ambiguity, or useful pattern.
- Prefer real user wording over cleaned-up or idealized phrasing.
- Note the expected tool behavior, not only the final reply.
- When a case caused a bug, record the failure and the desired handling.

## Case Format

- Input: the original user message
- Intent: what HaijiSan should understand
- Expected behavior: what the AI or tool layer should do
- Notes: ambiguity, follow-up risk, or implementation details

## Food Logging

### Timed breakfast log

- Input: `今天早饭8:55吃的，吃了2个鸡蛋，一杯咖啡（200ml牛奶）`
- Intent: log one breakfast event in `FOOD_LOG`
- Expected behavior: use `insertData` on `FOOD_LOG`
- Expected record shape:
  - `meal_type = breakfast`
  - `meal_text = 2个鸡蛋，一杯咖啡（200ml牛奶）`
  - `occurred_at` should be inferred from the natural-language meaning if possible
  - if AI does not provide `occurred_at`, the app should default it to current `now`
- Notes: this case previously failed because `occurred_at` was missing; another retry failed because AI emitted a non-canonical `meal_type` instead of the required enum value `breakfast`

### Backfilled dinner log

- Input: `补记 4/2 晚饭 牛肉粉`
- Intent: log a dinner record for a past date
- Expected behavior: use `insertData` on `FOOD_LOG`
- Expected record shape:
  - `meal_type = dinner`
  - `meal_text = 牛肉粉`
  - `occurred_at` should land on the intended past date, not only current log time
- Notes: this is a date-backfill pattern, even if the exact clock time is unknown

### Recent food query

- Input: `最近吃了什么`
- Intent: query recent meal history
- Expected behavior: use `readData` on `FOOD_LOG`, usually with `recent`
- Notes: the final reply should summarize patterns, not dump raw rows unless needed

## Sleep Logging

### Relative-date sleep log

- Input: `昨天睡眠 02:42-08:20`
- Intent: log one sleep record for yesterday
- Expected behavior: use `insertData` on `SLEEP_LOG`
- Expected record shape:
  - `sleep_start_at` and `sleep_end_at` should reflect the intended sleep interval
  - if the interval crosses midnight, the start and end timestamps must remain coherent

### Explicit-date sleep correction

- Input: `更新4月2号的睡眠 2:42-8:20，一般`
- Intent: correct or rewrite an existing sleep record for April 2
- Expected behavior:
  - use `readData` first to locate the target row
  - then `updateData` with the exact row number
- Notes: AI must not invent row numbers

## Body Logging

### Relative-date weight log

- Input: `前天体重 55.1kg`
- Intent: log a historical body-weight entry
- Expected behavior: use `insertData` on `BODY_LOG`
- Expected record shape:
  - `weight_kg = 55.1`
  - `source = manual`
  - `occurred_at` should point to the referenced day

## Follow-Up Context Cases

### Continue previous topic

- Input: `按刚才那个继续`
- Intent: continue the immediately previous task or advice thread
- Expected behavior: recent conversation context should be expanded before asking Gemini
- Notes: this should not require the user to restate the subject explicitly

### Refer back with a pronoun-like phrase

- Input: `那个改成昨天的`
- Intent: revise the previously discussed record or assumption
- Expected behavior:
  - use recent conversation context
  - if the target is still unclear, ask a short follow-up instead of guessing

### Nutrition follow-up without restating context

- Input: `那这样蛋白够吗`
- Intent: evaluate protein intake based on the meal or plan discussed just before
- Expected behavior:
  - use recent conversation context
  - read user data first when the answer depends on actual intake history
- Notes: this is a high-value short-memory case

## General AI Q&A

### Capability question

- Input: `你能做什么？`
- Intent: understand current supported capabilities
- Expected behavior: direct reply is fine; tool call is not required

### Recent message recall

- Input: `最近一条消息是什么？`
- Intent: ask about the most recent conversation item
- Expected behavior: use `readData` on `BOT_LOG` with a recent selector when needed

## Behavior Rules Captured By These Cases

- Real user phrasing can mix time, meal type, quantity, and food content in one sentence.
- The AI should extract structured fields from semantics instead of requiring rigid command syntax.
- For `FOOD_LOG`, `meal_type` must be normalized to the exact enum values `breakfast`, `lunch`, `dinner`, `snack` rather than copied from Chinese phrasing.
- For event-log sheets, missing `occurred_at` must not cause the whole flow to fail; the app can default it to `now`.
- For follow-up messages like `刚才`, `继续`, `那个`, short-term conversation context matters more than full-day history replay.
- For corrections, AI should read first and update second rather than inventing row numbers.

## Next Cases To Add When They Appear

- Mixed meal + exercise in one sentence
- Same-day correction of a just-recorded meal
- Menstruation, bowel movement, symptom, and medication phrases
- Stock and grocery restock phrasing
- Comparative questions like `最近是不是吃太少蛋白了`
