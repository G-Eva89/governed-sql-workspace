import { afterAll, describe, expect, it } from 'vitest';
import {
  ApiKeyService,
  AuditService,
  AuthService,
  ConnectionService,
  MetadataService,
  NlToSqlService,
  PolicyEngine,
  QueryService,
  type AnthropicNlClient,
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

function makeFakeAnthropicClient(sql: string, explanation: string): AnthropicNlClient {
  return {
    generateSql: async () => ({ sql, explanation, warnings: [] }),
  } as unknown as AnthropicNlClient;
}

describe('Chat (NL-to-SQL) integration', () => {
  const { db, sql } = createDb(databaseUrl);
  const connectionService = new ConnectionService(db);
  const auditService = new AuditService(db);
  const metadataService = new MetadataService(connectionService);
  const queryService = new QueryService(connectionService, new PolicyEngine(), auditService);
  const generatedSql = 'SELECT film_id, title FROM film ORDER BY film_id LIMIT 3';
  const nlToSqlService = new NlToSqlService(
    metadataService,
    connectionService,
    makeFakeAnthropicClient(generatedSql, 'Lists the first three films by id.'),
  );
  const app = createApp({
    db,
    authService: new AuthService(db),
    apiKeyService: new ApiKeyService(db),
    connectionService,
    metadataService,
    queryService,
    auditService,
    nlToSqlService,
  });

  it('generates SQL from a question, then executes it via the governed gateway with an audited link back to the prompt', async () => {
    const cookie = await loginAsAdmin(app);
    const connectionId = await getPagilaConnectionId(app, cookie);
    const question = 'show me the first three films by id';

    const generateResponse = await app.request(`/chat/${connectionId}/generate`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history: [] }),
    });

    expect(generateResponse.status).toBe(200);
    const generateBody = (await generateResponse.json()) as {
      sql: string | null;
      explanation: string;
      warnings: string[];
    };
    expect(generateBody.sql).toBe(generatedSql);
    expect(generateBody.explanation).toBeTruthy();

    const runResponse = await app.request(`/connections/${connectionId}/query`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: generateBody.sql, nlPrompt: question }),
    });

    expect(runResponse.status).toBe(200);
    const runBody = (await runResponse.json()) as { rowCount: number };
    expect(runBody.rowCount).toBe(3);

    const auditResponse = await app.request('/audit?limit=5', {
      headers: { Cookie: cookie },
    });
    const auditBody = (await auditResponse.json()) as {
      events: Array<{ sqlPreview: string | null; metadata: Record<string, unknown> | null }>;
    };
    const event = auditBody.events.find((item) => item.sqlPreview === generatedSql);
    expect(event).toBeTruthy();
    expect(event?.metadata).toEqual({ nlPrompt: question });
  });

  it('requires authentication', async () => {
    const response = await app.request('/chat/00000000-0000-0000-0000-000000000001/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'anything', history: [] }),
    });
    expect(response.status).toBe(401);
  });

  afterAll(async () => {
    await sql.end();
  });
});
