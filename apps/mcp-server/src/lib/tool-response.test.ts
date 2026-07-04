import { describe, expect, it } from 'vitest';
import { AppError } from '@governed-sql/core';
import { structuredErrorSchema } from '@governed-sql/schemas';
import { parseToolErrorResult, runToolHandler, toolError } from './tool-response.js';

describe('MCP structured tool errors', () => {
  it('returns POLICY_VIOLATION in the same shape as the HTTP API (without requestId)', async () => {
    const result = await runToolHandler(async () => {
      throw new AppError('POLICY_VIOLATION', 'DELETE statements are not allowed');
    });

    expect(result.isError).toBe(true);
    const parsed = parseToolErrorResult(result);
    expect(parsed.code).toBe('POLICY_VIOLATION');
    expect(parsed.message).toContain('DELETE');
    expect(structuredErrorSchema.parse(JSON.parse(result.content[0]?.text ?? '{}'))).toBeTruthy();
  });

  it('returns TIMEOUT with a machine-readable code', () => {
    const result = toolError(new AppError('TIMEOUT', 'Query exceeded the maximum duration'));
    const parsed = parseToolErrorResult(result);
    expect(parsed.code).toBe('TIMEOUT');
    expect(parsed.message).toContain('maximum duration');
  });

  it('returns CONNECTION_ERROR with a machine-readable code', () => {
    const result = toolError(new AppError('CONNECTION_ERROR', 'Connection refused'));
    const parsed = parseToolErrorResult(result);
    expect(parsed.code).toBe('CONNECTION_ERROR');
  });

  it('maps unknown errors to INTERNAL_ERROR', () => {
    const result = toolError(new Error('boom'));
    const parsed = parseToolErrorResult(result);
    expect(parsed.code).toBe('INTERNAL_ERROR');
  });
});
