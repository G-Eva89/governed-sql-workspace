import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { AppError, isAppError } from '@governed-sql/core';
import type { ApiBindings } from '../types.js';

function errorBody(code: string, message: string, requestId: string) {
  return {
    error: {
      code,
      message,
      requestId,
    },
  };
}

export const errorHandler: ErrorHandler<ApiBindings> = (error, c) => {
  const requestId = c.get('requestId') ?? 'req_unknown';

  if (isAppError(error)) {
    return c.json(
      errorBody(error.code, error.message, requestId),
      error.status as ContentfulStatusCode,
    );
  }

  if (error instanceof HTTPException) {
    const code = error.status === 401 ? 'UNAUTHORIZED' : error.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST';
    return c.json(errorBody(code, error.message, requestId), error.status);
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => issue.message).join('; ');
    return c.json(errorBody('BAD_REQUEST', message, requestId), 400);
  }

  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );

  return c.json(
    errorBody('INTERNAL_ERROR', 'An unexpected error occurred', requestId),
    500,
  );
};

export function notFoundHandler(c: Parameters<ErrorHandler<ApiBindings>>[1]) {
  const requestId = c.get('requestId') ?? 'req_unknown';
  return c.json(errorBody('NOT_FOUND', 'Route not found', requestId), 404);
}
