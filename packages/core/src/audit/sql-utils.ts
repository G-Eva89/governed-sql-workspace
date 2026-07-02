import { createHash } from 'node:crypto';

const SQL_PREVIEW_MAX_LENGTH = 500;

export function hashSql(sql: string): string {
  return createHash('sha256').update(sql.trim()).digest('hex');
}

export function previewSql(sql: string): string {
  const trimmed = sql.trim();
  if (trimmed.length <= SQL_PREVIEW_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, SQL_PREVIEW_MAX_LENGTH)}…`;
}
