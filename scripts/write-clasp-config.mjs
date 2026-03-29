import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

loadEnv({ path: path.join(projectRoot, '.env') });
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const scriptId = process.env.GAS_SCRIPT_ID;

if (!scriptId) {
  throw new Error('Missing required environment variable: GAS_SCRIPT_ID');
}

const claspConfig = {
  scriptId,
  rootDir: 'dist',
  scriptExtensions: ['.js', '.gs'],
  htmlExtensions: ['.html'],
  jsonExtensions: ['.json'],
  filePushOrder: [],
  skipSubdirectories: false,
};

writeFileSync(
  path.join(projectRoot, '.clasp.json'),
  `${JSON.stringify(claspConfig, null, 2)}\n`,
);
