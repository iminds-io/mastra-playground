import { describe, expect, it } from 'vitest';

import '../../src/db/client';
import { listAppIndexes, listAppTables } from '../../src/db/schema';

describe('database schema', () => {
  it('contains the mindspace control-plane tables', async () => {
    const tables = await listAppTables();

    expect(tables).toContain('mindspace_roots');
    expect(tables).toContain('mindspace_bindings');
    expect(tables).toContain('mindspace_locks');
  });

  it('contains the project settings foundation tables', async () => {
    const tables = await listAppTables();

    expect(tables).toContain('project_memberships');
    expect(tables).toContain('project_invitations');
    expect(tables).toContain('project_mind_configs');
  });

  it('contains the user-centric project membership lookup index', async () => {
    const indexes = await listAppIndexes();

    expect(indexes).toContain('project_memberships_user_lookup_idx');
  });
});
