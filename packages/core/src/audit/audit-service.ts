import { and, count, desc, eq } from 'drizzle-orm';
import type { AuditEventPublic, AuditListResult } from '@governed-sql/schemas';
import type { AppDatabase } from '@governed-sql/db';
import { auditEvents } from '@governed-sql/db';
import { hashSql, previewSql } from './sql-utils.js';

export type QueryPrincipal = {
  type: 'user' | 'api_key';
  id: string;
};

export type RecordQueryInput = {
  orgId: string;
  connectionId: string;
  principal: QueryPrincipal;
  source: 'web' | 'mcp' | 'api';
  sql: string;
  status: 'success' | 'error' | 'policy_violation';
  rowCount?: number;
  durationMs: number;
  errorCode?: string;
  mcpTool?: string;
  metadata?: Record<string, unknown>;
};

export type RecordActionInput = {
  orgId: string;
  connectionId: string;
  principal: QueryPrincipal;
  source: 'web' | 'mcp' | 'api';
  action: string;
  status: 'success' | 'error';
  durationMs: number;
  errorCode?: string;
  mcpTool?: string;
  metadata?: Record<string, unknown>;
};

export class AuditService {
  constructor(private readonly db: AppDatabase['db']) {}

  async recordQuery(input: RecordQueryInput): Promise<void> {
    await this.db.insert(auditEvents).values({
      orgId: input.orgId,
      connectionId: input.connectionId,
      principalType: input.principal.type,
      principalId: input.principal.id,
      action: 'run_query',
      sqlHash: hashSql(input.sql),
      sqlPreview: previewSql(input.sql),
      rowCount: input.rowCount ?? null,
      durationMs: input.durationMs,
      status: input.status,
      errorCode: input.errorCode ?? null,
      source: input.source,
      mcpTool: input.mcpTool ?? null,
      metadata: input.metadata ?? null,
    });
  }

  async recordAction(input: RecordActionInput): Promise<void> {
    await this.db.insert(auditEvents).values({
      orgId: input.orgId,
      connectionId: input.connectionId,
      principalType: input.principal.type,
      principalId: input.principal.id,
      action: input.action,
      sqlHash: null,
      sqlPreview: null,
      rowCount: null,
      durationMs: input.durationMs,
      status: input.status,
      errorCode: input.errorCode ?? null,
      source: input.source,
      mcpTool: input.mcpTool ?? null,
      metadata: input.metadata ?? null,
    });
  }

  async list(orgId: string, page: number, limit: number): Promise<AuditListResult> {
    return this.listFiltered(orgId, page, limit);
  }

  async listForPrincipal(
    orgId: string,
    principalId: string,
    options: {
      connectionId?: string;
      action?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<AuditListResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const offset = (page - 1) * limit;

    const filters = [eq(auditEvents.orgId, orgId), eq(auditEvents.principalId, principalId)];
    if (options.connectionId) {
      filters.push(eq(auditEvents.connectionId, options.connectionId));
    }
    if (options.action) {
      filters.push(eq(auditEvents.action, options.action));
    }
    const whereClause = and(...filters);

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(auditEvents)
      .where(whereClause);

    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(whereClause)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    const total = totalRow?.total ?? 0;

    return {
      events: rows.map((row) => this.toPublicEvent(row)),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  private async listFiltered(orgId: string, page: number, limit: number): Promise<AuditListResult> {
    const offset = (page - 1) * limit;

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgId));

    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    const total = totalRow?.total ?? 0;

    return {
      events: rows.map((row) => this.toPublicEvent(row)),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  private toPublicEvent(row: typeof auditEvents.$inferSelect): AuditEventPublic {
    return {
      id: row.id,
      connectionId: row.connectionId,
      principalType: row.principalType,
      principalId: row.principalId,
      action: row.action,
      sqlHash: row.sqlHash,
      sqlPreview: row.sqlPreview,
      rowCount: row.rowCount,
      durationMs: row.durationMs,
      status: row.status,
      errorCode: row.errorCode,
      source: row.source,
      mcpTool: row.mcpTool,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
