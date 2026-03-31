import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const sheetLayoutsPath = path.join(projectRoot, 'src', 'sheet-layouts.json');

loadEnv({ path: path.join(projectRoot, '.env') });
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name, fallbackValue) {
  return process.env[name] || fallbackValue;
}

const appConfig = {
  SHEET_ID: getRequiredEnv('SHEET_ID'),
  BOT_TOKEN: getRequiredEnv('BOT_TOKEN'),
  MY_CHAT_ID: getRequiredEnv('MY_CHAT_ID'),
  GEMINI_API_KEY: getRequiredEnv('GEMINI_API_KEY'),
  GEMINI_MODEL: getOptionalEnv('GEMINI_MODEL', 'gemini-2.0-flash'),
};

const sheetLayouts = JSON.parse(readFileSync(sheetLayoutsPath, 'utf8'));
const adminSheetLayouts = Object.values(sheetLayouts).map((layout) => ({
  name: layout.name,
  headers: layout.headers,
}));

async function buildGasEntry(
  entryFile,
  outputFile,
  { bundle = true, format = 'iife', define = {} } = {},
) {
  await build({
    entryPoints: [path.join(projectRoot, 'src', ...entryFile)],
    bundle,
    format,
    platform: 'browser',
    target: ['es2019'],
    outfile: path.join(distDir, outputFile),
    logLevel: 'info',
    legalComments: 'none',
    define,
  });
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

await buildGasEntry(['index.ts'], 'Code.js', {
  define: {
    __APP_CONFIG__: JSON.stringify(appConfig),
  },
});

await buildGasEntry(['gas', 'sheet-styler.ts'], 'Styler.js', {
  bundle: false,
  format: 'esm',
});

await buildGasEntry(['gas', 'sheet-admin.ts'], 'SheetAdmin.js', {
  bundle: false,
  format: 'esm',
  define: {
    __SHEET_LAYOUTS__: JSON.stringify(adminSheetLayouts),
  },
});

copyFileSync(
  path.join(projectRoot, 'appsscript.json'),
  path.join(distDir, 'appsscript.json'),
);
