// ABOUTME: Unit tests for pure helpers in test-db (branch name + SQL split).
// ABOUTME: Does not exercise the Neon API — those are tested via integration runs.

import { describe, it, expect } from 'vitest';
import { createTestBranchName, splitSqlStatements } from './test-db';

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
});
