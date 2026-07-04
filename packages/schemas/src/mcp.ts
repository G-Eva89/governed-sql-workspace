import { z } from 'zod';
import {
  columnDescriptorSchema,
  tableSummarySchema,
} from './metadata.js';

export const mcpConnectionIdSchema = z
  .string()
  .uuid()
  .describe('Connection UUID. Omit when the API key is scoped to one connection.');

export const mcpSchemaNameSchema = z
  .string()
  .trim()
  .min(1)
  .default('public')
  .describe('Postgres schema name (default: public)');

export const mcpListTablesToolInput = {
  connectionId: mcpConnectionIdSchema.optional(),
  schema: mcpSchemaNameSchema,
} as const;

export const mcpListTablesInputSchema = z.object(mcpListTablesToolInput);

export type McpListTablesInput = z.infer<typeof mcpListTablesInputSchema>;

export const mcpListTablesOutputSchema = z.object({
  connectionId: z.string().uuid(),
  schema: z.string(),
  tables: z.array(tableSummarySchema),
});

export type McpListTablesOutput = z.infer<typeof mcpListTablesOutputSchema>;

export const mcpDescribeTableToolInput = {
  connectionId: mcpConnectionIdSchema.optional(),
  schema: mcpSchemaNameSchema,
  table: z.string().trim().min(1).describe('Table or view name'),
} as const;

export const mcpDescribeTableInputSchema = z.object(mcpDescribeTableToolInput);

export type McpDescribeTableInput = z.infer<typeof mcpDescribeTableInputSchema>;

export const mcpDescribeTableOutputSchema = z.object({
  connectionId: z.string().uuid(),
  table: z.object({
    schema: z.string(),
    name: z.string(),
  }),
  columns: z.array(columnDescriptorSchema),
});

export type McpDescribeTableOutput = z.infer<typeof mcpDescribeTableOutputSchema>;

export const mcpRunQueryToolInput = {
  connectionId: mcpConnectionIdSchema.optional(),
  sql: z.string().trim().min(1, 'SQL is required').describe('Read-only SQL to execute'),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe('Optional note about why the query is being run'),
} as const;

export const mcpRunQueryInputSchema = z.object(mcpRunQueryToolInput);

export type McpRunQueryInput = z.infer<typeof mcpRunQueryInputSchema>;

export const mcpRunQueryOutputSchema = z.object({
  connectionId: z.string().uuid(),
  reason: z.string().nullable(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export type McpRunQueryOutput = z.infer<typeof mcpRunQueryOutputSchema>;

export const mcpGetQueryHistoryToolInput = {
  connectionId: mcpConnectionIdSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum number of audit events to return'),
} as const;

export const mcpGetQueryHistoryInputSchema = z.object(mcpGetQueryHistoryToolInput);

export type McpGetQueryHistoryInput = z.infer<typeof mcpGetQueryHistoryInputSchema>;

export { auditListResponseSchema as mcpGetQueryHistoryOutputSchema } from './audit.js';
export type { AuditListResult as McpGetQueryHistoryOutput } from './audit.js';
