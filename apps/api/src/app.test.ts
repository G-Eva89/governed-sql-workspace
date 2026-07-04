import { afterAll, describe, expect, it } from 'vitest';
import {
  ApiKeyService,
  AuditService,
  AuthService,
  ConnectionService,
  MetadataService,
  PolicyEngine,
  QueryService,
} from '@governed-sql/core';
import { connections, createDb, loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';
import { eq } from 'drizzle-orm';
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

describe('API', () => {
  const { db, sql } = createDb(databaseUrl);
  const connectionService = new ConnectionService(db);
  const auditService = new AuditService(db);
  const queryService = new QueryService(connectionService, new PolicyEngine(), auditService);
  const apiKeyService = new ApiKeyService(db);
  const app = createApp({
    db,
    authService: new AuthService(db),
    apiKeyService,
    connectionService,
    metadataService: new MetadataService(connectionService),
    queryService,
    auditService,
  });
  const createdConnectionNames: string[] = [];

  it('GET /health returns ok', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(response.headers.get('X-Request-Id')).toMatch(/^req_/);
  });

  it('GET /ready reports database connectivity', async () => {
    const response = await app.request('/ready');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; database: string };
    expect(body.ok).toBe(true);
    expect(body.database).toBe('connected');
  });

  it('POST /auth/login rejects invalid credentials with structured error', async () => {
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: 'wrong-password',
      }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.requestId).toMatch(/^req_/);
  });

  it('POST /auth/login sets session cookie for seeded admin', async () => {
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { email: string }; role: string };
    expect(body.user.email).toBe(adminEmail);
    expect(body.role).toBe('admin');
    expect(response.headers.get('set-cookie')).toContain('gsw_session=');
  });

  it('GET /auth/me requires authentication', async () => {
    const response = await app.request('/auth/me');
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /auth/me returns current user when session cookie is present', async () => {
    const cookie = await loginAsAdmin(app);
    const meResponse = await app.request('/auth/me', {
      headers: { Cookie: cookie },
    });

    expect(meResponse.status).toBe(200);
    const body = (await meResponse.json()) as { org: { name: string }; role: string };
    expect(body.org.name).toBeTruthy();
    expect(body.role).toBe('admin');
  });

  it('GET /connections requires authentication', async () => {
    const response = await app.request('/connections');
    expect(response.status).toBe(401);
  });

  it('GET /connections lists seeded Pagila connection', async () => {
    const cookie = await loginAsAdmin(app);
    const response = await app.request('/connections', {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { connections: Array<{ name: string }> };
    expect(body.connections.some((item) => item.name === 'Pagila Demo')).toBe(true);
  });

  it('POST /connections rejects invalid target credentials', async () => {
    const cookie = await loginAsAdmin(app);
    const response = await app.request('/connections', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invalid Target',
        host: 'localhost',
        port: 5434,
        database: 'pagila',
        username: 'pagila_ro',
        password: 'not-the-right-password',
        sslMode: 'disable',
      }),
    });

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('CONNECTION_ERROR');
  });

  it('POST /connections stores encrypted credentials after successful ping', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionName = `API Test ${Date.now()}`;
    createdConnectionNames.push(connectionName);

    const response = await app.request('/connections', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: connectionName,
        host: 'localhost',
        port: 5434,
        database: 'pagila',
        username: 'pagila_ro',
        password: 'pagila_ro',
        sslMode: 'disable',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      id: string;
      name: string;
      password?: string;
    };
    expect(body.name).toBe(connectionName);
    expect(body.password).toBeUndefined();

    const [row] = await db
      .select({ passwordCiphertext: connections.passwordCiphertext })
      .from(connections)
      .where(eq(connections.name, connectionName))
      .limit(1);

    expect(row?.passwordCiphertext).toMatch(/^v1:/);
    expect(row?.passwordCiphertext).not.toContain('pagila_ro');

    const testResponse = await app.request(`/connections/${body.id}/test`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(testResponse.status).toBe(200);
    const testBody = (await testResponse.json()) as { ok: boolean };
    expect(testBody.ok).toBe(true);
  });

  it('PATCH /connections/:id allows admin to disable a connection', async () => {
    const cookie = await loginAsAdmin(app);
    const listResponse = await app.request('/connections', {
      headers: { Cookie: cookie },
    });
    const listBody = (await listResponse.json()) as {
      connections: Array<{ id: string; name: string; status: string }>;
    };
    const pagila = listBody.connections.find((item) => item.name === 'Pagila Demo');
    expect(pagila).toBeTruthy();

    const patchResponse = await app.request(`/connections/${pagila!.id}`, {
      method: 'PATCH',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'disabled' }),
    });

    expect(patchResponse.status).toBe(200);
    const patchBody = (await patchResponse.json()) as { status: string };
    expect(patchBody.status).toBe('disabled');

    await app.request(`/connections/${pagila!.id}`, {
      method: 'PATCH',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'active' }),
    });
  });

  it('GET /connections/:id/tables returns Pagila tables', async () => {
    const cookie = await loginAsAdmin(app);
    const listResponse = await app.request('/connections', {
      headers: { Cookie: cookie },
    });
    const listBody = (await listResponse.json()) as {
      connections: Array<{ id: string; name: string }>;
    };
    const pagila = listBody.connections.find((item) => item.name === 'Pagila Demo');
    expect(pagila).toBeTruthy();

    const response = await app.request(`/connections/${pagila!.id}/tables`, {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      tables: Array<{ schema: string; name: string; type: string }>;
    };
    const tableNames = body.tables.map((table) => table.name);
    expect(tableNames).toContain('film');
    expect(tableNames).toContain('rental');
    expect(body.tables.every((table) => table.schema === 'public')).toBe(true);
  });

  it('GET /connections/:id/tables/:tableName describes Pagila film columns', async () => {
    const cookie = await loginAsAdmin(app);
    const listResponse = await app.request('/connections', {
      headers: { Cookie: cookie },
    });
    const listBody = (await listResponse.json()) as {
      connections: Array<{ id: string; name: string }>;
    };
    const pagila = listBody.connections.find((item) => item.name === 'Pagila Demo');
    expect(pagila).toBeTruthy();

    const response = await app.request(`/connections/${pagila!.id}/tables/film`, {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      table: { schema: string; name: string };
      columns: Array<{ name: string; dataType: string }>;
    };
    expect(body.table).toEqual({ schema: 'public', name: 'film' });
    const columnNames = body.columns.map((column) => column.name);
    expect(columnNames).toContain('film_id');
    expect(columnNames).toContain('title');
  });

  it('GET /connections/:id/tables requires authentication', async () => {
    const response = await app.request('/connections/00000000-0000-0000-0000-000000000001/tables');
    expect(response.status).toBe(401);
  });

  it('POST /connections/:id/query returns Pagila film rows', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionId = await getPagilaConnectionId(app, cookie);

    const response = await app.request(`/connections/${connectionId}/query`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'SELECT film_id, title FROM film ORDER BY film_id LIMIT 5',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      columns: string[];
      rows: Array<Record<string, unknown>>;
      rowCount: number;
      truncated: boolean;
    };
    expect(body.columns).toContain('film_id');
    expect(body.columns).toContain('title');
    expect(body.rowCount).toBe(5);
    expect(body.rows).toHaveLength(5);
    expect(body.rows[0]?.title).toBeTruthy();
    expect(body.truncated).toBe(false);
  });

  it('POST /connections/:id/query rejects DELETE and records audit', async () => {
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

    const auditResponse = await app.request('/audit?limit=5', {
      headers: { Cookie: cookie },
    });
    expect(auditResponse.status).toBe(200);
    const auditBody = (await auditResponse.json()) as {
      events: Array<{
        status: string;
        sqlPreview: string | null;
        errorCode: string | null;
        principalType: string;
      }>;
    };
    const event = auditBody.events.find((item) => item.sqlPreview === rejectedSql);
    expect(event).toBeTruthy();
    expect(event?.status).toBe('policy_violation');
    expect(event?.errorCode).toBe('POLICY_VIOLATION');
    expect(event?.principalType).toBe('user');
  });

  it('GET /audit returns paginated query history', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionId = await getPagilaConnectionId(app, cookie);

    await app.request(`/connections/${connectionId}/query`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: 'SELECT COUNT(*) AS total FROM film' }),
    });

    const response = await app.request('/audit?page=1&limit=10', {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      events: Array<{ action: string; source: string; durationMs: number | null }>;
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.total).toBeGreaterThan(0);
    expect(body.events.some((event) => event.action === 'run_query' && event.source === 'web')).toBe(
      true,
    );
    expect(body.events[0]?.durationMs).not.toBeNull();
  });

  it('GET /audit requires authentication', async () => {
    const response = await app.request('/audit');
    expect(response.status).toBe(401);
  });

  it('POST /api-keys creates a key for admin and returns secret once', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionId = await getPagilaConnectionId(app, cookie);

    const response = await app.request('/api-keys', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Test Key ${Date.now()}`,
        scopes: [connectionId],
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      id: string;
      secret: string;
      keyPrefix: string;
      scopes: string[];
    };
    expect(body.secret.startsWith('gsw_')).toBe(true);
    expect(body.keyPrefix).toBe(body.secret.slice(0, 8));
    expect(body.scopes).toEqual([connectionId]);
  });

  it('POST /connections/:id/query accepts Bearer API key auth', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionId = await getPagilaConnectionId(app, cookie);

    const createResponse = await app.request('/api-keys', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Bearer Test ${Date.now()}`,
        scopes: [connectionId],
      }),
    });
    const created = (await createResponse.json()) as { secret: string; id: string };

    const response = await app.request(`/connections/${connectionId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${created.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'SELECT film_id, title FROM film ORDER BY film_id LIMIT 2',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { rowCount: number };
    expect(body.rowCount).toBe(2);

    const auditResponse = await app.request('/audit?limit=10', {
      headers: { Cookie: cookie },
    });
    const auditBody = (await auditResponse.json()) as {
      events: Array<{ principalType: string; source: string; principalId: string }>;
    };
    const apiKeyEvent = auditBody.events.find(
      (event) => event.principalId === created.id && event.source === 'api',
    );
    expect(apiKeyEvent).toBeTruthy();
    expect(apiKeyEvent?.principalType).toBe('api_key');

    await app.request(`/api-keys/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
  });

  it('rejects API key scoped to a different connection', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionId = await getPagilaConnectionId(app, cookie);
    const otherConnectionName = `Scoped Other ${Date.now()}`;
    createdConnectionNames.push(otherConnectionName);

    const otherConnectionResponse = await app.request('/connections', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: otherConnectionName,
        host: 'localhost',
        port: 5434,
        database: 'pagila',
        username: 'pagila_ro',
        password: 'pagila_ro',
        sslMode: 'disable',
      }),
    });
    const otherConnection = (await otherConnectionResponse.json()) as { id: string };

    const createResponse = await app.request('/api-keys', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Scoped Key ${Date.now()}`,
        scopes: [connectionId],
      }),
    });
    const created = (await createResponse.json()) as { secret: string; id: string };

    const response = await app.request(`/connections/${otherConnection.id}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${created.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: 'SELECT 1 AS ok' }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');

    await app.request(`/api-keys/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
  });

  it('returns structured 404 for unknown routes', async () => {
    const response = await app.request('/does-not-exist');
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  afterAll(async () => {
    for (const name of createdConnectionNames) {
      await db.delete(connections).where(eq(connections.name, name));
    }
    await sql.end();
  });
});
