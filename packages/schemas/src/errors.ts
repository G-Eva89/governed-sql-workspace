import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
  'POLICY_VIOLATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'TIMEOUT',
  'CONNECTION_ERROR',
  'INTERNAL_ERROR',
  'BAD_REQUEST',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export const structuredErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

export type StructuredError = z.infer<typeof structuredErrorSchema>;
