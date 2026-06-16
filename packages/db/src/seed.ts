import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { createDb } from './client.js';
import { encryptSecret, getEncryptionKey } from './crypto.js';
import { loadEnvFiles, requireDatabaseUrl } from './env.js';
import {
  connectionPolicies,
  connections,
  memberships,
  organizations,
  users,
} from './schema/index.js';

const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const DEFAULT_ORG_NAME = 'Demo Organization';
const PAGILA_CONNECTION_NAME = 'Pagila Demo';

export type SeedResult = {
  adminEmail: string;
  orgName: string;
  connectionName: string;
  skipped: boolean;
};

export async function seedAppDatabase(databaseUrl: string): Promise<SeedResult> {
  const adminEmail = process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const orgName = process.env.SEED_ORG_NAME ?? DEFAULT_ORG_NAME;
  const encryptionKey = getEncryptionKey();

  const { db, sql } = createDb(databaseUrl);

  try {
    const existingAdmin = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (existingAdmin.length > 0) {
      console.log(`Admin user ${adminEmail} already exists; skipping seed.`);
      return {
        adminEmail,
        orgName,
        connectionName: PAGILA_CONNECTION_NAME,
        skipped: true,
      };
    }

    const passwordHash = await hash(adminPassword, 12);

    const [org] = await db
      .insert(organizations)
      .values({ name: orgName })
      .returning({ id: organizations.id });

    if (!org) {
      throw new Error('Failed to create organization');
    }

    const [admin] = await db
      .insert(users)
      .values({
        email: adminEmail,
        passwordHash,
      })
      .returning({ id: users.id });

    if (!admin) {
      throw new Error('Failed to create admin user');
    }

    await db.insert(memberships).values({
      userId: admin.id,
      orgId: org.id,
      role: 'admin',
    });

    const pagilaHost = process.env.PAGILA_CONNECTION_HOST ?? 'localhost';
    const pagilaPort = Number(process.env.PAGILA_CONNECTION_PORT ?? 5434);
    const pagilaDatabase = process.env.PAGILA_CONNECTION_DATABASE ?? 'pagila';
    const pagilaUsername = process.env.PAGILA_CONNECTION_USERNAME ?? 'pagila_ro';
    const pagilaPassword = process.env.PAGILA_CONNECTION_PASSWORD ?? 'pagila_ro';

    const [connection] = await db
      .insert(connections)
      .values({
        orgId: org.id,
        name: PAGILA_CONNECTION_NAME,
        host: pagilaHost,
        port: pagilaPort,
        database: pagilaDatabase,
        username: pagilaUsername,
        passwordCiphertext: encryptSecret(pagilaPassword, encryptionKey),
        sslMode: 'disable',
        status: 'active',
      })
      .returning({ id: connections.id });

    if (!connection) {
      throw new Error('Failed to create Pagila connection');
    }

    await db.insert(connectionPolicies).values({
      connectionId: connection.id,
      allowedSchemas: ['public'],
      maxRows: 500,
      maxDurationMs: 15000,
      blocklistedTables: [],
    });

    console.log('Seed complete:');
    console.log(`  Organization: ${orgName}`);
    console.log(`  Admin email:  ${adminEmail}`);
    console.log(`  Admin password: ${adminPassword}`);
    console.log(`  Connection:   ${PAGILA_CONNECTION_NAME} -> ${pagilaHost}:${pagilaPort}/${pagilaDatabase}`);

    return {
      adminEmail,
      orgName,
      connectionName: PAGILA_CONNECTION_NAME,
      skipped: false,
    };
  } finally {
    await sql.end();
  }
}

