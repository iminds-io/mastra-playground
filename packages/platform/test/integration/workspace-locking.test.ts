import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { createWorkspaceRoot } from '../../src/db/repositories/workspace-roots';
import { createWorkspaceLockService } from '../../src/workspace/locking';

describe('workspace locking', () => {
  let workspaceRootId: string;

  beforeEach(async () => {
    await pool.query(`
      truncate table
        workspace_provisioning_jobs,
        workspace_events,
        workspace_locks,
        workspace_bindings,
        workspace_roots,
        organization_memberships,
        projects,
        users,
        organizations
      restart identity cascade
    `);

    const organization = await createOrganization({
      name: 'Lock Org',
      firebaseProjectId: 'mindmap-aff6a',
    });
    const project = await createProject({
      organizationId: organization.id,
      name: 'Lock Project',
      slug: 'lock-project',
    });
    const root = await createWorkspaceRoot({
      organizationId: organization.id,
      projectId: project.id,
      rootPath: '/tmp/lock-project',
      status: 'ready',
    });

    workspaceRootId = root.id;
  });

  it('prevents a second active writer lock', async () => {
    const locks = createWorkspaceLockService();

    await locks.acquire({
      workspaceRootId,
      lockType: 'write',
      holder: 'holder-1',
      ttlSeconds: 30,
    });

    await expect(
      locks.acquire({
        workspaceRootId,
        lockType: 'write',
        holder: 'holder-2',
        ttlSeconds: 30,
      }),
    ).rejects.toThrow(/lock/i);
  });
});
