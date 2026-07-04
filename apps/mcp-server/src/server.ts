import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpRuntime } from './runtime.js';
import { registerTools } from './tools/index.js';

export function createMcpServer(runtime: McpRuntime): McpServer {
  const server = new McpServer({
    name: 'governed-sql',
    version: '0.1.0',
  });

  registerTools(server, runtime);
  return server;
}
