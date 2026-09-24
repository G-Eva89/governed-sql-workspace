import { z } from 'zod';

export const connectionStatusSchema = z.enum(['active', 'disabled']);

export const sslModeSchema = z.enum(['disable', 'require', 'prefer', 'verify-full']);

export const createConnectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  database: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  sslMode: sslModeSchema.default('disable'),
});

export type CreateConnectionRequest = z.infer<typeof createConnectionSchema>;

export const updateConnectionSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: connectionStatusSchema.optional(),
    password: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export type UpdateConnectionRequest = z.infer<typeof updateConnectionSchema>;

export const connectionPublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  database: z.string(),
  username: z.string(),
  sslMode: z.string(),
  status: connectionStatusSchema,
  createdAt: z.string(),
});

export type ConnectionPublic = z.infer<typeof connectionPublicSchema>;

export const connectionListResponseSchema = z.object({
  connections: z.array(connectionPublicSchema),
});

export const connectionTestResponseSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
});

export type ConnectionTestResult = z.infer<typeof connectionTestResponseSchema>;
