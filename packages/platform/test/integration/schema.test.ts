import { describe, expect, it } from 'vitest';

import { listAppTables } from '../../src/db/schema';

describe('database schema', () => {
  it('contains the workspace control-plane tables', async () => {
    const tables = await listAppTables();

    expect(tables).toContain('workspace_roots');
    expect(tables).toContain('workspace_bindings');
    expect(tables).toContain('workspace_locks');
  });
});
