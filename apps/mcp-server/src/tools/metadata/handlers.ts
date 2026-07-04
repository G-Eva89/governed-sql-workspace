import { AppError, isAppError } from '@governed-sql/core';
import type {
  McpDescribeTableInput,
  McpDescribeTableOutput,
  McpListTablesInput,
  McpListTablesOutput,
} from '@governed-sql/schemas';
import type { McpRuntime } from '../runtime.js';
import { getMcpPrincipal, resolveScopedConnectionId } from '../lib/scoped-connection.js';

async function recordMetadataAudit(
  runtime: McpRuntime,
  input: {
    connectionId: string;
    action: 'list_tables' | 'describe_table';
    mcpTool: 'list_tables' | 'describe_table';
    durationMs: number;
    status: 'success' | 'error';
    errorCode?: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  await runtime.auditService.recordAction({
    orgId: runtime.principal.orgId,
    connectionId: input.connectionId,
    principal: getMcpPrincipal(runtime),
    source: 'mcp',
    action: input.action,
    status: input.status,
    durationMs: input.durationMs,
    errorCode: input.errorCode,
    mcpTool: input.mcpTool,
    metadata: input.metadata,
  });
}

export async function handleListTables(
  runtime: McpRuntime,
  input: McpListTablesInput,
): Promise<McpListTablesOutput> {
  const startedAt = Date.now();
  const schema = input.schema ?? 'public';
  let connectionId = '';

  try {
    connectionId = resolveScopedConnectionId(runtime, input.connectionId);
    const tables = await runtime.metadataService.listTables(
      runtime.principal.orgId,
      connectionId,
      schema,
    );

    await recordMetadataAudit(runtime, {
      connectionId,
      action: 'list_tables',
      mcpTool: 'list_tables',
      durationMs: Date.now() - startedAt,
      status: 'success',
      metadata: { schema, tableCount: tables.length },
    });

    return { connectionId, schema, tables };
  } catch (error) {
    if (connectionId) {
      await recordMetadataAudit(runtime, {
        connectionId,
        action: 'list_tables',
        mcpTool: 'list_tables',
        durationMs: Date.now() - startedAt,
        status: 'error',
        errorCode: isAppError(error) ? error.code : 'INTERNAL_ERROR',
        metadata: { schema },
      });
    }
    throw error;
  }
}

export async function handleDescribeTable(
  runtime: McpRuntime,
  input: McpDescribeTableInput,
): Promise<McpDescribeTableOutput> {
  const startedAt = Date.now();
  const schema = input.schema ?? 'public';
  let connectionId = '';

  try {
    connectionId = resolveScopedConnectionId(runtime, input.connectionId);
    const columns = await runtime.metadataService.describeTable(
      runtime.principal.orgId,
      connectionId,
      input.table,
      schema,
    );

    await recordMetadataAudit(runtime, {
      connectionId,
      action: 'describe_table',
      mcpTool: 'describe_table',
      durationMs: Date.now() - startedAt,
      status: 'success',
      metadata: { schema, table: input.table, columnCount: columns.length },
    });

    return {
      connectionId,
      table: { schema, name: input.table },
      columns,
    };
  } catch (error) {
    if (connectionId) {
      await recordMetadataAudit(runtime, {
        connectionId,
        action: 'describe_table',
        mcpTool: 'describe_table',
        durationMs: Date.now() - startedAt,
        status: 'error',
        errorCode: isAppError(error) ? error.code : 'INTERNAL_ERROR',
        metadata: { schema, table: input.table },
      });
    }
    throw error;
  }
}

export function assertValidTableName(table: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new AppError('BAD_REQUEST', 'Invalid table name');
  }
}
