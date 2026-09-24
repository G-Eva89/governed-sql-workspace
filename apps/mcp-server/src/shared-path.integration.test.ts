import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ApiKeyService,
  AuditService,
  AuthService,
  ConnectionService,
  MetadataService,
  PolicyEngine,
  QueryService,
} from '@governed-sql/core';
import type { AuditEventPublic } from '@governed-sql/schemas';
import { connections, createDb, loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { createApp } from '../../api/src/app.js';
import type { ApiBindings } from '../../api/src/types.js';
import { createRuntime, type McpRuntime } from './runtime.js';
import { handleDescribeTable, handleListTables } from './tools/metadata/handlers.js';
import { handleGetQueryHistory, handleRunQuery } from './tools/query/handlers.js';

loadEnvFiles();

const databaseUrl = process.env.DATABASE_URL ?? requireDatabaseUrl();
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';

type ComparableAudit = {
  action: string;
  status: string;
  errorCode: string | null;
  sqlPreview: string | null;
  rowCount: number | null;
};

function comparableAudit(event: AuditEventPublic): ComparableAudit {
  return {
    action: event.action,
    status: event.status,
    errorCode: event.errorCode,
    sqlPreview: event.sqlPreview,
    rowCount: event.rowCount,
  };
}

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

describe('shared gateway path: HTTP and MCP use the same core services', () => {
  const { db, sql } = createDb(databaseUrl);
  const connectionService = new ConnectionService(db);
  const auditService = new AuditService(db);
  const queryService = new QueryService(connectionService, new PolicyEngine(), auditService);
  const app = createApp({
    db,
    authService: new AuthService(db),
    apiKeyService: new ApiKeyService(db),
    connectionService,
    metadataService: new MetadataService(connectionService),
    queryService,
    auditService,
  });

  let pagilaConnectionId: string;
  let orgId: string;
  let mcpRuntime: McpRuntime;
  let apiKeySecret: string;
  let createdKeyId: string;

  beforeAll(async () => {
    const cookie = await loginAsAdmin(app);
    const meResponse = await app.request('/auth/me', { headers: { Cookie: cookie } });
    const meBody = (await meResponse.json()) as { org: { id: string }; user: { id: string } };
    orgId = meBody.org.id;

    const [pagila] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(eq(connections.name, 'Pagila Demo'))
      .limit(1);
    if (!pagila) {
      throw new Error('Pagila Demo connection not found');
    }
    pagilaConnectionId = pagila.id;

    const apiKeyService = new ApiKeyService(db);
    const created = await apiKeyService.create(orgId, {
      name: `Shared Path ${Date.now()}`,
      scopes: [pagilaConnectionId],
    });
    createdKeyId = created.id;
    apiKeySecret = created.secret;

    mcpRuntime = await createRuntime({
      databaseUrl,
      apiKey: apiKeySecret,
    });
  });

  it('returns identical SELECT results via web session and MCP run_query', async () => {
    const sql = 'SELECT film_id, title FROM film ORDER BY film_id LIMIT 2';
    const cookie = await loginAsAdmin(app);

    const webResponse = await app.request(`/connections/${pagilaConnectionId}/query`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    });
    expect(webResponse.status).toBe(200);
    const webBody = (await webResponse.json()) as {
      columns: string[];
      rows: Array<Record<string, unknown>>;
      rowCount: number;
      truncated: boolean;
    };

    const mcpBody = await handleRunQuery(mcpRuntime, { sql });

    expect(mcpBody.columns).toEqual(webBody.columns);
    expect(mcpBody.rowCount).toBe(webBody.rowCount);
    expect(mcpBody.truncated).toBe(webBody.truncated);
    expect(mcpBody.rows).toEqual(webBody.rows);
  });

  it('returns identical SELECT results via HTTP Bearer API key and MCP run_query', async () => {
    const sql = 'SELECT film_id, title FROM film ORDER BY film_id LIMIT 2';

    const apiResponse = await app.request(`/connections/${pagilaConnectionId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKeySecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });
    expect(apiResponse.status).toBe(200);
    const apiBody = (await apiResponse.json()) as { rowCount: number; rows: unknown[] };

    const mcpBody = await handleRunQuery(mcpRuntime, { sql });
    expect(mcpBody.rowCount).toBe(apiBody.rowCount);
    expect(mcpBody.rows).toEqual(apiBody.rows);
  });

  it('records equivalent audit rows for web vs MCP queries differing only by source metadata', async () => {
    const sql = `SELECT film_id FROM film ORDER BY film_id LIMIT 1 /* shared-path-${Date.now()} */`;

    const cookie = await loginAsAdmin(app);
    await app.request(`/connections/${pagilaConnectionId}/query`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    });

    await handleRunQuery(mcpRuntime, { sql });

    const orgAudit = await auditService.list(orgId, 1, 50);
    const webEvent = orgAudit.events.find(
      (event) => event.sqlPreview === sql && event.source === 'web',
    );
    const mcpEvent = orgAudit.events.find(
      (event) => event.sqlPreview === sql && event.source === 'mcp',
    );

    expect(webEvent).toBeTruthy();
    expect(mcpEvent).toBeTruthy();
    expect(webEvent?.principalType).toBe('user');
    expect(mcpEvent?.principalType).toBe('api_key');
    expect(mcpEvent?.mcpTool).toBe('run_query');
    expect(comparableAudit(webEvent!)).toEqual(comparableAudit(mcpEvent!));
  });

  it('applies the same POLICY_VIOLATION behavior for DELETE via web and MCP', async () => {
    const rejectedSql = `DELETE FROM film WHERE film_id = 1 /* shared-path-${Date.now()} */`;
    const cookie = await loginAsAdmin(app);

    const webResponse = await app.request(`/connections/${pagilaConnectionId}/query`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: rejectedSql }),
    });
    expect(webResponse.status).toBe(400);
    const webError = (await webResponse.json()) as { error: { code: string } };
    expect(webError.error.code).toBe('POLICY_VIOLATION');

    await expect(handleRunQuery(mcpRuntime, { sql: rejectedSql })).rejects.toMatchObject({
      code: 'POLICY_VIOLATION',
    });

    const orgAudit = await auditService.list(orgId, 1, 50);
    const webEvent = orgAudit.events.find((event) => event.sqlPreview === rejectedSql && event.source === 'web');
    const mcpEvent = orgAudit.events.find((event) => event.sqlPreview === rejectedSql && event.source === 'mcp');

    expect(webEvent?.status).toBe('policy_violation');
    expect(mcpEvent?.status).toBe('policy_violation');
    expect(comparableAudit(webEvent!)).toEqual(comparableAudit(mcpEvent!));
  });

  afterAll(async () => {
    if (createdKeyId) {
      await new ApiKeyService(db).revoke(orgId, createdKeyId);
    }
    if (mcpRuntime) {
      await mcpRuntime.close();
    }
    await sql.end();
  });
});

describe('MCP tool handler coverage (all four tools)', () => {
  const { db, sql } = createDb(databaseUrl);
  let runtime: McpRuntime;
  let pagilaConnectionId: string;
  let orgId: string;
  let createdKeyId: string;

  beforeAll(async () => {
    const [pagila] = await db
      .select({ id: connections.id, orgId: connections.orgId })
      .from(connections)
      .where(eq(connections.name, 'Pagila Demo'))
      .limit(1);
    if (!pagila) {
      throw new Error('Pagila Demo connection not found');
    }
    pagilaConnectionId = pagila.id;
    orgId = pagila.orgId;

    const created = await new ApiKeyService(db).create(orgId, {
      name: `All Tools ${Date.now()}`,
      scopes: [pagilaConnectionId],
    });
    createdKeyId = created.id;
    runtime = await createRuntime({ databaseUrl, apiKey: created.secret });
  });

  it('supports the agent discovery flow: list_tables → describe_table → run_query → get_query_history', async () => {
    const tables = await handleListTables(runtime, { schema: 'public' });
    const tableNames = tables.tables.map((table) => table.name);
    expect(tableNames).toContain('film');
    expect(tableNames).toContain('rental');

    const film = await handleDescribeTable(runtime, { schema: 'public', table: 'film' });
    expect(film.columns.some((column) => column.name === 'title')).toBe(true);

    const markerSql = 'SELECT COUNT(*) AS total FROM film';
    const query = await handleRunQuery(runtime, {
      sql: markerSql,
      reason: 'Agent flow demo count',
    });
    expect(query.rowCount).toBe(1);

    const history = await handleGetQueryHistory(runtime, { limit: 10 });
    expect(
      history.events.some(
        (event) => event.action === 'run_query' && event.sqlPreview === markerSql && event.source === 'mcp',
      ),
    ).toBe(true);
  });

  afterAll(async () => {
    if (createdKeyId) {
      await new ApiKeyService(db).revoke(orgId, createdKeyId);
    }
    if (runtime) {
      await runtime.close();
    }
    await sql.end();
  });
});
