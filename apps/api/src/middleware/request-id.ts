import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { ApiBindings } from '../types.js';

export function requestIdMiddleware(): MiddlewareHandler<ApiBindings> {
  return async (c, next) => {
    const requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    await next();
  };
}
