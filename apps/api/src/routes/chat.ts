import { Hono } from 'hono';
import type { ApiKeyService, AuthService, NlToSqlService } from '@governed-sql/core';
import { generateSqlRequestSchema } from '@governed-sql/schemas';
import { jsonValidator } from '../lib/validation.js';
import { requirePrincipal } from '../middleware/require-principal.js';
import type { ApiBindings } from '../types.js';

export function createChatRoutes(
  authService: AuthService,
  apiKeyService: ApiKeyService,
  nlToSqlService: NlToSqlService,
) {
  const routes = new Hono<ApiBindings>();

  routes.use('*', requirePrincipal(authService, apiKeyService));

  routes.post(
    '/:connectionId/generate',
    jsonValidator('json', generateSqlRequestSchema),
    async (c) => {
      const principal = c.get('principal')!;
      const connectionId = c.req.param('connectionId');
      if (principal.type === 'api_key') {
        apiKeyService.assertConnectionScope(principal.scopes, connectionId);
      }
      const body = c.req.valid('json');
      const result = await nlToSqlService.generateSql({
        orgId: principal.orgId,
        connectionId,
        question: body.question,
        history: body.history,
      });
      return c.json(result);
    },
  );

  return routes;
}
