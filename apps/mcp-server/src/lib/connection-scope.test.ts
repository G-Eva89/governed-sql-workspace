import { describe, expect, it } from 'vitest';
import { AppError } from '@governed-sql/core';
import { resolveConnectionId } from './connection-scope.js';

describe('resolveConnectionId', () => {
  it('uses explicit connectionId when provided', () => {
    expect(resolveConnectionId(['conn-a'], 'conn-b', undefined)).toBe('conn-b');
  });

  it('uses DEFAULT_CONNECTION_ID when input is omitted', () => {
    expect(resolveConnectionId(['*'], undefined, 'conn-default')).toBe('conn-default');
  });

  it('infers a single scoped connection', () => {
    expect(resolveConnectionId(['conn-only'], undefined, undefined)).toBe('conn-only');
  });

  it('requires connectionId for org-wide scope without default', () => {
    expect(() => resolveConnectionId(['*'], undefined, undefined)).toThrow(AppError);
  });

  it('requires connectionId for multi-connection scope', () => {
    expect(() => resolveConnectionId(['conn-a', 'conn-b'], undefined, undefined)).toThrow(AppError);
  });
});
