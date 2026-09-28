import type { AnthropicChatMessage, AnthropicNlClient } from './anthropic-client.js';
import { buildSchemaContext, buildSystemPrompt, type TableSchema } from './prompt-builder.js';
import type { ConnectionService } from '../connections/connection-service.js';
import type { MetadataService } from '../metadata/metadata-service.js';

const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  sql?: string | null;
};

export type GenerateSqlInput = {
  orgId: string;
  connectionId: string;
  question: string;
  history: ChatTurn[];
};

export type GenerateSqlResult = {
  sql: string | null;
  explanation: string;
  warnings: string[];
};

function turnToMessage(turn: ChatTurn): AnthropicChatMessage {
  if (turn.role === 'user') {
    return { role: 'user', content: turn.content };
  }
  const sqlLine = turn.sql ? `Generated SQL: ${turn.sql}\n` : '';
  return { role: 'assistant', content: `${sqlLine}Explanation: ${turn.content}` };
}

export class NlToSqlService {
  private readonly schemaCache = new Map<string, { context: string; expiresAt: number }>();

  constructor(
    private readonly metadataService: MetadataService,
    private readonly connectionService: ConnectionService,
    private readonly anthropicClient: AnthropicNlClient,
  ) {}

  async generateSql(input: GenerateSqlInput): Promise<GenerateSqlResult> {
    const schemaContext = await this.getSchemaContext(input.orgId, input.connectionId);
    const systemPrompt = buildSystemPrompt(schemaContext);

    const messages: AnthropicChatMessage[] = [
      ...input.history.map(turnToMessage),
      { role: 'user', content: input.question },
    ];

    return this.anthropicClient.generateSql(systemPrompt, messages);
  }

  private async getSchemaContext(orgId: string, connectionId: string): Promise<string> {
    const cacheKey = `${orgId}:${connectionId}`;
    const cached = this.schemaCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context;
    }

    const policy = await this.connectionService.getPolicy(orgId, connectionId);
    const schemas = policy.allowedSchemas.length > 0 ? policy.allowedSchemas : ['public'];

    const tableSchemas: TableSchema[] = [];
    for (const schema of schemas) {
      const tables = await this.metadataService.listTables(orgId, connectionId, schema);
      for (const table of tables) {
        if (policy.blocklistedTables.includes(table.name)) {
          continue;
        }
        const columns = await this.metadataService.describeTable(
          orgId,
          connectionId,
          table.name,
          schema,
        );
        tableSchemas.push({ table, columns });
      }
    }

    const context = buildSchemaContext(tableSchemas);
    this.schemaCache.set(cacheKey, { context, expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS });
    return context;
  }
}
