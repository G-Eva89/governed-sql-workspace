#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createRuntime } from './runtime.js';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = await createRuntime(config);
  const server = createMcpServer(runtime);
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    await server.close();
    await runtime.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });

  await server.connect(transport);
  console.error('[governed-sql-mcp] ready on stdio');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[governed-sql-mcp] fatal: ${message}`);
  process.exit(1);
});
