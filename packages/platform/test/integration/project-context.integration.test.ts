import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { addOrganizationMembership, addProjectMembership } from '../../src/db/repositories/memberships';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import { AccessDeniedError } from '../../src/services/access-control';
import { loadProjectContext } from '../../src/services/project-context';
import { TEST_FIREBASE_PROJECT_ID } from '../helpers/fixtures';

describe('loadProjectContext', () => {
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

  it('denies access when the user only has organization membership', async () => {
    const organization = await createOrganization({
      name: 'Demo Org',
      firebaseProjectId: TEST_FIREBASE_PROJECT_ID,
    });
    const user = await upsertUser({
      firebaseUid: 'firebase-user-1',
      email: 'user@example.com',
      displayName: 'Demo User',
    });
    const project = await createProject({
      organizationId: organization.id,
      name: 'Demo Project',
      slug: 'demo-project',
    });

    await addOrganizationMembership({
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
    });

    await expect(
      loadProjectContext({
        firebaseUid: 'firebase-user-1',
        projectId: project.id,
      }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('returns the actor and membership for an explicitly accessible project', async () => {
    const organization = await createOrganization({
      name: 'Demo Org',
      firebaseProjectId: TEST_FIREBASE_PROJECT_ID,
    });
    const user = await upsertUser({
      firebaseUid: 'firebase-user-1',
      email: 'user@example.com',
      displayName: 'Demo User',
    });
    const project = await createProject({
      organizationId: organization.id,
      name: 'Demo Project',
      slug: 'demo-project',
    });

    await addOrganizationMembership({
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
    });
    await addProjectMembership({
      projectId: project.id,
      userId: user.id,
      role: 'owner',
    });

    const context = await loadProjectContext({
      firebaseUid: 'firebase-user-1',
      projectId: project.id,
    });

    expect(context.actorUserId).toBe(user.id);
    expect(context.organizationId).toBe(organization.id);
    expect(context.projectId).toBe(project.id);
    expect(context.resourceId).toBe(`project:${project.id}`);
    expect(context.role).toBe('owner');
  });
});
