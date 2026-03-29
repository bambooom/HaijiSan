import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'pnpm',
  ['exec', 'clasp', 'run', 'validateSheetHeaders'],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
