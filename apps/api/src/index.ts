import { serve } from '@hono/node-server';
import { AuthService, ConnectionService } from '@governed-sql/core';
import { createDb, loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';
import { createApp } from './app.js';

loadEnvFiles();

const { db, sql } = createDb(requireDatabaseUrl());
const authService = new AuthService(db);
const connectionService = new ConnectionService(db);
const app = createApp({ db, authService, connectionService });

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`);
});

async function shutdown(): Promise<void> {
  await sql.end();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
