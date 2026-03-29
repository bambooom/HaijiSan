import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

loadEnv({ path: path.join(projectRoot, '.env') });
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const deploymentId = process.env.GAS_DEPLOYMENT_ID;
const args = ['exec', 'clasp', 'create-deployment'];

if (deploymentId) {
  args.push('--deploymentId', deploymentId);
}

const result = spawnSync('pnpm', args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
