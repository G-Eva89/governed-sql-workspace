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

export async function pingTargetDatabase(config: TargetConnectionConfig): Promise<void> {
  const sql = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl: config.sslMode === 'require' || config.sslMode === 'verify-full' ? 'require' : false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  });

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
