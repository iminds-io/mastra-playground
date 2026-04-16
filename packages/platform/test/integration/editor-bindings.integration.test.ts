import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { createWorkspaceBinding, getActiveWorkspaceBinding } from '../../src/db/repositories/workspace-bindings';
import { createWorkspaceRoot } from '../../src/db/repositories/workspace-roots';

describe('workspace bindings', () => {
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

  it('returns the active agent ref and version', async () => {
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
      rootPath: '/tmp/demo-project',
      status: 'ready',
    });

    await createWorkspaceBinding({
      projectId: project.id,
      workspaceRootId: root.id,
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
      policyJson: {
        allowCommandExecution: true,
      },
    });

    const binding = await getActiveWorkspaceBinding(project.id);

    expect(binding?.active_agent_ref).toBe('default');
    expect(binding?.active_agent_version).toBe('v1');
  });
});
