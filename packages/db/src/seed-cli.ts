import { requireDatabaseUrl } from './env.js';
import { seedAppDatabase } from './seed.js';

seedAppDatabase(requireDatabaseUrl()).catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
