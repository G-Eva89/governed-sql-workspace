import { Hono } from 'hono';
import type { ApiKeyService, AuthService } from '@governed-sql/core';
import { createApiKeySchema } from '@governed-sql/schemas';
import { jsonValidator } from '../lib/validation.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { requireSession } from '../middleware/require-session.js';
import type { ApiBindings } from '../types.js';

export function createApiKeyRoutes(authService: AuthService, apiKeyService: ApiKeyService) {
  const routes = new Hono<ApiBindings>();

  routes.use('*', requireSession(authService));
  routes.use('*', async (c, next) => {
    const session = c.get('session')!;
    c.set('principal', {
      type: 'user',
      id: session.userId,
      orgId: session.orgId,
      role: session.role,
    });
    await next();
  });
  routes.use('*', requireAdmin());

  routes.get('/', async (c) => {
    const principal = c.get('principal')!;
    const apiKeys = await apiKeyService.list(principal.orgId);
    return c.json({ apiKeys });
  });

  routes.post('/', jsonValidator('json', createApiKeySchema), async (c) => {
    const principal = c.get('principal')!;
    const body = c.req.valid('json');
    const apiKey = await apiKeyService.create(principal.orgId, body);
    return c.json(apiKey, 201);
  });

  routes.delete('/:id', async (c) => {
    const principal = c.get('principal')!;
    await apiKeyService.revoke(principal.orgId, c.req.param('id'));
    return c.body(null, 204);
  });

  return routes;
}
