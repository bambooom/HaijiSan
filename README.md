# HaijiSan

This project uses local TypeScript development for Google Apps Script and deploys compiled artifacts through clasp.

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
