import type { ApiKeyService } from '@governed-sql/core';
import type { McpRuntime } from '../runtime.js';
import { resolveConnectionId } from './connection-scope.js';

export function resolveScopedConnectionId(
  runtime: McpRuntime,
  inputConnectionId: string | undefined,
  apiKeyService: ApiKeyService = runtime.apiKeyService,
): string {
  const connectionId = resolveConnectionId(
    runtime.principal.scopes,
    inputConnectionId,
    runtime.config.defaultConnectionId,
  );
  apiKeyService.assertConnectionScope(runtime.principal.scopes, connectionId);
  return connectionId;
}

export function getMcpPrincipal(runtime: McpRuntime) {
  return { type: 'api_key' as const, id: runtime.principal.id };
}
