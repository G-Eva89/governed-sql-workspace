import { AppError, formatAppError, isAppError } from '@governed-sql/core';
import { structuredErrorSchema } from '@governed-sql/schemas';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function jsonToolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(error: unknown): CallToolResult {
  if (isAppError(error)) {
    const body = formatAppError(error);
    structuredErrorSchema.parse(body);
    return {
      content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
      isError: true,
    };
  }

  const message = error instanceof Error ? error.message : 'Unexpected error';
  const body = formatAppError(new AppError('INTERNAL_ERROR', message));
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    isError: true,
  };
}

export function parseToolErrorResult(result: CallToolResult): {
  code: string;
  message: string;
} {
  const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
  const parsed = structuredErrorSchema.parse(JSON.parse(text));
  return parsed.error;
}

export async function runToolHandler<T>(
  handler: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    return jsonToolResult(await handler());
  } catch (error) {
    return toolError(error);
  }
}
