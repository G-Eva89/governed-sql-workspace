import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppDatabase } from '@governed-sql/db';
import type { ApiBindings } from '../types.js';

export function createHealthRoutes(db: AppDatabase['db']) {
  const routes = new Hono<ApiBindings>();

  routes.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'governed-sql-api',
      timestamp: new Date().toISOString(),
    }),
  );

  routes.get('/ready', async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({
        ok: true,
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch {
      return c.json(
        {
          ok: false,
          database: 'unavailable',
          timestamp: new Date().toISOString(),
        },
        503,
      );
    }
  });

  return routes;
}
