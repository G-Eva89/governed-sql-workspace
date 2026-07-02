import { Hono } from 'hono';
import type { AuditService, AuthService } from '@governed-sql/core';
import { auditListQuerySchema } from '@governed-sql/schemas';
import { queryValidator } from '../lib/validation.js';
import { requireSession } from '../middleware/require-session.js';
import type { ApiBindings } from '../types.js';

export function createAuditRoutes(authService: AuthService, auditService: AuditService) {
  const routes = new Hono<ApiBindings>();

  routes.use('*', requireSession(authService));

  routes.get('/', queryValidator(auditListQuerySchema), async (c) => {
    const session = c.get('session')!;
    const { page, limit } = c.req.valid('query');
    const result = await auditService.list(session.orgId, page, limit);
    return c.json(result);
  });

  return routes;
}
