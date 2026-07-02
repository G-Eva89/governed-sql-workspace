import { Hono } from 'hono';
import type {
  AuditService,
  AuthService,
  ConnectionService,
  MetadataService,
  QueryService,
} from '@governed-sql/core';
import type { AppDatabase } from '@governed-sql/db';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';
import { createAuditRoutes } from './routes/audit.js';
import { createAuthRoutes } from './routes/auth.js';
import { createConnectionRoutes } from './routes/connections.js';
import { createHealthRoutes } from './routes/health.js';
import type { ApiBindings } from './types.js';

export type AppDependencies = {
  db: AppDatabase['db'];
  authService: AuthService;
  connectionService: ConnectionService;
  metadataService: MetadataService;
  queryService: QueryService;
  auditService: AuditService;
};

export function createApp(deps: AppDependencies) {
  const app = new Hono<ApiBindings>();

  app.use('*', requestIdMiddleware());
  app.use('*', requestLoggerMiddleware());
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.route('/', createHealthRoutes(deps.db));
  app.route('/auth', createAuthRoutes(deps.authService));
  app.route(
    '/connections',
    createConnectionRoutes(
      deps.authService,
      deps.connectionService,
      deps.metadataService,
      deps.queryService,
    ),
  );
  app.route('/audit', createAuditRoutes(deps.authService, deps.auditService));

  return app;
}