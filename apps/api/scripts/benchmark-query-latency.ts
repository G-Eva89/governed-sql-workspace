/**
 * Benchmarks POST /connections/:id/query (gateway) against a raw `postgres`
 * connection to the same target database, using identical SQL, to measure
 * the p50/p95 latency overhead added by auth + policy engine + audit logging.
 *
 * Also demonstrates row-cap and statement-timeout enforcement in practice.
 *
 * Prereqs:
 *   - Docker databases up, migrated, seeded (pnpm setup)
 *   - API running: pnpm --filter @governed-sql/api dev
 *
 * Usage:
 *   pnpm --filter @governed-sql/api benchmark
 *
 * Env overrides:
 *   API_BASE_URL          default http://localhost:3001
 *   BENCHMARK_ITERATIONS  default 100
 *   BENCHMARK_WARMUP      default 10
 */
import { loadEnvFiles } from '@governed-sql/db';
import { getTargetSql, type TargetConnectionConfig } from '@governed-sql/core';

loadEnvFiles();

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';
const ITERATIONS = Number(process.env.BENCHMARK_ITERATIONS ?? 100);
const WARMUP = Number(process.env.BENCHMARK_WARMUP ?? 10);

const TARGET_CONFIG: TargetConnectionConfig = {
  host: process.env.PAGILA_CONNECTION_HOST ?? 'localhost',
  port: Number(process.env.PAGILA_CONNECTION_PORT ?? 5434),
  database: process.env.PAGILA_CONNECTION_DATABASE ?? 'pagila',
  username: process.env.PAGILA_CONNECTION_USERNAME ?? 'pagila_ro',
  password: process.env.PAGILA_CONNECTION_PASSWORD ?? 'pagila_ro',
  sslMode: 'disable',
};

type Query = { label: string; sql: string };

const QUERIES: Query[] = [
  { label: 'trivial', sql: 'SELECT 1 AS ok' },
  { label: 'point-lookup', sql: 'SELECT film_id, title, rental_rate FROM film WHERE film_id = 1' },
  {
    label: 'filtered-scan',
    sql: 'SELECT film_id, title FROM film WHERE rental_rate > 2 ORDER BY title LIMIT 50',
  },
  {
    label: 'join',
    sql: `SELECT f.title, c.name
          FROM film f
          JOIN film_category fc ON fc.film_id = f.film_id
          JOIN category c ON c.category_id = fc.category_id
          LIMIT 50`,
  },
];

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

function fmt(ms: number): string {
  return `${ms.toFixed(2)}ms`;
}

async function login(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const cookies = res.headers.getSetCookie();
  if (cookies.length === 0) {
    throw new Error('Login response had no Set-Cookie header');
  }
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function getConnectionId(cookie: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/connections`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) {
    throw new Error(`Failed to list connections: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { connections: Array<{ id: string; name: string }> };
  if (body.connections.length === 0) {
    throw new Error('No connections registered — run pnpm db:seed first');
  }
  const pagila = body.connections.find((c) => c.name === 'Pagila Demo');
  return (pagila ?? body.connections[0]).id;
}

async function timeGatewayQuery(
  cookie: string,
  connectionId: string,
  sql: string,
): Promise<number> {
  const start = performance.now();
  const res = await fetch(`${API_BASE_URL}/connections/${connectionId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ sql }),
  });
  await res.json();
  const elapsed = performance.now() - start;
  if (!res.ok) {
    throw new Error(`Gateway query failed: ${res.status}`);
  }
  return elapsed;
}

async function timeRawQuery(sql: string): Promise<number> {
  const client = getTargetSql(TARGET_CONFIG);
  const start = performance.now();
  await client.unsafe(sql);
  return performance.now() - start;
}

async function benchmarkQuery(cookie: string, connectionId: string, query: Query) {
  for (let i = 0; i < WARMUP; i++) {
    await timeGatewayQuery(cookie, connectionId, query.sql);
    await timeRawQuery(query.sql);
  }

  const gatewaySamples: number[] = [];
  const rawSamples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    gatewaySamples.push(await timeGatewayQuery(cookie, connectionId, query.sql));
    rawSamples.push(await timeRawQuery(query.sql));
  }

  const gw = stats(gatewaySamples);
  const raw = stats(rawSamples);

  console.log(`\n--- ${query.label} ---`);
  console.log(`  gateway  p50=${fmt(gw.p50)}  p95=${fmt(gw.p95)}  mean=${fmt(gw.mean)}`);
  console.log(`  raw psql p50=${fmt(raw.p50)}  p95=${fmt(raw.p95)}  mean=${fmt(raw.mean)}`);
  console.log(
    `  overhead p50=${fmt(gw.p50 - raw.p50)}  p95=${fmt(gw.p95 - raw.p95)}`,
  );
}

async function demonstrateRowCap(cookie: string, connectionId: string) {
  console.log('\n=== Row cap enforcement ===');
  const sql = 'SELECT a.actor_id, f.film_id FROM actor a CROSS JOIN film f';

  const countRes = await fetch(`${API_BASE_URL}/connections/${connectionId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ sql: 'SELECT COUNT(*) AS n FROM actor CROSS JOIN film' }),
  });
  const countBody = (await countRes.json()) as { rows: Array<{ n: string }> };
  const fullMatchCount = countBody.rows[0]?.n ?? 'unknown';

  const res = await fetch(`${API_BASE_URL}/connections/${connectionId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ sql }),
  });
  const body = (await res.json()) as { rowCount: number; truncated: boolean };
  console.log(`  query would match ${fullMatchCount} rows`);
  console.log(`  gateway returned ${body.rowCount} rows, truncated=${body.truncated}`);
}

async function demonstrateTimeout(cookie: string, connectionId: string) {
  console.log('\n=== Statement timeout enforcement ===');
  const start = performance.now();
  const res = await fetch(`${API_BASE_URL}/connections/${connectionId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ sql: 'SELECT pg_sleep(20)' }),
  });
  const elapsed = performance.now() - start;
  const body = (await res.json()) as { error?: { code: string; message: string } };
  console.log(`  request failed after ${fmt(elapsed)} (status ${res.status})`);
  console.log(`  error: ${body.error?.code} — ${body.error?.message}`);
}

async function main() {
  console.log(`API_BASE_URL=${API_BASE_URL}  iterations=${ITERATIONS}  warmup=${WARMUP}`);

  const cookie = await login();
  const connectionId = await getConnectionId(cookie);
  console.log(`Using connection ${connectionId}`);

  for (const query of QUERIES) {
    await benchmarkQuery(cookie, connectionId, query);
  }

  await demonstrateRowCap(cookie, connectionId);
  await demonstrateTimeout(cookie, connectionId);

  const client = getTargetSql(TARGET_CONFIG);
  await client.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
