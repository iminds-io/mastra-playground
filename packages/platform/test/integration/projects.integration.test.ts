import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { addOrganizationMembership, addProjectMembership } from '../../src/db/repositories/memberships';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import { listAccessibleProjectsForPrincipal } from '../../src/services/projects';

describe('listAccessibleProjectsForPrincipal', () => {
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
        project_mind_configs,
        project_invitations,
        project_memberships,
        organization_memberships,
        projects,
        users,
        organizations
      restart identity cascade
    `);
  });

  it('lists only projects the user is explicitly a member of', async () => {
    const organization = await createOrganization({
      name: 'Demo Org',
      firebaseProjectId: 'mindmap-aff6a',
    });
    const user = await upsertUser({
      firebaseUid: 'firebase-user-1',
      email: 'user@example.com',
      displayName: 'Demo User',
    });
    const accessibleProject = await createProject({
      organizationId: organization.id,
      name: 'Accessible',
      slug: 'accessible',
    });
    await createProject({
      organizationId: organization.id,
      name: 'Hidden',
      slug: 'hidden',
    });

    await addOrganizationMembership({
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
    });
    await addProjectMembership({
      projectId: accessibleProject.id,
      userId: user.id,
      role: 'owner',
    });

    const result = await listAccessibleProjectsForPrincipal({
      firebaseUid: 'firebase-user-1',
    });

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.id).toBe(accessibleProject.id);
  });
});
