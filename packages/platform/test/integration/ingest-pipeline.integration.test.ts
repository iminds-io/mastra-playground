import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';

describe('ingestPipeline workflow', () => {
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

  it('completes when the workspace has no markdown files', async () => {
    const { createMastra } = await import('../../src/mastra/create-mastra');
    const { buildExecutionContext } = await import('../../src/mastra/execution/build-execution-context');
    const { loadProjectContext } = await import('../../src/services/project-context');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const { resolveWorkspaceForProject } = await import('../../src/workspace/resolver');

    const fixture = await seedProjectFixture();
    const projectContext = await loadProjectContext({
      firebaseUid: fixture.user.firebaseUid,
      projectId: fixture.project.id,
    });
    const resolved = await resolveWorkspaceForProject(fixture.project.id, {
      workspaceFactory: fixture.workspaceFactory,
    });
    const execution = buildExecutionContext({
      projectContext,
      workspaceRootPath: resolved.root.root_path,
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
