import { Hono } from 'hono';
import type {
  AuthService,
  ConnectionService,
  MetadataService,
  QueryService,
} from '@governed-sql/core';
import {
  createConnectionSchema,
  describeTableQuerySchema,
  listTablesQuerySchema,
  runQuerySchema,
  updateConnectionSchema,
} from '@governed-sql/schemas';import { jsonValidator, queryValidator } from '../lib/validation.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { requireSession } from '../middleware/require-session.js';
import type { ApiBindings } from '../types.js';

export function createConnectionRoutes(
  authService: AuthService,
  connectionService: ConnectionService,
  metadataService: MetadataService,
  queryService: QueryService,
) {
  const routes = new Hono<ApiBindings>();

  routes.use('*', requireSession(authService));

  routes.get('/', async (c) => {
    const session = c.get('session')!;
    const items = await connectionService.list(session.orgId);
    return c.json({ connections: items });
  });

  routes.get('/:id/tables', queryValidator(listTablesQuerySchema), async (c) => {
    const session = c.get('session')!;
    const { schema } = c.req.valid('query');
    const tables = await metadataService.listTables(session.orgId, c.req.param('id'), schema);
    return c.json({ tables });
  });

  routes.get('/:id/tables/:tableName', queryValidator(describeTableQuerySchema), async (c) => {
    const session = c.get('session')!;
    const { schema } = c.req.valid('query');
    const tableName = c.req.param('tableName');
    const columns = await metadataService.describeTable(
      session.orgId,
      c.req.param('id'),
      tableName,
      schema,
    );
    return c.json({
      table: { schema, name: tableName },
      columns,
    });
  });

  routes.get('/:id', async (c) => {
    const session = c.get('session')!;
    const connection = await connectionService.get(session.orgId, c.req.param('id'));
    return c.json(connection);
  });

  routes.post('/', requireAdmin(), jsonValidator('json', createConnectionSchema), async (c) => {
    const session = c.get('session')!;
    const body = c.req.valid('json');
    const connection = await connectionService.create(session.orgId, body);
    return c.json(connection, 201);
  });

  routes.patch('/:id', requireAdmin(), jsonValidator('json', updateConnectionSchema), async (c) => {
    const session = c.get('session')!;
    const body = c.req.valid('json');
    const connection = await connectionService.update(session.orgId, c.req.param('id'), body);
    return c.json(connection);
  });

  routes.post('/:id/test', async (c) => {
    const session = c.get('session')!;
    const result = await connectionService.test(session.orgId, c.req.param('id'));
    return c.json(result);
  });

  routes.post('/:id/query', jsonValidator('json', runQuerySchema), async (c) => {
    const session = c.get('session')!;
    const body = c.req.valid('json');
    const result = await queryService.run({
      orgId: session.orgId,
      connectionId: c.req.param('id'),
      sql: body.sql,
      principal: { type: 'user', id: session.userId },
      source: 'web',
    });
    return c.json(result);
  });

  return routes;
}
