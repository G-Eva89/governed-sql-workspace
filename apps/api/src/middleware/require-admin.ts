import type { MiddlewareHandler } from 'hono';
import { AppError } from '@governed-sql/core';
import type { ApiBindings } from '../types.js';

export function requireAdmin(): MiddlewareHandler<ApiBindings> {
  return async (c, next) => {
    const principal = c.get('principal');
    if (!principal || principal.type !== 'user') {
      throw new AppError('FORBIDDEN', 'Admin access required');
    }
    if (principal.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Admin access required');
    }
    await next();
  };
}
