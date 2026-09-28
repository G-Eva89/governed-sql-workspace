import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../errors.js';

const MODEL = 'claude-sonnet-5';

export type GenerateSqlToolResult = {
  sql: string | null;
  explanation: string;
  warnings: string[];
};

const GENERATE_SQL_TOOL = {
  name: 'generate_sql',
  description:
    'Return the read-only SQL statement (or null if none is appropriate) that answers the question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      sql: {
        type: ['string', 'null'],
        description: 'A single read-only SELECT statement, or null if no valid query can answer the question.',
      },
      explanation: {
        type: 'string',
        description: 'A short, plain-English explanation of what the query does, or why none could be generated.',
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any caveats, e.g. referencing a table/column not found in the provided schema.',
      },
    },
    required: ['sql', 'explanation', 'warnings'],
  },
};

export type AnthropicChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function requireAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new AppError(
      'INTERNAL_ERROR',
      'ANTHROPIC_API_KEY is not configured; the chat feature is unavailable',
    );
  }
  return key;
}

export class AnthropicNlClient {
  private client: Anthropic | undefined;

  constructor(private readonly apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {}

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.apiKey ?? requireAnthropicApiKey();
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async generateSql(
    systemPrompt: string,
    messages: AnthropicChatMessage[],
  ): Promise<GenerateSqlToolResult> {
    let response;
    try {
      response = await this.getClient().messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: [GENERATE_SQL_TOOL],
        tool_choice: { type: 'tool', name: 'generate_sql' },
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new AppError('CONNECTION_ERROR', 'LLM provider rate limit exceeded, try again shortly');
      }
      if (error instanceof Anthropic.APIError) {
        throw new AppError('CONNECTION_ERROR', 'LLM provider request failed');
      }
      throw new AppError(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'LLM request failed',
      );
    }

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUseBlock) {
      throw new AppError('INTERNAL_ERROR', 'LLM did not return a generate_sql tool call');
    }

    const input = toolUseBlock.input as Partial<GenerateSqlToolResult>;
    if (typeof input.explanation !== 'string' || !Array.isArray(input.warnings)) {
      throw new AppError('INTERNAL_ERROR', 'LLM returned an unexpected response shape');
    }

    return {
      sql: typeof input.sql === 'string' ? input.sql : null,
      explanation: input.explanation,
      warnings: input.warnings.filter((warning): warning is string => typeof warning === 'string'),
    };
  }
}
