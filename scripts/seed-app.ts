/**
 * Root entrypoint for app DB seed.
 * Prefer: pnpm db:seed
 */
import { loadEnvFiles, requireDatabaseUrl } from '../packages/db/src/env.js';
import { seedAppDatabase } from '../packages/db/src/seed.js';

loadEnvFiles();
await seedAppDatabase(requireDatabaseUrl());
