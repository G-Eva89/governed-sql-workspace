import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`);
});
