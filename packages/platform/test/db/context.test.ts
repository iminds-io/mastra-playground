import { describe, it, expect, afterEach } from 'vitest';

import { setDatabasePool, getDatabasePool } from '../../src/db/context';

describe('database context', () => {
  afterEach(() => {
    setDatabasePool(undefined as any);
  });

  it('returns the pool that was set', () => {
    const fakePool = { query: async () => ({ rows: [] }) } as any;
    setDatabasePool(fakePool);
    expect(getDatabasePool()).toBe(fakePool);
  });

  it('throws when no pool has been set', () => {
    expect(() => getDatabasePool()).toThrow('Database pool has not been initialized');
  });
});
