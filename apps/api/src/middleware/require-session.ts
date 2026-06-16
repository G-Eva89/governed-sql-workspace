import { getCookie } from 'hono/cookie';
import type { MiddlewareHandler } from 'hono';
import { AppError, AuthService, SESSION_COOKIE_NAME } from '@governed-sql/core';
import type { ApiBindings } from '../types.js';

export function requireSession(authService: AuthService): MiddlewareHandler<ApiBindings> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (!token) {
      throw new AppError('UNAUTHORIZED', 'Authentication required');
    }

    const session = await authService.verifySession(token);
    c.set('session', session);
    await next();
  };
}
