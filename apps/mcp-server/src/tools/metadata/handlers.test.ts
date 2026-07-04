import { describe, expect, it } from 'vitest';
import { AppError } from '@governed-sql/core';
import {
  mcpDescribeTableInputSchema,
  mcpListTablesInputSchema,
} from '@governed-sql/schemas';
import { assertValidTableName } from './handlers.js';

describe('metadata tool schemas', () => {
  it('applies default schema for list_tables input', () => {
    const parsed = mcpListTablesInputSchema.parse({});
    expect(parsed.schema).toBe('public');
  });

  it('requires table name for describe_table input', () => {
    expect(() => mcpDescribeTableInputSchema.parse({ schema: 'public' })).toThrow();
  });
});

describe('assertValidTableName', () => {
  it('accepts simple identifiers', () => {
    expect(() => assertValidTableName('film')).not.toThrow();
    expect(() => assertValidTableName('rental_item')).not.toThrow();
  });

  it('rejects invalid identifiers', () => {
    expect(() => assertValidTableName('film;drop')).toThrow(AppError);
    expect(() => assertValidTableName('../film')).toThrow(AppError);
  });
});
