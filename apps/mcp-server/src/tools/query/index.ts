import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  mcpGetQueryHistoryInputSchema,
  mcpGetQueryHistoryToolInput,
  mcpRunQueryInputSchema,
  mcpRunQueryToolInput,
} from '@governed-sql/schemas';
import type { McpRuntime } from '../../runtime.js';
import { runToolHandler } from '../../lib/tool-response.js';
import { handleGetQueryHistory, handleRunQuery } from './handlers.js';

export function registerQueryTools(server: McpServer, runtime: McpRuntime): void {
  server.registerTool(
    'run_query',
    {
      title: 'Run Query',
      description:
        'Execute a governed read-only SQL query (SELECT/WITH only). Writes, DDL, and multi-statement SQL are rejected.',
      inputSchema: mcpRunQueryToolInput,
    },
    async (rawInput) =>
      runToolHandler(async () => {
        const input = mcpRunQueryInputSchema.parse(rawInput);
        return handleRunQuery(runtime, input);
      }),
  );

  server.registerTool(
    'get_query_history',
    {
      title: 'Get Query History',
      description:
        'Return recent governed query audit events for this API key principal.',
      inputSchema: mcpGetQueryHistoryToolInput,
    },
    async (rawInput) =>
      runToolHandler(async () => {
        const input = mcpGetQueryHistoryInputSchema.parse(rawInput);
        return handleGetQueryHistory(runtime, input);
      }),
  );
}
