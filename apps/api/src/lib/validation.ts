import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodSchema } from 'zod';
import { AppError } from '@governed-sql/core';

export function jsonValidator<T extends ZodSchema>(
  target: keyof ValidationTargets,
  schema: T,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join('; ');
      throw new AppError('BAD_REQUEST', message);
    }
  });
}

export function queryValidator<T extends ZodSchema>(schema: T) {
  return jsonValidator('query', schema);
}
