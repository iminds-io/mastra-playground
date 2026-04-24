import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';

describe('ingestPipeline workflow', () => {
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

  it('completes when the workspace has no markdown files', async () => {
    const { createMastra } = await import('../../src/mastra/create-mastra');
    const { buildExecutionContext } = await import('../../src/mastra/execution/build-execution-context');
    const { loadProjectContext } = await import('../../src/services/project-context');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const { resolveMindspaceForProject } = await import('../../src/mindspace/resolver');

    const fixture = await seedProjectFixture();
    const projectContext = await loadProjectContext({
      firebaseUid: fixture.user.firebaseUid,
      projectId: fixture.project.id,
    });
    const resolved = await resolveMindspaceForProject(fixture.project.id, {
      mindspaceFactory: fixture.mindspaceFactory,
    });
    const execution = buildExecutionContext({
      projectContext,
      mindspaceRootPath: resolved.root.root_path,
      workspace: resolved.workspace,
      resourceId: `harness:ingest-pipeline:project:${fixture.project.id}`,
      threadId: 'ingest:no-files',
    });
    const mastra = createMastra(process.env.DATABASE_URL!, {
      openrouterApiKey: process.env.OPENROUTER_API_KEY ?? 'not-needed',
      openrouterModel: process.env.OPENROUTER_MODEL,
    });

    try {
      const run = await mastra.getWorkflow('ingestPipeline').createRun();
      const result = await run.start({
        inputData: { rootPath: '/' },
        requestContext: execution.requestContext as never,
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.result).toEqual({ summary: '', filesCount: 0 });
      }
    } finally {
      await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
    }
  });
});
