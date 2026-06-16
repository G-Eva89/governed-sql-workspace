import type { MiddlewareHandler } from 'hono';
import type { ApiBindings } from '../types.js';

export function requestLoggerMiddleware(): MiddlewareHandler<ApiBindings> {
  return async (c, next) => {
    const startedAt = Date.now();
    await next();
    const durationMs = Date.now() - startedAt;
    const requestId = c.get('requestId');
    console.log(
      JSON.stringify({
        level: 'info',
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs,
      }),
    );
  };
}
