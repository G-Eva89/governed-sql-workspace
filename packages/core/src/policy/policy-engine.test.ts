import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.js';
import { PolicyEngine } from './policy-engine.js';

describe('PolicyEngine', () => {
  const engine = new PolicyEngine();

  function expectAllowed(sql: string, options?: { allowedSchemas?: string[] }): void {
    expect(() => engine.validateReadOnlySql(sql, options)).not.toThrow();
  }

  function expectRejected(
    sql: string,
    message?: RegExp | string,
    options?: { allowedSchemas?: string[]; blocklistedTables?: string[] },
  ): void {
    expect(() => engine.validateReadOnlySql(sql, options)).toThrow(AppError);
    try {
      engine.validateReadOnlySql(sql, options);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('POLICY_VIOLATION');
      if (message instanceof RegExp) {
        expect(appError.message).toMatch(message);
      } else if (message) {
        expect(appError.message).toBe(message);
      }
    }
  }

  it('allows a simple SELECT', () => {
    expectAllowed('SELECT 1');
  });

  it('allows SELECT with WHERE, JOIN, and aggregation', () => {
    expectAllowed(`
      SELECT f.title, COUNT(r.rental_id) AS rentals
      FROM film f
      JOIN inventory i ON i.film_id = f.film_id
      JOIN rental r ON r.inventory_id = i.inventory_id
      WHERE f.release_year > 2000
      GROUP BY f.title
      HAVING COUNT(r.rental_id) > 5
    `);
  });

  it('allows SELECT DISTINCT', () => {
    expectAllowed('SELECT DISTINCT rating FROM film');
  });

  it('allows a single CTE', () => {
    expectAllowed(`
      WITH recent AS (
        SELECT rental_id, rental_date FROM rental ORDER BY rental_date DESC LIMIT 10
      )
      SELECT * FROM recent
    `);
  });

  it('allows multiple CTEs', () => {
    expectAllowed(`
      WITH a AS (SELECT 1 AS n),
           b AS (SELECT n + 1 AS n FROM a)
      SELECT * FROM b
    `);
  });

  it('allows WITH RECURSIVE read-only CTEs', () => {
    expectAllowed(`
      WITH RECURSIVE nums AS (
        SELECT 1 AS n
        UNION ALL
        SELECT n + 1 FROM nums WHERE n < 5
      )
      SELECT * FROM nums
    `);
  });

  it('allows SELECT with a trailing semicolon', () => {
    expectAllowed('SELECT title FROM film;');
  });

  it('allows SELECT with inline and block comments', () => {
    expectAllowed(`
      -- top films
      SELECT title /* title column */ FROM film
    `);
  });

  it('rejects INSERT', () => {
    expectRejected('INSERT INTO film (title) VALUES (\'Test\')', /INSERT/i);
  });

  it('rejects UPDATE', () => {
    expectRejected('UPDATE film SET title = \'Test\' WHERE film_id = 1', /UPDATE/i);
  });

  it('rejects DELETE', () => {
    expectRejected('DELETE FROM film WHERE film_id = 1', /DELETE/i);
  });

  it('rejects DROP TABLE', () => {
    expectRejected('DROP TABLE film', /DROP/i);
  });

  it('rejects CREATE TABLE', () => {
    expectRejected('CREATE TABLE evil (id int)', /CREATE/i);
  });

  it('rejects ALTER TABLE', () => {
    expectRejected('ALTER TABLE film ADD COLUMN hacked text', /ALTER/i);
  });

  it('rejects TRUNCATE', () => {
    expectRejected('TRUNCATE film', /TRUNCATE/i);
  });

  it('rejects multi-statement SQL with two SELECTs', () => {
    expectRejected('SELECT 1; SELECT 2', /Multi-statement/i);
  });

  it('rejects multi-statement SQL mixing SELECT and DELETE', () => {
    expectRejected('SELECT 1; DELETE FROM film', /Multi-statement/i);
  });

  it('rejects empty SQL', () => {
    expectRejected('   ', 'SQL must not be empty');
  });

  it('rejects invalid SQL syntax', () => {
    expectRejected('SELEC 1 FROM film', 'SQL could not be parsed');
  });

  it('rejects SELECT INTO', () => {
    expectRejected('SELECT * INTO backup FROM film', /SELECT INTO/i);
  });

  it('rejects GRANT statements', () => {
    expectRejected('GRANT SELECT ON film TO public', /GRANT/i);
  });

  it('allows unqualified tables when public schema is allowed', () => {
    expectAllowed('SELECT title FROM film', { allowedSchemas: ['public'] });
  });

  it('allows explicitly qualified public schema tables', () => {
    expectAllowed('SELECT title FROM public.film', { allowedSchemas: ['public'] });
  });

  it('rejects tables outside the schema allowlist', () => {
    expectRejected('SELECT relname FROM pg_catalog.pg_class LIMIT 1', /Schema "pg_catalog"/, {
      allowedSchemas: ['public'],
    });
  });

  it('rejects blocklisted tables', () => {
    expectRejected('SELECT title FROM film', /blocklisted/i, {
      allowedSchemas: ['public'],
      blocklistedTables: ['film'],
    });
  });

  it('rejects disallowed schemas referenced inside subqueries', () => {
    expectRejected(
      'SELECT * FROM (SELECT relname FROM pg_catalog.pg_class LIMIT 1) AS hidden',
      /Schema "pg_catalog"/,
      { allowedSchemas: ['public'] },
    );
  });
});
