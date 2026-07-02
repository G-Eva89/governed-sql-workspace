import { z } from 'zod';

export const runQuerySchema = z.object({
  sql: z.string().trim().min(1, 'SQL is required'),
});

export type RunQueryRequest = z.infer<typeof runQuerySchema>;

export const queryResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export type QueryResult = z.infer<typeof queryResultSchema>;
