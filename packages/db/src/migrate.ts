import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigrationClient } from './client.js';
import { requireDatabaseUrl } from './env.js';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = resolve(packageDir, 'drizzle');

async function main(): Promise<void> {
  const { db, sql } = createMigrationClient(requireDatabaseUrl());
  console.log(`Applying migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  await sql.end();
  console.log('Migrations applied successfully.');
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
