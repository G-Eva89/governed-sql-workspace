import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  auditSourceEnum,
  auditStatusEnum,
  connectionStatusEnum,
  membershipRoleEnum,
  principalTypeEnum,
} from './enums.js';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  role: membershipRoleEnum('role').notNull(),
});

export const connections = pgTable('connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  database: text('database').notNull(),
  username: text('username').notNull(),
  passwordCiphertext: text('password_ciphertext').notNull(),
  sslMode: text('ssl_mode').notNull().default('disable'),
  status: connectionStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const connectionPolicies = pgTable('connection_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id')
    .notNull()
    .unique()
    .references(() => connections.id, { onDelete: 'cascade' }),
  allowedSchemas: jsonb('allowed_schemas').$type<string[]>().notNull(),
  maxRows: integer('max_rows').notNull().default(500),
  maxDurationMs: integer('max_duration_ms').notNull().default(15000),
  blocklistedTables: jsonb('blocklisted_tables').$type<string[]>().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => connections.id, {
    onDelete: 'set null',
  }),
  principalType: principalTypeEnum('principal_type').notNull(),
  principalId: uuid('principal_id').notNull(),
  action: text('action').notNull(),
  sqlHash: text('sql_hash'),
  sqlPreview: text('sql_preview'),
  rowCount: integer('row_count'),
  durationMs: integer('duration_ms'),
  status: auditStatusEnum('status').notNull(),
  errorCode: text('error_code'),
  source: auditSourceEnum('source').notNull(),
  mcpTool: text('mcp_tool'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
