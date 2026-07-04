import { and, asc, eq, inArray } from 'drizzle-orm';
import type { ApiKeyPublic, CreateApiKeyRequest } from '@governed-sql/schemas';
import type { AppDatabase } from '@governed-sql/db';
import { apiKeys, connections } from '@governed-sql/db';
import { AppError } from '../errors.js';
import { generateApiKeySecret, hashApiKey } from './api-key-crypto.js';

export type VerifiedApiKey = {
  id: string;
  orgId: string;
  scopes: string[];
};

export type CreateApiKeyResult = ApiKeyPublic & {
  secret: string;
};

export class ApiKeyService {
  constructor(private readonly db: AppDatabase['db']) {}

  async create(orgId: string, input: CreateApiKeyRequest): Promise<CreateApiKeyResult> {
    await this.validateScopes(orgId, input.scopes);

    const { secret, prefix, hash } = generateApiKeySecret();
    const [row] = await this.db
      .insert(apiKeys)
      .values({
        orgId,
        name: input.name,
        keyPrefix: prefix,
        keyHash: hash,
        scopes: input.scopes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      });

    if (!row) {
      throw new AppError('INTERNAL_ERROR', 'Failed to create API key');
    }

    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      secret,
    };
  }

  async list(orgId: string): Promise<ApiKeyPublic[]> {
    const rows = await this.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.orgId, orgId))
      .orderBy(asc(apiKeys.createdAt));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async revoke(orgId: string, keyId: string): Promise<void> {
    const [row] = await this.db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)))
      .returning({ id: apiKeys.id });

    if (!row) {
      throw new AppError('NOT_FOUND', 'API key not found');
    }
  }

  async verify(rawKey: string): Promise<VerifiedApiKey> {
    if (!rawKey.startsWith('gsw_')) {
      throw new AppError('UNAUTHORIZED', 'Invalid API key');
    }

    const keyHash = hashApiKey(rawKey);
    const [row] = await this.db
      .select({
        id: apiKeys.id,
        orgId: apiKeys.orgId,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!row) {
      throw new AppError('UNAUTHORIZED', 'Invalid API key');
    }

    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new AppError('UNAUTHORIZED', 'API key has expired');
    }

    return {
      id: row.id,
      orgId: row.orgId,
      scopes: row.scopes,
    };
  }

  assertConnectionScope(scopes: string[], connectionId: string): void {
    if (scopes.includes('*')) {
      return;
    }
    if (!scopes.includes(connectionId)) {
      throw new AppError('FORBIDDEN', 'API key is not scoped to this connection');
    }
  }

  filterScopedConnections<T extends { id: string }>(scopes: string[], items: T[]): T[] {
    if (scopes.includes('*')) {
      return items;
    }
    const allowed = new Set(scopes);
    return items.filter((item) => allowed.has(item.id));
  }

  private async validateScopes(orgId: string, scopes: string[]): Promise<void> {
    if (scopes.length === 0) {
      throw new AppError('BAD_REQUEST', 'At least one scope is required');
    }

    if (scopes.includes('*')) {
      if (scopes.length !== 1) {
        throw new AppError('BAD_REQUEST', 'Wildcard scope must be the only scope');
      }
      return;
    }

    const uniqueScopes = [...new Set(scopes)];
    const rows = await this.db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.orgId, orgId), inArray(connections.id, uniqueScopes)));

    if (rows.length !== uniqueScopes.length) {
      throw new AppError('BAD_REQUEST', 'One or more scopes reference unknown connections');
    }
  }
}
