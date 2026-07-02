import pkg from 'node-sql-parser';
import { AppError } from '../errors.js';

const { Parser } = pkg;
const parser = new Parser();

const DEFAULT_SCHEMA = 'public';

export type PolicyValidationOptions = {
  allowedSchemas?: string[];
  blocklistedTables?: string[];
};

type ParsedFromItem = {
  db?: string | null;
  table?: string;
  expr?: {
    ast?: ParsedStatement;
  };
};

type ParsedCte = {
  name?: { value?: string };
  stmt?: ParsedStatement;
};

type ParsedStatement = {
  type?: string;
  with?: ParsedCte[];
  from?: ParsedFromItem[] | null;
  into?: { type?: string; expr?: unknown };
};

function hasSelectInto(statement: ParsedStatement): boolean {
  return statement.into?.type === 'into' && statement.into.expr != null;
}

function normalizeSchema(db: string | null | undefined): string {
  return db ?? DEFAULT_SCHEMA;
}

function collectCteNames(ctes: ParsedCte[] | undefined): Set<string> {
  const names = new Set<string>();
  for (const cte of ctes ?? []) {
    const name = cte.name?.value;
    if (name) {
      names.add(name);
    }
  }
  return names;
}

type TableReference = {
  schema: string;
  table: string;
};

function collectTableReferences(
  statement: ParsedStatement,
  cteNames: Set<string> = new Set(),
): TableReference[] {
  const localCteNames = new Set([...cteNames, ...collectCteNames(statement.with)]);
  const refs: TableReference[] = [];

  for (const cte of statement.with ?? []) {
    if (cte.stmt) {
      refs.push(...collectTableReferences(cte.stmt, localCteNames));
    }
  }

  for (const fromItem of statement.from ?? []) {
    if (fromItem.expr?.ast) {
      refs.push(...collectTableReferences(fromItem.expr.ast, localCteNames));
      continue;
    }

    const table = fromItem.table;
    if (!table || localCteNames.has(table)) {
      continue;
    }

    refs.push({
      schema: normalizeSchema(fromItem.db),
      table,
    });
  }

  return refs;
}

function parseStatement(rawSql: string): ParsedStatement {
  const sql = rawSql.trim();
  if (!sql) {
    throw new AppError('POLICY_VIOLATION', 'SQL must not be empty');
  }

  let ast: ParsedStatement | ParsedStatement[];
  try {
    ast = parser.astify(sql.replace(/;\s*$/, ''), {
      database: 'PostgresQL',
    }) as ParsedStatement | ParsedStatement[];
  } catch {
    throw new AppError('POLICY_VIOLATION', 'SQL could not be parsed');
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length > 1) {
    throw new AppError('POLICY_VIOLATION', 'Multi-statement SQL is not allowed');
  }

  const statement = statements[0];
  if (!statement) {
    throw new AppError('POLICY_VIOLATION', 'SQL must not be empty');
  }

  return statement;
}

export class PolicyEngine {
  validateReadOnlySql(rawSql: string, options?: PolicyValidationOptions): void {
    const statement = parseStatement(rawSql);
    this.assertReadOnlyStatement(statement);

    if (options?.allowedSchemas || options?.blocklistedTables) {
      this.assertSchemaPolicy(statement, options);
    }
  }

  private assertReadOnlyStatement(statement: ParsedStatement): void {
    const type = statement.type?.toLowerCase();
    if (type !== 'select') {
      throw new AppError(
        'POLICY_VIOLATION',
        `Only SELECT statements are allowed (got ${type ?? 'unknown'})`,
      );
    }

    if (hasSelectInto(statement)) {
      throw new AppError('POLICY_VIOLATION', 'SELECT INTO is not allowed');
    }

    for (const cte of statement.with ?? []) {
      this.assertReadOnlyCte(cte);
    }
  }

  private assertReadOnlyCte(cte: ParsedCte): void {
    if (!cte.stmt) {
      return;
    }

    const type = cte.stmt.type?.toLowerCase();
    if (type !== 'select') {
      throw new AppError(
        'POLICY_VIOLATION',
        `Only read-only CTEs are allowed (got ${type ?? 'unknown'})`,
      );
    }

    if (hasSelectInto(cte.stmt)) {
      throw new AppError('POLICY_VIOLATION', 'SELECT INTO is not allowed');
    }

    for (const nested of cte.stmt.with ?? []) {
      this.assertReadOnlyCte(nested);
    }
  }

  private assertSchemaPolicy(statement: ParsedStatement, options: PolicyValidationOptions): void {
    const allowedSchemas = new Set(
      (options.allowedSchemas ?? [DEFAULT_SCHEMA]).map((schema) => schema.toLowerCase()),
    );
    const blocklistedTables = new Set(
      (options.blocklistedTables ?? []).map((table) => table.toLowerCase()),
    );

    for (const ref of collectTableReferences(statement)) {
      if (!allowedSchemas.has(ref.schema.toLowerCase())) {
        throw new AppError(
          'POLICY_VIOLATION',
          `Schema "${ref.schema}" is not allowed (allowed: ${[...allowedSchemas].join(', ')})`,
        );
      }

      if (blocklistedTables.has(ref.table.toLowerCase())) {
        throw new AppError('POLICY_VIOLATION', `Table "${ref.table}" is blocklisted`);
      }
    }
  }
}
