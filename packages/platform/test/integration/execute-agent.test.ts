import { rm } from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { addOrganizationMembership } from '../../src/db/repositories/memberships';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import { executeProjectAgent } from '../../src/mastra/execution/execute-agent';
import { provisionWorkspaceForProject } from '../../src/workspace/provisioning';

describe('executeProjectAgent', () => {
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

    await rm('/Users/pureicis/dev/mastra-playground/hono-workspace/var/workspaces', {
      recursive: true,
      force: true,
    });
  });

  it('derives the project resource id and resolved workspace', async () => {
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

    await provisionWorkspaceForProject({
      organizationId: organization.id,
      projectId: project.id,
      requestedBy: user.id,
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
    });

    const result = await executeProjectAgent({
      firebaseUid: 'firebase-user-1',
      projectId: project.id,
      message: 'hello',
    });

    expect(result.resourceId).toBe(`project:${project.id}`);
    expect(result.workspaceRootPath).toContain(`project_${project.id}`);
    expect(result.message).toBe('hello');
  });
});
