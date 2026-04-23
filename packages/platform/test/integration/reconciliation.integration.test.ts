import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { createWorkspaceRoot, getActiveWorkspaceRootByProjectId } from '../../src/db/repositories/workspace-roots';
import { reconcileWorkspaceForProject } from '../../src/workspace/reconciliation';

describe('reconcileWorkspaceForProject', () => {
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
  });

  it('marks the workspace root as error when the directory is missing', async () => {
    const workspaceFactory = async () => ({
      filesystem: {
        exists: async () => {
          throw new Error('Directory not found');
        },
      },
    }) as any;

    const organization = await createOrganization({
      name: 'Demo Org',
      firebaseProjectId: 'mindmap-aff6a',
    });
    const project = await createProject({
      organizationId: organization.id,
      name: 'Demo Project',
      slug: 'demo-project',
    });
    const root = await createWorkspaceRoot({
      organizationId: organization.id,
      projectId: project.id,
      rootPath: '/Users/pureicis/dev/mastra-playground/hono-workspace/var/workspaces/missing-root',
      status: 'ready',
    });

    const result = await reconcileWorkspaceForProject(project.id, { workspaceFactory });
    const updatedRoot = await getActiveWorkspaceRootByProjectId(project.id);

    expect(result.status).toBe('error');
    expect(updatedRoot?.status).toBe('error');
  });
});
