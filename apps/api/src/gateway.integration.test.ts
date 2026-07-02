import { afterAll, describe, expect, it } from 'vitest';
import {
  AuditService,
  AuthService,
  ConnectionService,
  MetadataService,
  PolicyEngine,
  QueryService,
} from '@governed-sql/core';
import { createDb, loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';
import type { Hono } from 'hono';
import { createApp } from './app.js';
import type { ApiBindings } from './types.js';

loadEnvFiles();

const databaseUrl = process.env.DATABASE_URL ?? requireDatabaseUrl();
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';

async function loginAsAdmin(app: Hono<ApiBindings>): Promise<string> {
  const response = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });

  const cookie = response.headers.get('set-cookie');
  if (!response.ok || !cookie) {
    throw new Error('Failed to log in as admin for tests');
  }

  return cookie;
}

async function getPagilaConnectionId(app: Hono<ApiBindings>, cookie: string): Promise<string> {
  const listResponse = await app.request('/connections', {
    headers: { Cookie: cookie },
  });
  const listBody = (await listResponse.json()) as {
    connections: Array<{ id: string; name: string }>;
  };
  const pagila = listBody.connections.find((item) => item.name === 'Pagila Demo');
  if (!pagila) {
    throw new Error('Pagila Demo connection not found');
  }
  return pagila.id;
}

describe('Governed SQL gateway integration', () => {
  const { db, sql } = createDb(databaseUrl);
  const connectionService = new ConnectionService(db);
  const auditService = new AuditService(db);
  const queryService = new QueryService(connectionService, new PolicyEngine(), auditService);
  const app = createApp({
    db,
    authService: new AuthService(db),
    connectionService,
    metadataService: new MetadataService(connectionService),
    queryService,
    auditService,
  });

  it('happy path: governed SELECT returns rows from Pagila', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionId = await getPagilaConnectionId(app, cookie);

    const response = await app.request(`/connections/${connectionId}/query`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'SELECT film_id, title FROM film ORDER BY film_id LIMIT 3',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      rowCount: number;
      columns: string[];
      rows: Array<Record<string, unknown>>;
    };
    expect(body.rowCount).toBe(3);
    expect(body.columns).toContain('title');
    expect(body.rows[0]?.title).toBeTruthy();

    const auditResponse = await app.request('/audit?limit=5', {
      headers: { Cookie: cookie },
    });
    const auditBody = (await auditResponse.json()) as {
      events: Array<{ status: string; sqlPreview: string | null; rowCount: number | null }>;
    };
    const successEvent = auditBody.events.find(
      (event) =>
        event.status === 'success' &&
        event.sqlPreview?.includes('SELECT film_id, title FROM film') === true,
    );
    expect(successEvent).toBeTruthy();
    expect(successEvent?.rowCount).toBe(3);
  });

  it('rejects DELETE and writes a policy_violation audit row', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionId = await getPagilaConnectionId(app, cookie);
    const rejectedSql = 'DELETE FROM film WHERE film_id = 1';

    const response = await app.request(`/connections/${connectionId}/query`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: rejectedSql }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('POLICY_VIOLATION');

    const auditResponse = await app.request('/audit?limit=10', {
      headers: { Cookie: cookie },
    });
    const auditBody = (await auditResponse.json()) as {
      events: Array<{
        status: string;
        sqlPreview: string | null;
        errorCode: string | null;
        durationMs: number | null;
      }>;
    };
    const failureEvent = auditBody.events.find((event) => event.sqlPreview === rejectedSql);
    expect(failureEvent).toBeTruthy();
    expect(failureEvent?.status).toBe('policy_violation');
    expect(failureEvent?.errorCode).toBe('POLICY_VIOLATION');
    expect(failureEvent?.durationMs).not.toBeNull();
  });

  afterAll(async () => {
    await sql.end();
  });
});
