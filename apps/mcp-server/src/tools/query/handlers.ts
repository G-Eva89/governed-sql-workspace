import type {
  McpGetQueryHistoryInput,
  McpGetQueryHistoryOutput,
  McpRunQueryInput,
  McpRunQueryOutput,
} from '@governed-sql/schemas';
import type { McpRuntime } from '../../runtime.js';
import { getMcpPrincipal, resolveScopedConnectionId } from '../../lib/scoped-connection.js';

function buildQueryMetadata(reason: string | undefined): Record<string, unknown> | undefined {
  if (!reason) {
    return undefined;
  }
  return { reason };
}

export async function handleRunQuery(
  runtime: McpRuntime,
  input: McpRunQueryInput,
): Promise<McpRunQueryOutput> {
  const connectionId = resolveScopedConnectionId(runtime, input.connectionId);
  const result = await runtime.queryService.run({
    orgId: runtime.principal.orgId,
    connectionId,
    sql: input.sql,
    principal: getMcpPrincipal(runtime),
    source: 'mcp',
    mcpTool: 'run_query',
    metadata: buildQueryMetadata(input.reason),
  });

  return {
    connectionId,
    reason: input.reason ?? null,
    ...result,
  };
}

export async function handleGetQueryHistory(
  runtime: McpRuntime,
  input: McpGetQueryHistoryInput,
): Promise<McpGetQueryHistoryOutput> {
  const connectionId = input.connectionId
    ? resolveScopedConnectionId(runtime, input.connectionId)
    : undefined;

  return runtime.auditService.listForPrincipal(
    runtime.principal.orgId,
    runtime.principal.id,
    {
      connectionId,
      action: 'run_query',
      limit: input.limit ?? 20,
    },
  );
}
