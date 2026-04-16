// ABOUTME: Unit tests for pure helpers in test-db (branch name + SQL split).
// ABOUTME: Does not exercise the Neon API — those are tested via integration runs.

import { describe, it, expect } from 'vitest';
import {
  createTestBranchName,
  rewriteDatabaseUrlHost,
  rewriteDatabaseUrlHostAndDatabase,
  splitSqlStatements,
} from './test-db';

describe('test-db helpers', () => {
  describe('createTestBranchName', () => {
    it('produces a branch name with the given prefix and a timestamp', () => {
      const name = createTestBranchName('e2e');
      expect(name).toMatch(/^test-e2e-\d{4}-\d{2}-\d{2}-\d+-[a-z0-9]+$/);
    });

    it('produces unique names on repeated calls', () => {
      const a = createTestBranchName('e2e');
      const b = createTestBranchName('e2e');
      expect(a).not.toBe(b);
    });
  });

  describe('splitSqlStatements', () => {
    it('splits statements on semicolons outside quoted strings', () => {
      const sql = `create table a(x int); create table b(y text);`;
      expect(splitSqlStatements(sql)).toEqual([
        'create table a(x int)',
        'create table b(y text)',
      ]);
    });

    it('ignores semicolons inside single-quoted strings', () => {
      const sql = `insert into t values ('a;b'); insert into t values ('c');`;
      expect(splitSqlStatements(sql)).toEqual([
        "insert into t values ('a;b')",
        "insert into t values ('c')",
      ]);
    });

    it('drops empty statements', () => {
      expect(splitSqlStatements(';;select 1;;')).toEqual(['select 1']);
    });
  });

  describe('rewriteDatabaseUrlHost', () => {
    it('swaps the hostname while preserving user, password, database, and query params', () => {
      const original = 'postgresql://user:secret@old.host.com/mydb?sslmode=require&channel_binding=require';
      const rewritten = rewriteDatabaseUrlHost(original, 'new.host.com');
      const parsed = new URL(rewritten);
      expect(parsed.hostname).toBe('new.host.com');
      expect(parsed.username).toBe('user');
      expect(parsed.password).toBe('secret');
      expect(parsed.pathname).toBe('/mydb');
      expect(parsed.searchParams.get('sslmode')).toBe('require');
      expect(parsed.searchParams.get('channel_binding')).toBe('require');
    });
  });

  describe('rewriteDatabaseUrlHostAndDatabase', () => {
    it('swaps both hostname and database while preserving credentials and query params', () => {
      const original = 'postgresql://user:secret@old.host.com/mydb?sslmode=require';
      const rewritten = rewriteDatabaseUrlHostAndDatabase(original, 'new.host.com', 'neondb');
      const parsed = new URL(rewritten);
      expect(parsed.hostname).toBe('new.host.com');
      expect(parsed.pathname).toBe('/neondb');
      expect(parsed.username).toBe('user');
      expect(parsed.password).toBe('secret');
      expect(parsed.searchParams.get('sslmode')).toBe('require');
    });
  });
});
