import { rm } from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import { provisionWorkspaceForProject } from '../../src/workspace/provisioning';

describe('provisionWorkspaceForProject', () => {
  beforeEach(async () => {
    await pool.query(`
      truncate table
        channel_threads,
        project_channels,
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

  it('creates the workspace directories and binding rows', async () => {
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

    const result = await provisionWorkspaceForProject({
      organizationId: organization.id,
      projectId: project.id,
      requestedBy: user.id,
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
      workspaceRoot: '/Users/pureicis/dev/mastra-playground/hono-workspace/var/workspaces',
    });

    expect(result.root.status).toBe('ready');
    expect(result.binding.active_agent_ref).toBe('default');
    expect(result.directories).toEqual(
      expect.arrayContaining(['repo', 'docs', 'output', 'tmp', '.workspace-meta']),
    );
  });
});
