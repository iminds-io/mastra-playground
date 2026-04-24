import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { createMindspaceBinding, getActiveMindspaceBinding } from '../../src/db/repositories/mindspace-bindings';
import { createMindspaceRoot } from '../../src/db/repositories/mindspace-roots';

describe('workspace bindings', () => {
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
    const root = await createMindspaceRoot({
      organizationId: organization.id,
      projectId: project.id,
      rootPath: '/tmp/demo-project',
      status: 'ready',
    });

    await createMindspaceBinding({
      projectId: project.id,
      mindspaceRootId: root.id,
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
      policyJson: {
        allowCommandExecution: true,
      },
    });

    const binding = await getActiveMindspaceBinding(project.id);

    expect(binding?.active_agent_ref).toBe('default');
    expect(binding?.active_agent_version).toBe('v1');
  });
});
