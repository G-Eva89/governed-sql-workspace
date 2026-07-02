import { AppError } from '../errors.js';
import type { ConnectionService } from '../connections/connection-service.js';
import { getTargetSql } from '../connections/target-client.js';

export type TableSummary = {
  schema: string;
  name: string;
  type: 'table' | 'view';
};

export type ColumnDescriptor = {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
};

type InformationSchemaTableRow = {
  table_schema: string;
  table_name: string;
  table_type: string;
};

type InformationSchemaColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
};

export class MetadataService {
  constructor(private readonly connectionService: ConnectionService) {}

  async listTables(
    orgId: string,
    connectionId: string,
    schema = 'public',
  ): Promise<TableSummary[]> {
    const config = await this.connectionService.resolveTargetConfig(orgId, connectionId);
    const sql = getTargetSql(config);

    const rows = await sql<InformationSchemaTableRow[]>`
      SELECT table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = ${schema}
        AND table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY table_name
    `;

    return rows.map((row) => ({
      schema: row.table_schema,
      name: row.table_name,
      type: row.table_type === 'VIEW' ? 'view' : 'table',
    }));
  }

  async describeTable(
    orgId: string,
    connectionId: string,
    table: string,
    schema = 'public',
  ): Promise<ColumnDescriptor[]> {
    const config = await this.connectionService.resolveTargetConfig(orgId, connectionId);
    const sql = getTargetSql(config);

    const rows = await sql<InformationSchemaColumnRow[]>`
      SELECT column_name, data_type, is_nullable, column_default, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = ${schema}
        AND table_name = ${table}
      ORDER BY ordinal_position
    `;

    if (rows.length === 0) {
      const [tableExists] = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ${schema}
          AND table_name = ${table}
        LIMIT 1
      `;

      if (!tableExists) {
        throw new AppError('NOT_FOUND', `Table ${schema}.${table} not found`);
      }
    }

    return rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
      ordinalPosition: row.ordinal_position,
    }));
  }
}
