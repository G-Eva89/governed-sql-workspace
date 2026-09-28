import { z } from 'zod';

export const chatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  sql: z.string().nullable().optional(),
});

export type ChatTurn = z.infer<typeof chatTurnSchema>;

export const generateSqlRequestSchema = z.object({
  question: z.string().trim().min(1, 'Question is required').max(2000),
  history: z.array(chatTurnSchema).max(20).default([]),
});

export type GenerateSqlRequest = z.infer<typeof generateSqlRequestSchema>;

export const generateSqlResponseSchema = z.object({
  sql: z.string().nullable(),
  explanation: z.string(),
  warnings: z.array(z.string()),
});

export type GenerateSqlResponse = z.infer<typeof generateSqlResponseSchema>;
