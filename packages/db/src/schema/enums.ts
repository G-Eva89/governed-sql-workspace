import { pgEnum } from 'drizzle-orm/pg-core';

export const membershipRoleEnum = pgEnum('membership_role', ['admin', 'member']);

export const connectionStatusEnum = pgEnum('connection_status', ['active', 'disabled']);

export const principalTypeEnum = pgEnum('principal_type', ['user', 'api_key']);

export const auditStatusEnum = pgEnum('audit_status', [
  'success',
  'error',
  'policy_violation',
]);

export const auditSourceEnum = pgEnum('audit_source', ['web', 'mcp', 'api']);
