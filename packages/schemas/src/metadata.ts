import { z } from 'zod';

export const tableSummarySchema = z.object({
  schema: z.string(),
  name: z.string(),
  type: z.enum(['table', 'view']),
});

export type TableSummary = z.infer<typeof tableSummarySchema>;

export const columnDescriptorSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  isNullable: z.boolean(),
  defaultValue: z.string().nullable(),
  ordinalPosition: z.number().int(),
});

export type ColumnDescriptor = z.infer<typeof columnDescriptorSchema>;

export const listTablesQuerySchema = z.object({
  schema: z.string().trim().min(1).default('public'),
});

export type ListTablesQuery = z.infer<typeof listTablesQuerySchema>;

export const describeTableQuerySchema = z.object({
  schema: z.string().trim().min(1).default('public'),
});

export type DescribeTableQuery = z.infer<typeof describeTableQuerySchema>;

export const listTablesResponseSchema = z.object({
  tables: z.array(tableSummarySchema),
});

export const describeTableResponseSchema = z.object({
  table: z.object({
    schema: z.string(),
    name: z.string(),
  }),
  columns: z.array(columnDescriptorSchema),
});
