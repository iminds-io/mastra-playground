import { describe, expect, it } from 'vitest';

import '../../src/db/client';
import { listAppTables } from '../../src/db/schema';

describe('database schema', () => {
  it('contains the mindspace control-plane tables', async () => {
    const tables = await listAppTables();

    expect(tables).toContain('mindspace_roots');
    expect(tables).toContain('mindspace_bindings');
    expect(tables).toContain('mindspace_locks');
  });
});
