import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiKeyService } from './api-key-service.js';
import { generateApiKeySecret, hashApiKey } from './api-key-crypto.js';
import { AppError } from '../errors.js';
import { createDb, loadEnvFiles, requireDatabaseUrl } from '@governed-sql/db';
import { apiKeys, connections, organizations } from '@governed-sql/db';

loadEnvFiles();

describe('ApiKeyService', () => {
  const databaseUrl = process.env.DATABASE_URL ?? requireDatabaseUrl();
  const { db, sql } = createDb(databaseUrl);
  const service = new ApiKeyService(db);
  let orgId: string;
  let connectionId: string;
  let createdKeyId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `ApiKey Test Org ${Date.now()}` })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [connection] = await db
      .insert(connections)
      .values({
        orgId,
        name: 'Test Connection',
        host: 'localhost',
        port: 5434,
        database: 'pagila',
        username: 'pagila_ro',
        passwordCiphertext: 'v1:test',
        sslMode: 'disable',
        status: 'active',
      })
      .returning({ id: connections.id });
    connectionId = connection!.id;
  });

  it('creates a key and verifies it', async () => {
    const created = await service.create(orgId, {
      name: 'Test Key',
      scopes: [connectionId],
    });

    createdKeyId = created.id;
    expect(created.secret.startsWith('gsw_')).toBe(true);
    expect(created.keyPrefix).toBe(created.secret.slice(0, 8));
    expect(created.scopes).toEqual([connectionId]);

    const verified = await service.verify(created.secret);
    expect(verified.id).toBe(created.id);
    expect(verified.orgId).toBe(orgId);
    expect(verified.scopes).toEqual([connectionId]);
  });

  it('lists keys without returning secrets', async () => {
    const keys = await service.list(orgId);
    expect(keys.some((key) => key.id === createdKeyId)).toBe(true);
    expect(keys.every((key) => !('secret' in key))).toBe(true);
  });

  it('rejects invalid keys', async () => {
    await expect(service.verify('gsw_not-a-real-key')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(service.verify('bad-prefix')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('enforces connection scope', () => {
    expect(() => service.assertConnectionScope([connectionId], connectionId)).not.toThrow();
    expect(() => service.assertConnectionScope(['*'], connectionId)).not.toThrow();
    expect(() => service.assertConnectionScope(['00000000-0000-0000-0000-000000000099'], connectionId)).toThrow(
      AppError,
    );
  });

  it('rejects wildcard mixed with connection scopes', async () => {
    await expect(
      service.create(orgId, {
        name: 'Bad Scope',
        scopes: ['*', connectionId],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('revokes a key', async () => {
    const created = await service.create(orgId, {
      name: 'Revoke Me',
      scopes: ['*'],
    });

    await service.revoke(orgId, created.id);
    await expect(service.verify(created.secret)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('hashApiKey is deterministic', () => {
    const { secret } = generateApiKeySecret();
    expect(hashApiKey(secret)).toBe(hashApiKey(secret));
  });

  afterAll(async () => {
    await db.delete(apiKeys).where(eq(apiKeys.orgId, orgId));
    await db.delete(connections).where(eq(connections.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });
});
