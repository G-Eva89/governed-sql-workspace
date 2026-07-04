import type { QueryResult } from '@governed-sql/schemas';
import { AppError, isAppError } from '../errors.js';
import type { AuditService, QueryPrincipal } from '../audit/audit-service.js';
import type { ConnectionService } from '../connections/connection-service.js';
import { getTargetSql, type TargetSql } from '../connections/target-client.js';
import { PolicyEngine } from '../policy/policy-engine.js';

export type RunQueryInput = {
  orgId: string;
  connectionId: string;
  sql: string;
  principal: QueryPrincipal;
  source: 'web' | 'mcp' | 'api';
  mcpTool?: string;
  metadata?: Record<string, unknown>;
};

function serializeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      serialized[key] = serializeValue(value);
    }
    return serialized;
  });
}

function isStatementTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const pgError = error as Error & { code?: string };
  return (
    pgError.code === '57014' ||
    /statement timeout|canceling statement due to statement timeout/i.test(pgError.message)
  );
}

export class QueryService {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly policyEngine: PolicyEngine,
    private readonly auditService: AuditService,
  ) {}

  async run(input: RunQueryInput): Promise<QueryResult> {
    const sql = input.sql.trim();
    const startedAt = Date.now();
    let status: 'success' | 'error' | 'policy_violation' = 'error';
    let rowCount: number | undefined;
    let errorCode: string | undefined;
    let result: QueryResult | undefined;

    try {
      const policy = await this.connectionService.getPolicy(input.orgId, input.connectionId);
      this.policyEngine.validateReadOnlySql(sql, {
        allowedSchemas: policy.allowedSchemas,
        blocklistedTables: policy.blocklistedTables,
      });

      const config = await this.connectionService.resolveTargetConfig(
        input.orgId,
        input.connectionId,
      );
      const client = getTargetSql(config);

      const allRows = await this.executeQuery(client, sql, policy.maxDurationMs);
      const truncated = allRows.length > policy.maxRows;
      const cappedRows = allRows.slice(0, policy.maxRows);
      const columns = cappedRows.length > 0 ? Object.keys(cappedRows[0]!) : [];

      rowCount = cappedRows.length;
      status = 'success';
      result = {
        columns,
        rows: serializeRows(cappedRows),
        rowCount,
        truncated,
      };

      return result;
    } catch (error) {
      if (isAppError(error)) {
        errorCode = error.code;
        status = error.code === 'POLICY_VIOLATION' ? 'policy_violation' : 'error';
        throw error;
      }

      errorCode = 'INTERNAL_ERROR';
      throw new AppError(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'Query execution failed',
      );
    } finally {
      await this.auditService.recordQuery({
        orgId: input.orgId,
        connectionId: input.connectionId,
        principal: input.principal,
        source: input.source,
        sql,
        status,
        rowCount,
        durationMs: Date.now() - startedAt,
        errorCode,
        mcpTool: input.mcpTool,
        metadata: input.metadata,
      });
    }
  }

  private async executeQuery(
    client: TargetSql,
    sql: string,
    maxDurationMs: number,
  ): Promise<Record<string, unknown>[]> {
    try {
      return await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL statement_timeout = ${maxDurationMs}`);
        const rows = (await tx.unsafe(sql)) as Record<string, unknown>[];
        return rows;
      });
    } catch (error) {
      if (isAppError(error)) {
        throw error;
      }

      if (isStatementTimeout(error)) {
        throw new AppError('TIMEOUT', 'Query exceeded the maximum duration');
      }

      const message = error instanceof Error ? error.message : 'Query execution failed';
      throw new AppError('CONNECTION_ERROR', message);
    }
  }
}
