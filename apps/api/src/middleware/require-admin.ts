import type { MiddlewareHandler } from 'hono';
import { AppError } from '@governed-sql/core';
import type { ApiBindings } from '../types.js';

export function requireAdmin(): MiddlewareHandler<ApiBindings> {
  return async (c, next) => {
    const session = c.get('session');
    if (!session) {
      throw new AppError('UNAUTHORIZED', 'Authentication required');
    }
    if (session.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Admin access required');
    }
    await next();
  };
}
