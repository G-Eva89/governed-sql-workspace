import { afterAll, describe, expect, it } from 'vitest';
import { AuthService, ConnectionService } from '@governed-sql/core';
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

describe('API', () => {
  const { db, sql } = createDb(databaseUrl);
  const app = createApp({
    db,
    authService: new AuthService(db),
    connectionService: new ConnectionService(db),
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
