import { count, desc, eq } from 'drizzle-orm';
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
    });
  }

  async list(orgId: string, page: number, limit: number): Promise<AuditListResult> {
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
      createdAt: row.createdAt.toISOString(),
    };
  }
}
