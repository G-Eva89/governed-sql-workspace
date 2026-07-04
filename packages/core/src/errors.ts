import type { ApiErrorCode } from '@governed-sql/schemas';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  POLICY_VIOLATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONNECTION_ERROR: 502,
  INTERNAL_ERROR: 500,
  TIMEOUT: 504,
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function formatStructuredError(
  code: ApiErrorCode,
  message: string,
  requestId?: string,
): { error: { code: ApiErrorCode; message: string; requestId?: string } } {
  return {
    error: {
      code,
      message,
      ...(requestId ? { requestId } : {}),
    },
  };
}

export function formatAppError(error: AppError, requestId?: string) {
  return formatStructuredError(error.code, error.message, requestId);
}
