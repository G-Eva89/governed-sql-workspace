import { defineConfig } from 'drizzle-kit';
import { loadEnvFiles } from './src/env.js';

loadEnvFiles();

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5433/workspace_app',
  },
});
