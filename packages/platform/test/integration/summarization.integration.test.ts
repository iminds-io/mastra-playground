import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';

describe('summarizeProjectDocsForPrincipal', () => {
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

  it.skipIf(!process.env.OPENROUTER_API_KEY)(
    'returns a model reply for project-scoped paths',
    { timeout: 60_000 },
    async () => {
      const { createMastra } = await import('../../src/mastra/create-mastra');
      const { seedProjectFixture } = await import('../helpers/fixtures');
      const { summarizeProjectDocsForPrincipal } = await import('../../src/services/summarization');

      const fixture = await seedProjectFixture();
      const mastra = createMastra(process.env.DATABASE_URL!, {
        openrouterApiKey: process.env.OPENROUTER_API_KEY!,
        openrouterModel: process.env.OPENROUTER_MODEL,
      });

      try {
        const result = await summarizeProjectDocsForPrincipal({
          firebaseUid: fixture.user.firebaseUid,
          projectId: fixture.project.id,
          paths: ['docs/example.md', 'README.md'],
          question: 'Reply with the single word "ok".',
        }, { mastra, workspaceFactory: fixture.workspaceFactory });

        expect(result.projectId).toBe(fixture.project.id);
        expect(result.paths).toEqual(['docs/example.md', 'README.md']);
        expect(typeof result.text).toBe('string');
        expect(result.text.length).toBeGreaterThan(0);
      } finally {
        await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
      }
    },
  );

  it('rejects empty paths before calling the agent', async () => {
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const { summarizeProjectDocsForPrincipal } = await import('../../src/services/summarization');
    const fixture = await seedProjectFixture();
    const mastra = {} as never;

    await expect(
      summarizeProjectDocsForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
        paths: [],
      }, { mastra, workspaceFactory: fixture.workspaceFactory }),
    ).rejects.toThrow('At least one path is required');
  });
});
