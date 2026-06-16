import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
});

export const authOrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const authMeResponseSchema = z.object({
  user: authUserSchema,
  org: authOrgSchema,
  role: z.enum(['admin', 'member']),
});

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const loginResponseSchema = authMeResponseSchema;

export type LoginResponse = z.infer<typeof loginResponseSchema>;
