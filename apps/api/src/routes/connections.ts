import { Hono } from 'hono';
import type {
  ApiKeyService,
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
} from '@governed-sql/schemas';
import { jsonValidator, queryValidator } from '../lib/validation.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { requirePrincipal } from '../middleware/require-principal.js';
import type { ApiBindings, Principal } from '../types.js';

function getQuerySource(principal: Principal): 'web' | 'api' {
  return principal.type === 'api_key' ? 'api' : 'web';
}

export function createConnectionRoutes(
  authService: AuthService,
  apiKeyService: ApiKeyService,
  connectionService: ConnectionService,
  metadataService: MetadataService,
  queryService: QueryService,
) {
  const routes = new Hono<ApiBindings>();

  routes.use('*', requirePrincipal(authService, apiKeyService));

  routes.get('/', async (c) => {
    const principal = c.get('principal')!;
    const items = await connectionService.list(principal.orgId);
    if (principal.type === 'api_key') {
      return c.json({
        connections: apiKeyService.filterScopedConnections(principal.scopes, items),
      });
    }
    return c.json({ connections: items });
  });

  routes.get('/:id/tables', queryValidator(listTablesQuerySchema), async (c) => {
    const principal = c.get('principal')!;
    const connectionId = c.req.param('id');
    if (principal.type === 'api_key') {
      apiKeyService.assertConnectionScope(principal.scopes, connectionId);
    }
    const { schema } = c.req.valid('query');
    const tables = await metadataService.listTables(principal.orgId, connectionId, schema);
    return c.json({ tables });
  });

  routes.get('/:id/tables/:tableName', queryValidator(describeTableQuerySchema), async (c) => {
    const principal = c.get('principal')!;
    const connectionId = c.req.param('id');
    if (principal.type === 'api_key') {
      apiKeyService.assertConnectionScope(principal.scopes, connectionId);
    }
    const { schema } = c.req.valid('query');
    const tableName = c.req.param('tableName');
    const columns = await metadataService.describeTable(
      principal.orgId,
      connectionId,
      tableName,
      schema,
    );
    return c.json({
      table: { schema, name: tableName },
      columns,
    });
  });

  routes.get('/:id', async (c) => {
    const principal = c.get('principal')!;
    const connectionId = c.req.param('id');
    if (principal.type === 'api_key') {
      apiKeyService.assertConnectionScope(principal.scopes, connectionId);
    }
    const connection = await connectionService.get(principal.orgId, connectionId);
    return c.json(connection);
  });

  routes.post('/', requireAdmin(), jsonValidator('json', createConnectionSchema), async (c) => {
    const principal = c.get('principal')!;
    const body = c.req.valid('json');
    const connection = await connectionService.create(principal.orgId, body);
    return c.json(connection, 201);
  });

  routes.patch('/:id', requireAdmin(), jsonValidator('json', updateConnectionSchema), async (c) => {
    const principal = c.get('principal')!;
    const body = c.req.valid('json');
    const connection = await connectionService.update(principal.orgId, c.req.param('id'), body);
    return c.json(connection);
  });

  routes.post('/:id/test', async (c) => {
    const principal = c.get('principal')!;
    const connectionId = c.req.param('id');
    if (principal.type === 'api_key') {
      apiKeyService.assertConnectionScope(principal.scopes, connectionId);
    }
    const result = await connectionService.test(principal.orgId, connectionId);
    return c.json(result);
  });

  routes.post('/:id/query', jsonValidator('json', runQuerySchema), async (c) => {
    const principal = c.get('principal')!;
    const connectionId = c.req.param('id');
    if (principal.type === 'api_key') {
      apiKeyService.assertConnectionScope(principal.scopes, connectionId);
    }
    const body = c.req.valid('json');
    const result = await queryService.run({
      orgId: principal.orgId,
      connectionId,
      sql: body.sql,
      principal: { type: principal.type, id: principal.id },
      source: getQuerySource(principal),
    });
    return c.json(result);
  });

  return routes;
}
