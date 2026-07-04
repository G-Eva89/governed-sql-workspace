import { loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';

export type McpConfig = {
  databaseUrl: string;
  apiKey: string;
  defaultConnectionId?: string;
};

export function loadConfig(): McpConfig {
  loadEnvFiles();

  const apiKey = process.env.API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'API_KEY environment variable is required. Create one via POST /api-keys or use the key printed by pnpm db:seed.',
    );
  }

  const defaultConnectionId = process.env.DEFAULT_CONNECTION_ID?.trim();
  return {
    databaseUrl: requireDatabaseUrl(),
    apiKey,
    defaultConnectionId: defaultConnectionId || undefined,
  };
}
