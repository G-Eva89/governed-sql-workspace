export { AuthService } from './auth/auth-service.js';
export {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  verifySessionToken,
  type SessionPayload,
} from './auth/session.js';
export { AuditService, type QueryPrincipal, type RecordQueryInput } from './audit/audit-service.js';
export { hashSql, previewSql } from './audit/sql-utils.js';
export {
  ConnectionService,
  type ConnectionPolicy,
  type CreateConnectionInput,
  type UpdateConnectionInput,
} from './connections/connection-service.js';
export {
  closeAllTargetClients,
  getTargetSql,
  pingTargetDatabase,
  type TargetConnectionConfig,
  type TargetSql,
} from './connections/target-client.js';
export { AppError, isAppError } from './errors.js';
export {
  MetadataService,
  type ColumnDescriptor,
  type TableSummary,
} from './metadata/metadata-service.js';
export { PolicyEngine, type PolicyValidationOptions } from './policy/policy-engine.js';
export { QueryService, type RunQueryInput } from './query/query-service.js';
