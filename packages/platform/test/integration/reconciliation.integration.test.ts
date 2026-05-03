import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { createMindspaceRoot, getActiveMindspaceRootByProjectId } from '../../src/db/repositories/mindspace-roots';
import { reconcileMindspaceForProject } from '../../src/mindspace/reconciliation';
import { TEST_FIREBASE_PROJECT_ID } from '../helpers/fixtures';

describe('reconcileMindspaceForProject', () => {
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

  it('marks the mindspace root as error when the directory is missing', async () => {
    const mindspaceFactory = async () => ({
      filesystem: {
        exists: async () => {
          throw new Error('Directory not found');
        },
      },
    }) as any;

    const organization = await createOrganization({
      name: 'Demo Org',
      firebaseProjectId: TEST_FIREBASE_PROJECT_ID,
    });
    const project = await createProject({
      organizationId: organization.id,
      name: 'Demo Project',
      slug: 'demo-project',
    });
    const root = await createMindspaceRoot({
      organizationId: organization.id,
      projectId: project.id,
      rootPath: '/Users/pureicis/dev/mastra-playground/hono-mindspace/var/workspaces/missing-root',
      status: 'ready',
    });

    const result = await reconcileMindspaceForProject(project.id, { mindspaceFactory });
    const updatedRoot = await getActiveMindspaceRootByProjectId(project.id);

    expect(result.status).toBe('error');
    expect(updatedRoot?.status).toBe('error');
  });
});
