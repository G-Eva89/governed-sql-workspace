import { describe, expect, it } from 'vitest';
import { buildSchemaContext, buildSystemPrompt, type TableSchema } from './prompt-builder.js';

function makeTableSchema(name: string, columnCount = 2): TableSchema {
  return {
    table: { schema: 'public', name, type: 'table' },
    columns: Array.from({ length: columnCount }, (_, index) => ({
      name: `col_${index}`,
      dataType: 'text',
      isNullable: index % 2 === 0,
      defaultValue: null,
      ordinalPosition: index + 1,
    })),
  };
}

describe('buildSchemaContext', () => {
  it('formats tables as a compact DDL-like block', () => {
    const context = buildSchemaContext([makeTableSchema('film', 2)]);
    expect(context).toBe('public.film(col_0 text, col_1 text NOT NULL)');
  });

  it('returns an empty string for no tables', () => {
    expect(buildSchemaContext([])).toBe('');
  });

  it('truncates columns beyond the cap and appends an ellipsis marker', () => {
    const context = buildSchemaContext([makeTableSchema('wide_table', 50)]);
    expect(context).toContain('...');
    expect(context.match(/col_\d+/g)).toHaveLength(40);
  });

  it('truncates tables beyond the cap and appends a note', () => {
    const tables = Array.from({ length: 65 }, (_, index) => makeTableSchema(`table_${index}`, 1));
    const context = buildSchemaContext(tables);
    const lines = context.split('\n');
    expect(lines).toHaveLength(61);
    expect(lines[60]).toBe('... 5 more table(s) omitted for brevity ...');
  });
});

describe('buildSystemPrompt', () => {
  it('embeds the schema context and injection-safety framing', () => {
    const prompt = buildSystemPrompt('public.film(title text)');
    expect(prompt).toContain('public.film(title text)');
    expect(prompt).toContain('not instructions');
    expect(prompt).toContain('single read-only SELECT statement');
  });

  it('falls back to a placeholder when there is no schema', () => {
    const prompt = buildSystemPrompt('');
    expect(prompt).toContain('(no tables available)');
  });
});
