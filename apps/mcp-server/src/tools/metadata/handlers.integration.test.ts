import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiKeyService, ConnectionService } from '@governed-sql/core';
import { connections, createDb, loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';
import { eq } from 'drizzle-orm';
import { createRuntime, type McpRuntime } from '../../runtime.js';
import { handleDescribeTable, handleListTables } from './handlers.js';

loadEnvFiles();

const databaseUrl = process.env.DATABASE_URL ?? requireDatabaseUrl();

describe('metadata tool handlers integration', () => {
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
      name: `Metadata Test ${Date.now()}`,
      scopes: [pagilaConnectionId],
    });
    createdKeyId = created.id;

    runtime = await createRuntime({
      databaseUrl,
      apiKey: created.secret,
    });
  });

  it('list_tables discovers Pagila film and rental tables', async () => {
    const result = await handleListTables(runtime, { schema: 'public' });
    const tableNames = result.tables.map((table) => table.name);

    expect(result.connectionId).toBe(pagilaConnectionId);
    expect(result.schema).toBe('public');
    expect(tableNames).toContain('film');
    expect(tableNames).toContain('rental');
    expect(result.tables.every((table) => table.schema === 'public')).toBe(true);
  });

  it('describe_table returns film column metadata', async () => {
    const result = await handleDescribeTable(runtime, {
      schema: 'public',
      table: 'film',
    });

    expect(result.connectionId).toBe(pagilaConnectionId);
    expect(result.table).toEqual({ schema: 'public', name: 'film' });

    const columnNames = result.columns.map((column) => column.name);
    expect(columnNames).toContain('film_id');
    expect(columnNames).toContain('title');
    expect(result.columns[0]?.ordinalPosition).toBeGreaterThan(0);
  });

  it('records audit events for metadata discovery', async () => {
    await handleListTables(runtime, { schema: 'public' });

    const history = await runtime.auditService.listForPrincipal(
      runtime.principal.orgId,
      runtime.principal.id,
      { limit: 20 },
    );

    const listEvent = history.events.find(
      (event) => event.action === 'list_tables' && event.source === 'mcp',
    );
    expect(listEvent).toBeTruthy();
    expect(listEvent?.mcpTool).toBe('list_tables');
    expect(listEvent?.status).toBe('success');
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
