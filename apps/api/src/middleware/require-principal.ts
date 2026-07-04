import { getCookie } from 'hono/cookie';
import type { MiddlewareHandler } from 'hono';
import {
  ApiKeyService,
  AppError,
  AuthService,
  SESSION_COOKIE_NAME,
} from '@governed-sql/core';
import type { ApiBindings } from '../types.js';

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim() || null;
}

export function requirePrincipal(
  authService: AuthService,
  apiKeyService: ApiKeyService,
): MiddlewareHandler<ApiBindings> {
  return async (c, next) => {
    const bearerToken = parseBearerToken(c.req.header('Authorization'));
    if (bearerToken) {
      const verified = await apiKeyService.verify(bearerToken);
      c.set('principal', {
        type: 'api_key',
        id: verified.id,
        orgId: verified.orgId,
        scopes: verified.scopes,
      });
      await next();
      return;
    }

    const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
    if (!sessionToken) {
      throw new AppError('UNAUTHORIZED', 'Authentication required');
    }

    const session = await authService.verifySession(sessionToken);
    c.set('session', session);
    c.set('principal', {
      type: 'user',
      id: session.userId,
      orgId: session.orgId,
      role: session.role,
    });
    await next();
  };
}
