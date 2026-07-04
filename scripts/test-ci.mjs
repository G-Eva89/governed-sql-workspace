import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

const DATABASES = [
  {
    name: 'app-db',
    container: 'gsw-app-db',
    user: 'app',
    database: 'workspace_app',
  },
  {
    name: 'target-db',
    container: 'gsw-target-db',
    user: 'postgres',
    database: null,
  },
];

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

async function waitForDatabase({ name, container, user, database }) {
  const maxAttempts = 90;
  const pgIsReadyArgs = database
    ? ['exec', container, 'pg_isready', '-U', user, '-d', database]
    : ['exec', container, 'pg_isready', '-U', user];

  console.log(`Waiting for ${name} (${container})...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync('docker', pgIsReadyArgs, {
      cwd: rootDir,
      stdio: 'pipe',
      shell: isWindows,
    });

    if (result.status === 0) {
      console.log(`${name} is ready.`);
      return;
    }

    await sleep(1000);
  }

  console.error(`Timed out waiting for ${name} to become ready`);
  process.exit(1);
}

async function waitForDatabases() {
  for (const database of DATABASES) {
    await waitForDatabase(database);
  }
}

function startDockerServices() {
  console.log('Starting Docker services...');

  const waitResult = spawnSync('docker', ['compose', 'up', '-d', '--wait'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWindows,
  });

  if (waitResult.status === 0) {
    console.log('Docker services are healthy.');
    return;
  }

  console.warn('docker compose --wait failed; falling back to manual health checks.');
  run('docker', ['compose', 'up', '-d']);
}

console.log('Starting CI test run...');
startDockerServices();
await waitForDatabases();

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
