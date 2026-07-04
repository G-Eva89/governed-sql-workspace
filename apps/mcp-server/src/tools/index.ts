import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpRuntime } from '../runtime.js';
import { registerMetadataTools } from './metadata/index.js';
import { registerQueryTools } from './query/index.js';

export function registerTools(server: McpServer, runtime: McpRuntime): void {
  registerMetadataTools(server, runtime);
  registerQueryTools(server, runtime);
}
