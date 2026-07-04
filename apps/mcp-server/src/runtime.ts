import {
  ApiKeyService,
  AuditService,
  closeAllTargetClients,
  ConnectionService,
  MetadataService,
  PolicyEngine,
  QueryService,
  type VerifiedApiKey,
} from '@governed-sql/core';
import { createDb, type AppDatabase } from '@governed-sql/db';
import type { McpConfig } from './config.js';

export type McpRuntime = {
  config: McpConfig;
  principal: VerifiedApiKey;
  apiKeyService: ApiKeyService;
  connectionService: ConnectionService;
  metadataService: MetadataService;
  queryService: QueryService;
  auditService: AuditService;
  close: () => Promise<void>;
};

export async function createRuntime(config: McpConfig): Promise<McpRuntime> {
  const { db, sql } = createDb(config.databaseUrl);
  const apiKeyService = new ApiKeyService(db);
  const principal = await apiKeyService.verify(config.apiKey);
  const connectionService = new ConnectionService(db);
  const auditService = new AuditService(db);
  const metadataService = new MetadataService(connectionService);
  const queryService = new QueryService(connectionService, new PolicyEngine(), auditService);

  return {
    config,
    principal,
    apiKeyService,
    connectionService,
    metadataService,
    queryService,
    auditService,
    close: createCloser(sql),
  };
}

function createCloser(sql: AppDatabase['sql']): () => Promise<void> {
  return async () => {
    await closeAllTargetClients();
    await sql.end();
  };
}
