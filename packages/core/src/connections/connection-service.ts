import { and, asc, eq } from 'drizzle-orm';
import type { ConnectionPublic } from '@governed-sql/schemas';
import type { AppDatabase } from '@governed-sql/db';
import {
  connectionPolicies,
  connections,
  decryptSecret,
  encryptSecret,
  getEncryptionKey,
} from '@governed-sql/db';
import { AppError } from '../errors.js';
import { pingTargetDatabase, type TargetConnectionConfig } from './target-client.js';

export type CreateConnectionInput = {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: string;
};

export type UpdateConnectionInput = {
  name?: string;
  status?: 'active' | 'disabled';
  password?: string;
};

const DEFAULT_POLICY = {
  allowedSchemas: ['public'],
  maxRows: 500,
  maxDurationMs: 15000,
  blocklistedTables: [] as string[],
};

export class ConnectionService {
  constructor(private readonly db: AppDatabase['db']) {}

  async list(orgId: string): Promise<ConnectionPublic[]> {
    const rows = await this.db
      .select()
      .from(connections)
      .where(eq(connections.orgId, orgId))
      .orderBy(asc(connections.createdAt));

    return rows.map((row) => this.toPublicConnection(row));
  }

  async get(orgId: string, connectionId: string): Promise<ConnectionPublic> {
    const row = await this.getConnectionRow(orgId, connectionId);
    return this.toPublicConnection(row);
  }

  async create(orgId: string, input: CreateConnectionInput): Promise<ConnectionPublic> {
    const targetConfig = this.toTargetConfig(input);
    await pingTargetDatabase(targetConfig);

    const passwordCiphertext = encryptSecret(input.password, getEncryptionKey());

    const created = await this.db.transaction(async (tx) => {
      const [connection] = await tx
        .insert(connections)
        .values({
          orgId,
          name: input.name,
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          passwordCiphertext,
          sslMode: input.sslMode,
          status: 'active',
        })
        .returning();

      if (!connection) {
        throw new AppError('INTERNAL_ERROR', 'Failed to create connection');
      }

      await tx.insert(connectionPolicies).values({
        connectionId: connection.id,
        ...DEFAULT_POLICY,
      });

      return connection;
    });

    return this.toPublicConnection(created);
  }

  async update(
    orgId: string,
    connectionId: string,
    input: UpdateConnectionInput,
  ): Promise<ConnectionPublic> {
    const existing = await this.getConnectionRow(orgId, connectionId);
    const updates: Partial<typeof connections.$inferInsert> = {};

    if (input.name !== undefined) {
      updates.name = input.name;
    }

    if (input.status !== undefined) {
      updates.status = input.status;
    }

    if (input.password !== undefined) {
      const targetConfig = this.toTargetConfig({
        host: existing.host,
        port: existing.port,
        database: existing.database,
        username: existing.username,
        password: input.password,
        sslMode: existing.sslMode,
      });
      await pingTargetDatabase(targetConfig);
      updates.passwordCiphertext = encryptSecret(input.password, getEncryptionKey());
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('BAD_REQUEST', 'No valid fields to update');
    }

    const [updated] = await this.db
      .update(connections)
      .set(updates)
      .where(and(eq(connections.id, connectionId), eq(connections.orgId, orgId)))
      .returning();

    if (!updated) {
      throw new AppError('NOT_FOUND', 'Connection not found');
    }

    return this.toPublicConnection(updated);
  }

  async test(orgId: string, connectionId: string): Promise<{ ok: true; message: string }> {
    const row = await this.getConnectionRow(orgId, connectionId);
    const config = await this.toTargetConfigFromRow(row);
    await pingTargetDatabase(config);
    return { ok: true, message: 'Connection successful' };
  }

  private async getConnectionRow(orgId: string, connectionId: string) {
    const [row] = await this.db
      .select()
      .from(connections)
      .where(and(eq(connections.id, connectionId), eq(connections.orgId, orgId)))
      .limit(1);

    if (!row) {
      throw new AppError('NOT_FOUND', 'Connection not found');
    }

    return row;
  }

  private async toTargetConfigFromRow(
    row: typeof connections.$inferSelect,
  ): Promise<TargetConnectionConfig> {
    const password = decryptSecret(row.passwordCiphertext, getEncryptionKey());
    return {
      host: row.host,
      port: row.port,
      database: row.database,
      username: row.username,
      password,
      sslMode: row.sslMode,
    };
  }

  private toTargetConfig(
    input: Pick<
      CreateConnectionInput,
      'host' | 'port' | 'database' | 'username' | 'password' | 'sslMode'
    >,
  ): TargetConnectionConfig {
    return {
      host: input.host,
      port: input.port,
      database: input.database,
      username: input.username,
      password: input.password,
      sslMode: input.sslMode,
    };
  }

  private toPublicConnection(row: typeof connections.$inferSelect): ConnectionPublic {
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      database: row.database,
      username: row.username,
      sslMode: row.sslMode,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
