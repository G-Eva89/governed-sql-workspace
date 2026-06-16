import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_DATABASE_URL =
  'postgresql://app:app@localhost:5433/workspace_app';

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separator = trimmed.indexOf('=');
  if (separator === -1) {
    return null;
  }

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function findMonorepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
}

function applyEnvFile(envPath: string): void {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }
    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadEnvFiles(startDir = process.cwd()): string | null {
  const root = findMonorepoRoot(startDir);
  const candidates = [
    resolve(root, '.env'),
    resolve(root, '.env.local'),
    resolve(startDir, '.env'),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) {
      continue;
    }
    applyEnvFile(envPath);
    return envPath;
  }

  return null;
}

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }

  return DEFAULT_DATABASE_URL;
}

export function requireDatabaseUrl(): string {
  const loadedFrom = loadEnvFiles();
  const url = getDatabaseUrl();

  if (!process.env.DATABASE_URL && !loadedFrom) {
    console.log(
      `DATABASE_URL not set; using local default (${DEFAULT_DATABASE_URL}).`,
    );
    console.log('Copy .env.example to .env to customize (optional).');
  }

  return url;
}
