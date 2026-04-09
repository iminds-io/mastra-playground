import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { addOrganizationMembership } from '../../src/db/repositories/memberships';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import { loadProjectContext } from '../../src/services/project-context';

describe('loadProjectContext', () => {
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
  });

  it('returns the actor and membership for an accessible project', async () => {
    const organization = await createOrganization({
      name: 'Demo Org',
      firebaseProjectId: 'mindmap-aff6a',
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
