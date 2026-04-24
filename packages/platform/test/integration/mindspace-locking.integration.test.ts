import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { createMindspaceRoot } from '../../src/db/repositories/mindspace-roots';
import { createMindspaceLockService } from '../../src/mindspace/locking';

describe('workspace locking', () => {
  let mindspaceRootId: string;

  beforeEach(async () => {
    await pool.query(`
      truncate table
        channel_threads,
        project_channels,
        mindspace_provisioning_jobs,
        mindspace_events,
        mindspace_locks,
        mindspace_bindings,
        mindspace_roots,
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
    const root = await createMindspaceRoot({
      organizationId: organization.id,
      projectId: project.id,
      rootPath: '/tmp/lock-project',
      status: 'ready',
    });

    mindspaceRootId = root.id;
  });

  it('prevents a second active writer lock', async () => {
    const locks = createMindspaceLockService();

    await locks.acquire({
      mindspaceRootId,
      lockType: 'write',
      holder: 'holder-1',
      ttlSeconds: 30,
    });

    await expect(
      locks.acquire({
        mindspaceRootId,
        lockType: 'write',
        holder: 'holder-2',
        ttlSeconds: 30,
      }),
    ).rejects.toThrow(/lock/i);
  });
});
