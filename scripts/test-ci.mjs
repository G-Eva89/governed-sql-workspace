import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWindows,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNodeScript(scriptName, args = []) {
  run(process.execPath, [resolve(rootDir, 'scripts', scriptName), ...args]);
}

async function waitForPostgres() {
  const maxAttempts = 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(
      'docker',
      ['exec', 'gsw-app-db', 'pg_isready', '-U', 'app', '-d', 'workspace_app'],
      { cwd: rootDir, stdio: 'pipe', shell: isWindows },
    );

    if (result.status === 0) {
      return;
    }

    await sleep(1000);
  }

  console.error('Timed out waiting for app-db to become ready');
  process.exit(1);
}

console.log('Starting Docker services...');
run('docker', ['compose', 'up', '-d']);

console.log('Waiting for app-db...');
await waitForPostgres();

console.log('Ensuring environment and applying migrations...');
runNodeScript('ensure-env.mjs');

const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm';
run(pnpmCmd, ['db:migrate']);
run(pnpmCmd, ['db:seed']);

console.log('Loading Pagila target database (skips if already present)...');
runNodeScript('run-seed-target.mjs');

console.log('Running unit and integration tests...');
run(pnpmCmd, ['test:all']);

console.log('CI test run completed successfully.');
