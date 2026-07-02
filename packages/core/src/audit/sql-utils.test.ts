import { describe, expect, it } from 'vitest';
import { hashSql, previewSql } from './sql-utils.js';

describe('sql-utils', () => {
  it('hashSql is stable for the same SQL', () => {
    const sql = 'SELECT title FROM film';
    expect(hashSql(sql)).toBe(hashSql(sql));
    expect(hashSql(`  ${sql}  `)).toBe(hashSql(sql));
  });

  it('previewSql truncates long SQL', () => {
    const sql = 'SELECT ' + 'x'.repeat(600);
    const preview = previewSql(sql);
    expect(preview.length).toBeLessThan(sql.length);
    expect(preview.endsWith('…')).toBe(true);
  });
});
