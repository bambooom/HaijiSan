import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

loadEnv({ path: path.join(projectRoot, '.env') });
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const appConfig = {
  SHEET_ID: getRequiredEnv('SHEET_ID'),
  BOT_TOKEN: getRequiredEnv('BOT_TOKEN'),
  MY_CHAT_ID: getRequiredEnv('MY_CHAT_ID'),
};

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

await build({
  entryPoints: [path.join(projectRoot, 'src', 'index.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2019'],
  outfile: path.join(distDir, 'Code.js'),
  logLevel: 'info',
  legalComments: 'none',
  define: {
    __APP_CONFIG__: JSON.stringify(appConfig),
  },
});

copyFileSync(
  path.join(projectRoot, 'appsscript.json'),
  path.join(distDir, 'appsscript.json'),
);
