import { z } from 'zod';

export const auditStatusSchema = z.enum(['success', 'error', 'policy_violation']);
export const auditSourceSchema = z.enum(['web', 'mcp', 'api']);
export const principalTypeSchema = z.enum(['user', 'api_key']);

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export const auditEventPublicSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid().nullable(),
  principalType: principalTypeSchema,
  principalId: z.string().uuid(),
  action: z.string(),
  sqlHash: z.string().nullable(),
  sqlPreview: z.string().nullable(),
  rowCount: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  status: auditStatusSchema,
  errorCode: z.string().nullable(),
  source: auditSourceSchema,
  mcpTool: z.string().nullable(),
  createdAt: z.string(),
});

export type AuditEventPublic = z.infer<typeof auditEventPublicSchema>;

export const auditListResponseSchema = z.object({
  events: z.array(auditEventPublicSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type AuditListResult = z.infer<typeof auditListResponseSchema>;
