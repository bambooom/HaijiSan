# HaijiSan

This project uses local TypeScript development for Google Apps Script and deploys compiled artifacts through clasp.

## Overview

HaijiSan is a Telegram bot project built on top of Google Apps Script.

The bot is already configured to receive Telegram messages through a webhook connected to Google Apps Script, and the Apps Script side is already connected to Google Sheets for data persistence. The spreadsheet foundation is already in place, so the current project focus is on improving the bot logic, expanding natural-language interactions, and adding AI-assisted features over time.

At the moment, the bot is intended to act as a lightweight personal logging assistant for body status, food tracking, inventory planning, and future nutrition estimation workflows.

## Current Runtime Setup

- Telegram bot messages are sent to a Google Apps Script web app through a webhook.
- Google Apps Script processes incoming messages and writes structured records into Google Sheets.
- The target spreadsheet is `Project_HAIJI_BodyLog`.
- The sheet structure is already created and ready for use.

## Spreadsheet Design

The spreadsheet should now be treated as a seven-tab structure. The goal is to keep the user-facing sheets readable while leaving enough structure for bot automation and future AI parsing.

The canonical sheet names and column order are defined in `src/config.ts` under `SHEET_LAYOUTS`. This should remain the single source of truth for append order and header generation so repositories do not rely on hard-coded column positions.

### `Status_Body`

Used for simple body-state records.

Typical entries:

- Body weight
- Bowel movement records
- Menstrual status
- Sleep records

Recommended headers:

```text
记录ID(entry_id)	记录时间(logged_at)	记录类型(entry_type)	数值(value)	单位(unit)	备注(note)	周期天数(cycle_day)	睡眠开始时间(sleep_start_at)	睡眠结束时间(sleep_end_at)	睡眠时长小时(sleep_hours)
```

### `Workout_Log`

Used for structured workout records that are too detailed to share the same row model as simple body-state events.

Typical entries:

- Workout name
- Linked workout video URL
- Workout intensity level
- Duration
- Heart-rate metrics
- Calories burned

Recommended headers:

```text
运动ID(workout_id)	记录时间(logged_at)	运动名称(workout_name)	运动视频链接(workout_video_url)	运动等级(workout_level)	运动时长分钟(duration_min)	平均心率(avg_hr)	最高心率(max_hr)	最低心率(min_hr)	消耗卡路里(calories_kcal)	备注(note)
```

### `Master_Stock`

Used for the current state of food inventory.

Typical entries:

- Current quantity on hand
- Purchase date
- Last update time
- Purchase channel
- Optional nutrition reference link

Recommended headers:

```text
库存ID(stock_item_id)	食材名称(item_name)	当前数量(quantity)	单位(unit)	购入日期(purchased_at)	更新时间(updated_at)	购买渠道(purchase_channel)	关联热量参考ID(linked_food_ref_id)	备注(note)
```

### `Journal_Food`

Used as the main food journal. This sheet should stay readable and diary-like: one row per meal event rather than one row per ingredient.

Typical entries:

- Meal type
- Natural-language meal description
- Estimated total calories
- AI parse status

Recommended headers:

```text
饮食记录ID(journal_entry_id)	记录时间(logged_at)	餐次类型(meal_type)	饮食内容(meal_text)	估算热量(estimated_calories)	AI拆解状态(parse_status)	备注(note)
```

### `Journal_Food_Items`

Used as the detail layer behind `Journal_Food`. This tab is intended for AI or structured parsing output rather than daily manual editing.

Typical entries:

- Ingredient or food item name
- Quantity and unit
- Item-level calorie estimate
- Linked calorie reference ID
- Linked stock item ID
- AI confidence

Recommended headers:

```text
父饮食记录ID(parent_journal_entry_id)	项目名称(item_name)	数量(quantity)	单位(unit)	估算热量(estimated_calories)	关联热量参考ID(linked_food_ref_id)	关联库存ID(linked_stock_item_id)	AI置信度(ai_confidence)	备注(note)
```

### `All_Logs`

Used as a minimal bot processing log rather than a full audit warehouse.

Typical entries:

- Raw user input
- Handling mode (`command`, `rule`, or `ai`)
- Final status
- Short failure or processing note

Recommended headers:

```text
记录时间(logged_at)	原始输入(raw_text)	处理方式(handling_mode)	处理结果(status)	备注(note)
```

### `Ref_Calories`

Used as a reusable calorie and nutrition reference table.

Typical entries:

- Food name and brand
- Reference serving size and unit
- Calories and macro values
- Data source
- Update note

Recommended headers:

