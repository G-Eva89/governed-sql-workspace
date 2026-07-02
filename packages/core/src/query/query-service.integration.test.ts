import { afterAll, describe, expect, it } from 'vitest';
import {
  AuditService,
  AuthService,
  ConnectionService,
  PolicyEngine,
  QueryService,
} from '@governed-sql/core';
import { createDb, loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';
import { closeAllTargetClients } from '../connections/target-client.js';

loadEnvFiles();

const databaseUrl = process.env.DATABASE_URL ?? requireDatabaseUrl();
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';

type QueryContext = {
  orgId: string;
  userId: string;
  connectionId: string;
};

async function resolveQueryContext(
  authService: AuthService,
  connectionService: ConnectionService,
): Promise<QueryContext> {
  const login = await authService.login(adminEmail, adminPassword);
  const items = await connectionService.list(login.session.org.id);
  const pagila = items.find((item) => item.name === 'Pagila Demo');
  if (!pagila) {
    throw new Error('Pagila Demo connection not found');
  }

  return {
    orgId: login.session.org.id,
    userId: login.session.user.id,
    connectionId: pagila.id,
  };
}

describe('QueryService policy integration', () => {
  const { db, sql } = createDb(databaseUrl);
  const authService = new AuthService(db);
  const connectionService = new ConnectionService(db);
  const auditService = new AuditService(db);
  const queryService = new QueryService(connectionService, new PolicyEngine(), auditService);

  let context: QueryContext;

  it('runs a governed SELECT against Pagila', async () => {
    context = await resolveQueryContext(authService, connectionService);

    const result = await queryService.run({
      orgId: context.orgId,
      connectionId: context.connectionId,
      sql: 'SELECT film_id, title FROM film ORDER BY film_id LIMIT 3',
      principal: { type: 'user', id: context.userId },
      source: 'web',
    });

    expect(result.rowCount).toBe(3);
    expect(result.columns).toContain('title');
    expect(result.truncated).toBe(false);
  });

  it('rejects queries outside the schema allowlist', async () => {
    context ??= await resolveQueryContext(authService, connectionService);

    await expect(
      queryService.run({
        orgId: context.orgId,
        connectionId: context.connectionId,
        sql: 'SELECT relname FROM pg_catalog.pg_class LIMIT 1',
        principal: { type: 'user', id: context.userId },
        source: 'web',
      }),
    ).rejects.toMatchObject({
      code: 'POLICY_VIOLATION',
    });
  });

  it('enforces the configured max row cap', async () => {
    context ??= await resolveQueryContext(authService, connectionService);

    const result = await queryService.run({
      orgId: context.orgId,
      connectionId: context.connectionId,
      sql: 'SELECT film_id FROM film ORDER BY film_id',
      principal: { type: 'user', id: context.userId },
      source: 'web',
    });

    expect(result.rowCount).toBe(500);
    expect(result.truncated).toBe(true);
  });

  it('times out long-running queries within the configured duration', async () => {
    context ??= await resolveQueryContext(authService, connectionService);

    const startedAt = Date.now();

    await expect(
      queryService.run({
        orgId: context.orgId,
        connectionId: context.connectionId,
        sql: 'SELECT pg_sleep(60)',
        principal: { type: 'user', id: context.userId },
        source: 'web',
      }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeGreaterThan(1000);
    expect(elapsedMs).toBeLessThan(25_000);
  }, 30_000);

  afterAll(async () => {
    await closeAllTargetClients();
    await sql.end();
  });
});
