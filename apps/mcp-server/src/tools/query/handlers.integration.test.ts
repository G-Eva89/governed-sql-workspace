import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiKeyService } from '@governed-sql/core';
import { connections, createDb, loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';
import { eq } from 'drizzle-orm';
import { createRuntime, type McpRuntime } from '../../runtime.js';
import { handleGetQueryHistory, handleRunQuery } from './handlers.js';

loadEnvFiles();

const databaseUrl = process.env.DATABASE_URL ?? requireDatabaseUrl();

describe('query tool handlers integration', () => {
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
      throw new Error('Pagila Demo connection not found — run pnpm db:seed');
    }

    pagilaConnectionId = pagila.id;
    orgId = pagila.orgId;

    const apiKeyService = new ApiKeyService(db);
    const created = await apiKeyService.create(orgId, {
      name: `Query Test ${Date.now()}`,
      scopes: [pagilaConnectionId],
    });
    createdKeyId = created.id;

    runtime = await createRuntime({
      databaseUrl,
      apiKey: created.secret,
    });
  });

  it('run_query returns governed SELECT results from Pagila', async () => {
    const result = await handleRunQuery(runtime, {
      sql: 'SELECT film_id, title FROM film ORDER BY film_id LIMIT 3',
      reason: 'Integration test sample query',
    });

    expect(result.connectionId).toBe(pagilaConnectionId);
    expect(result.reason).toBe('Integration test sample query');
    expect(result.rowCount).toBe(3);
    expect(result.columns).toContain('title');
    expect(result.rows[0]?.title).toBeTruthy();
    expect(result.truncated).toBe(false);
  });

  it('run_query rejects DELETE and records a policy_violation audit row', async () => {
    const rejectedSql = 'DELETE FROM film WHERE film_id = 1';

    await expect(
      handleRunQuery(runtime, {
        sql: rejectedSql,
      }),
    ).rejects.toMatchObject({ code: 'POLICY_VIOLATION' });

    const history = await handleGetQueryHistory(runtime, { limit: 10 });
    const failureEvent = history.events.find((event) => event.sqlPreview === rejectedSql);
    expect(failureEvent).toBeTruthy();
    expect(failureEvent?.status).toBe('policy_violation');
    expect(failureEvent?.source).toBe('mcp');
    expect(failureEvent?.mcpTool).toBe('run_query');
    expect(failureEvent?.principalType).toBe('api_key');
  });

  it('get_query_history returns MCP query audit entries for this principal', async () => {
    const markerSql = 'SELECT film_id FROM film ORDER BY film_id LIMIT 1';
    await handleRunQuery(runtime, { sql: markerSql, reason: 'History lookup marker' });

    const history = await handleGetQueryHistory(runtime, { limit: 20 });

    expect(history.total).toBeGreaterThan(0);
    expect(
      history.events.some(
        (event) =>
          event.action === 'run_query' &&
          event.source === 'mcp' &&
          event.sqlPreview === markerSql,
      ),
    ).toBe(true);

    const markerEvent = history.events.find((event) => event.sqlPreview === markerSql);
    expect(markerEvent?.metadata).toMatchObject({ reason: 'History lookup marker' });
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
