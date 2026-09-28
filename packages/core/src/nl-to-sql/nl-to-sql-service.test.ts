import { describe, expect, it, vi } from 'vitest';
import type { AnthropicNlClient } from './anthropic-client.js';
import { NlToSqlService } from './nl-to-sql-service.js';
import type { ConnectionService } from '../connections/connection-service.js';
import type { MetadataService } from '../metadata/metadata-service.js';

function makeMetadataService(): MetadataService {
  return {
    listTables: vi.fn().mockResolvedValue([{ schema: 'public', name: 'film', type: 'table' }]),
    describeTable: vi.fn().mockResolvedValue([
      { name: 'film_id', dataType: 'integer', isNullable: false, defaultValue: null, ordinalPosition: 1 },
      { name: 'title', dataType: 'text', isNullable: false, defaultValue: null, ordinalPosition: 2 },
    ]),
  } as unknown as MetadataService;
}

function makeConnectionService(): ConnectionService {
  return {
    getPolicy: vi.fn().mockResolvedValue({
      allowedSchemas: ['public'],
      maxRows: 500,
      maxDurationMs: 15000,
      blocklistedTables: [],
    }),
  } as unknown as ConnectionService;
}

function makeAnthropicClient(
  result: { sql: string | null; explanation: string; warnings: string[] },
): AnthropicNlClient {
  return {
    generateSql: vi.fn().mockResolvedValue(result),
  } as unknown as AnthropicNlClient;
}

describe('NlToSqlService', () => {
  it('builds schema context from metadata and forwards it to the Anthropic client', async () => {
    const metadataService = makeMetadataService();
    const connectionService = makeConnectionService();
    const anthropicClient = makeAnthropicClient({
      sql: 'SELECT title FROM film LIMIT 5',
      explanation: 'Lists the first five film titles.',
      warnings: [],
    });
    const service = new NlToSqlService(metadataService, connectionService, anthropicClient);

    const result = await service.generateSql({
      orgId: 'org-1',
      connectionId: 'conn-1',
      question: 'show me five films',
      history: [],
    });

    expect(result.sql).toBe('SELECT title FROM film LIMIT 5');
    expect(connectionService.getPolicy).toHaveBeenCalledWith('org-1', 'conn-1');
    expect(metadataService.listTables).toHaveBeenCalledWith('org-1', 'conn-1', 'public');

    const [systemPrompt, messages] = (anthropicClient.generateSql as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, Array<{ role: string; content: string }>];
    expect(systemPrompt).toContain('public.film(film_id integer NOT NULL, title text NOT NULL)');
    expect(messages).toEqual([{ role: 'user', content: 'show me five films' }]);
  });

  it('threads prior conversation turns into the message history', async () => {
    const anthropicClient = makeAnthropicClient({
      sql: null,
      explanation: 'No further changes were needed.',
      warnings: [],
    });
    const service = new NlToSqlService(makeMetadataService(), makeConnectionService(), anthropicClient);

    await service.generateSql({
      orgId: 'org-1',
      connectionId: 'conn-1',
      question: 'now just the count',
      history: [
        { role: 'user', content: 'show me five films' },
        { role: 'assistant', content: 'Lists five films.', sql: 'SELECT title FROM film LIMIT 5' },
      ],
    });

    const [, messages] = (anthropicClient.generateSql as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Array<{ role: string; content: string }>,
    ];
    expect(messages).toEqual([
      { role: 'user', content: 'show me five films' },
      {
        role: 'assistant',
        content: 'Generated SQL: SELECT title FROM film LIMIT 5\nExplanation: Lists five films.',
      },
      { role: 'user', content: 'now just the count' },
    ]);
  });

  it('excludes blocklisted tables from the schema context', async () => {
    const metadataService = makeMetadataService();
    (metadataService.listTables as ReturnType<typeof vi.fn>).mockResolvedValue([
      { schema: 'public', name: 'film', type: 'table' },
      { schema: 'public', name: 'staff', type: 'table' },
    ]);
    const connectionService = makeConnectionService();
    (connectionService.getPolicy as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowedSchemas: ['public'],
      maxRows: 500,
      maxDurationMs: 15000,
      blocklistedTables: ['staff'],
    });
    const anthropicClient = makeAnthropicClient({ sql: null, explanation: 'n/a', warnings: [] });
    const service = new NlToSqlService(metadataService, connectionService, anthropicClient);

    await service.generateSql({ orgId: 'org-1', connectionId: 'conn-1', question: 'q', history: [] });

    expect(metadataService.describeTable).toHaveBeenCalledTimes(1);
    expect(metadataService.describeTable).toHaveBeenCalledWith('org-1', 'conn-1', 'film', 'public');
  });

  it('returns the sql: null path unchanged when the model cannot answer', async () => {
    const anthropicClient = makeAnthropicClient({
      sql: null,
      explanation: 'That would require deleting data, which is not supported.',
      warnings: ['Refused: destructive request'],
    });
    const service = new NlToSqlService(makeMetadataService(), makeConnectionService(), anthropicClient);

    const result = await service.generateSql({
      orgId: 'org-1',
      connectionId: 'conn-1',
      question: 'delete all customers',
      history: [],
    });

    expect(result.sql).toBeNull();
    expect(result.warnings).toEqual(['Refused: destructive request']);
  });
});
