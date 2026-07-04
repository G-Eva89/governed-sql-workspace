import { describe, expect, it } from 'vitest';
import {
  mcpGetQueryHistoryInputSchema,
  mcpRunQueryInputSchema,
} from '@governed-sql/schemas';

describe('query tool schemas', () => {
  it('requires sql for run_query input', () => {
    expect(() => mcpRunQueryInputSchema.parse({})).toThrow();
  });

  it('accepts optional reason for run_query input', () => {
    const parsed = mcpRunQueryInputSchema.parse({
      sql: 'SELECT 1',
      reason: 'Count rows',
    });
    expect(parsed.reason).toBe('Count rows');
  });

  it('applies default limit for get_query_history input', () => {
    const parsed = mcpGetQueryHistoryInputSchema.parse({});
    expect(parsed.limit).toBe(20);
  });
});
