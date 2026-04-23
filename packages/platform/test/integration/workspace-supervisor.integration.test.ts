import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';

describe('runWorkspaceSupervisorForPrincipal', () => {
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

  it('rejects an empty prompt before calling the agent', async () => {
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const { runWorkspaceSupervisorForPrincipal } = await import('../../src/services/supervisor');
    const fixture = await seedProjectFixture();

    await expect(
      runWorkspaceSupervisorForPrincipal(
        {
          firebaseUid: fixture.user.firebaseUid,
          projectId: fixture.project.id,
          prompt: '   ',
        },
        {
          mastra: {} as never,
          workspaceFactory: fixture.workspaceFactory,
        },
      ),
    ).rejects.toThrow('Prompt is required');
  });

  it.skipIf(!process.env.OPENROUTER_API_KEY)(
    'returns a model reply for an authorized project',
    { timeout: 90_000 },
    async () => {
      const { createMastra } = await import('../../src/mastra/create-mastra');
      const { seedProjectFixture } = await import('../helpers/fixtures');
      const { runWorkspaceSupervisorForPrincipal } = await import('../../src/services/supervisor');

      const fixture = await seedProjectFixture();
      const mastra = createMastra(process.env.DATABASE_URL!, {
        openrouterApiKey: process.env.OPENROUTER_API_KEY!,
        openrouterModel: process.env.OPENROUTER_MODEL,
      });

      try {
        const result = await runWorkspaceSupervisorForPrincipal(
          {
            firebaseUid: fixture.user.firebaseUid,
            projectId: fixture.project.id,
            prompt: 'Review the workspace at a high level and reply with one short sentence.',
            paths: ['README.md'],
          },
          { mastra, workspaceFactory: fixture.workspaceFactory },
        );

        expect(result.projectId).toBe(fixture.project.id);
        expect(typeof result.text).toBe('string');
        expect(result.text.length).toBeGreaterThan(0);
      } finally {
        await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
      }
    },
  );
});
