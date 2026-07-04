import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  mcpDescribeTableInputSchema,
  mcpDescribeTableToolInput,
  mcpListTablesInputSchema,
  mcpListTablesToolInput,
} from '@governed-sql/schemas';
import type { McpRuntime } from '../../runtime.js';
import { runToolHandler } from '../../lib/tool-response.js';
import { assertValidTableName, handleDescribeTable, handleListTables } from './handlers.js';

export function registerMetadataTools(server: McpServer, runtime: McpRuntime): void {
  server.registerTool(
    'list_tables',
    {
      title: 'List Tables',
      description:
        'List tables and views in a governed database connection. Use this before writing SQL.',
      inputSchema: mcpListTablesToolInput,
    },
    async (rawInput) =>
      runToolHandler(async () => {
        const input = mcpListTablesInputSchema.parse(rawInput);
        return handleListTables(runtime, input);
      }),
  );

  server.registerTool(
    'describe_table',
    {
      title: 'Describe Table',
      description: 'Describe columns for a table or view in a governed database connection.',
      inputSchema: mcpDescribeTableToolInput,
    },
    async (rawInput) =>
      runToolHandler(async () => {
        const input = mcpDescribeTableInputSchema.parse(rawInput);
        assertValidTableName(input.table);
        return handleDescribeTable(runtime, input);
      }),
  );
}
