import postgres from 'postgres';
import { AppError } from '../errors.js';

export type TargetConnectionConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: string;
};

export type TargetSql = ReturnType<typeof postgres>;

const poolCache = new Map<string, TargetSql>();

function buildPoolKey(config: TargetConnectionConfig): string {
  return `${config.host}:${config.port}:${config.database}:${config.username}:${config.sslMode}`;
}

function createPostgresClient(config: TargetConnectionConfig, max: number): TargetSql {
  return postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl: config.sslMode === 'require' || config.sslMode === 'verify-full' ? 'require' : false,
    max,
    connect_timeout: 10,
    idle_timeout: 20,
  });
}

export function getTargetSql(config: TargetConnectionConfig): TargetSql {
  const key = buildPoolKey(config);
  let client = poolCache.get(key);
  if (!client) {
    client = createPostgresClient(config, 5);
    poolCache.set(key, client);
  }
  return client;
}

export async function closeAllTargetClients(): Promise<void> {
  await Promise.all([...poolCache.values()].map((client) => client.end({ timeout: 5 })));
  poolCache.clear();
}

export async function pingTargetDatabase(config: TargetConnectionConfig): Promise<void> {
  const sql = createPostgresClient(config, 1);

  try {
    await sql`SELECT 1 as ok`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Target database connection failed';
    throw new AppError('CONNECTION_ERROR', message);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
