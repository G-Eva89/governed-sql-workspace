import { z } from 'zod';

export const apiKeyScopeSchema = z.union([z.literal('*'), z.string().uuid()]);

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(apiKeyScopeSchema).min(1),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiKeyRequest = z.infer<typeof createApiKeySchema>;

export const apiKeyPublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type ApiKeyPublic = z.infer<typeof apiKeyPublicSchema>;

export const createApiKeyResponseSchema = apiKeyPublicSchema.extend({
  secret: z.string(),
});

export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

export const apiKeyListResponseSchema = z.object({
  apiKeys: z.array(apiKeyPublicSchema),
});
