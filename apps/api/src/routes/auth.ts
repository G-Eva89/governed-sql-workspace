import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import {
  AuthService,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '@governed-sql/core';
import { loginRequestSchema } from '@governed-sql/schemas';
import { jsonValidator } from '../lib/validation.js';
import { requireSession } from '../middleware/require-session.js';
import type { ApiBindings } from '../types.js';

export function createAuthRoutes(authService: AuthService) {
  const routes = new Hono<ApiBindings>();

  routes.post('/login', jsonValidator('json', loginRequestSchema), async (c) => {
    const body = c.req.valid('json');
    const { token, session } = await authService.login(body.email, body.password);
    setCookie(c, SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    return c.json(session);
  });

  routes.post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE_NAME, getClearSessionCookieOptions());
    return c.json({ ok: true });
  });

  routes.get('/me', requireSession(authService), async (c) => {
    const session = c.get('session')!;
    const currentUser = await authService.getCurrentUser(session);
    return c.json(currentUser);
  });

  return routes;
}