```text
热量参考ID(food_ref_id)	食物名称(food_name)	品牌(brand)	份量数值(serving_size)	份量单位(serving_unit)	热量千卡(calories_kcal)	蛋白质克(protein_g)	脂肪克(fat_g)	碳水克(carbs_g)	数据来源(source)	更新时间(updated_at)	备注(note)
```

## Project Structure

- `src/`: TypeScript source code. You can continue to split modules and import additional libraries here.
- `scripts/`: Local build and utility scripts.
- `dist/`: Build output directory used by clasp push.
- `appsscript.json`: GAS manifest copied into `dist/` during the build.

## Local Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm push
```

Create either `.env` or `.env.local` locally. Both files are ignored by [/.gitignore](.gitignore) and will not be committed to GitHub.

```env
SHEET_ID=your_google_sheet_id
BOT_TOKEN=your_telegram_bot_token
MY_CHAT_ID=your_chat_id
GAS_SCRIPT_ID=your_google_apps_script_id
GAS_DEPLOYMENT_ID=optional_existing_deployment_id
```

Notes:

- `SHEET_ID`, `BOT_TOKEN`, and `MY_CHAT_ID` are injected into the final GAS artifact during `pnpm build`.
- `GAS_SCRIPT_ID` is used to generate `.clasp.json` when running `pnpm push` or `pnpm deploy`, so `.clasp.json` does not need to be committed.
- `GAS_DEPLOYMENT_ID` is only used by local `pnpm deploy`. If it is present, the existing deployment is updated; otherwise a new deployment is created.

## Current Bot Scope

The current bot is already able to receive Telegram messages and process them through Google Apps Script. The base spreadsheet and webhook wiring are already complete.

The current implementation should be treated as the first working layer rather than the final product. The intended long-term interaction model is natural language first, rather than requiring the user to memorize Telegram bot commands.

## GitHub Actions

Workflows:

- `.github/workflows/validate.yml`: Pull request validation running lint, typecheck, and build.
- `.github/workflows/deploy.yml`: On push to `main`, installs dependencies, validates, builds, runs `clasp push`, and creates or updates a deployment.

Configure these GitHub repository secrets:

- `CLASPRC_JSON`: The full contents of your local `~/.clasprc.json`.
- `SHEET_ID`: The production Google Sheet ID.
- `BOT_TOKEN`: The production Telegram bot token.
- `MY_CHAT_ID`: The allowed production chat ID.
- `GAS_SCRIPT_ID`: The target Google Apps Script project ID used to generate `.clasp.json` in Actions.
- `GAS_DEPLOYMENT_ID`: Optional. If provided, the same web app deployment is updated continuously; otherwise a new deployment is created each time.

## Notes

`.clasp.json` is generated at runtime by local scripts and GitHub Actions, so it no longer needs to be committed. The generated config still uses `rootDir = dist`, which means the code pushed to GAS is always the compiled JavaScript output rather than the TypeScript source.

GitHub Actions cannot read your uncommitted local `.env` files, so cloud deployment must use GitHub Secrets or Variables instead of relying on local environment files.

## Roadmap

The following items are planned next, but are not yet implemented here.

### 1. Natural-language-first interaction

- Reduce or remove dependence on memorized Telegram bot commands.
- Let the user send normal language messages and have the bot infer intent.
- Add an intent parsing layer before sheet write operations.

### 2. Gemini API integration

- Integrate Gemini API for more natural bot replies.
- Use AI to classify user intent and generate structured actions.
- Introduce response safeguards so AI output cannot directly corrupt sheet data.

### 3. Calorie estimation workflow

- Estimate calories for common foods and ingredients.
- Reuse data from `Ref_Calories` before falling back to estimation.
- Add ingredient normalization so repeated foods are handled consistently.

### 4. Inventory-aware food logging

- Connect `Journal_Food` entries with `Master_Stock` deductions.
- Add a stock consumption model for home-cooked meals.
- Flag missing stock assumptions instead of silently deducting incorrect amounts.

### 5. Nutrition label image parsing

- Allow users to send photos of product nutrition labels.
- Extract calories and macro information automatically.
- Insert parsed values into `Ref_Calories` for future reuse.

### 6. Restaurant meal photo estimation

- Allow users to send food photos when eating outside.
- Use AI to estimate portion size and calories when exact quantities are unknown.
- Store confidence or uncertainty metadata alongside the estimate.

### 7. Data model refinement

- Revisit the spreadsheet schema once the real usage pattern becomes clearer.
- Standardize identifiers for foods, stock items, and journal entries.
- Decide which fields belong in raw logs versus structured tables.

### 8. Operational hardening

- Add validation and error handling around sheet writes.
- Add safer rollback behavior for partial multi-sheet updates.
- Introduce more explicit deployment and environment documentation.
