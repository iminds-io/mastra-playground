import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';

describe('mindspace Mastra gateway service', () => {
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

  it('lists mindspace-scoped agents for an authorized project member', async () => {
    const { createMastra } = await import('../../src/mastra/create-mastra');
    const { listMindspaceMastraAgentsForPrincipal } = await import('../../src/services/mindspace-mastra-gateway');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const fixture = await seedProjectFixture();
    const mastra = createMastra(process.env.DATABASE_URL!, { openrouterApiKey: 'not-needed' });

    try {
      const result = await listMindspaceMastraAgentsForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
      }, { mastra, mindspaceFactory: fixture.mindspaceFactory });

      expect(result.projectId).toBe(fixture.project.id);
      expect(result.agents.map((agent) => agent.id).sort()).toEqual([
        'mindspace-supervisor',
        'mindspaceReviewer',
        'summarizer',
      ]);
      expect(result.agents.map((agent) => agent.id)).not.toContain('projectAgent');
    } finally {
      await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
    }
  });

  it('rejects empty agent generate messages before model execution', async () => {
    const { generateMindspaceMastraAgentForPrincipal } = await import('../../src/services/mindspace-mastra-gateway');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const fixture = await seedProjectFixture();

    await expect(generateMindspaceMastraAgentForPrincipal({
      firebaseUid: fixture.user.firebaseUid,
      projectId: fixture.project.id,
      agentId: 'summarizer',
      messages: '   ',
    }, {
      mastra: {} as never,
      mindspaceFactory: fixture.mindspaceFactory,
    })).rejects.toThrow('messages is required');
  });

  it('rejects agents that are not exposed through workspace policy', async () => {
    const { createMastra } = await import('../../src/mastra/create-mastra');
    const { generateMindspaceMastraAgentForPrincipal } = await import('../../src/services/mindspace-mastra-gateway');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const fixture = await seedProjectFixture();
    const mastra = createMastra(process.env.DATABASE_URL!, { openrouterApiKey: 'not-needed' });

    try {
      await expect(generateMindspaceMastraAgentForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
        agentId: 'projectAgent',
        messages: 'hello',
      }, { mastra, mindspaceFactory: fixture.mindspaceFactory })).rejects.toThrow('not available');
    } finally {
      await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
    }
  });

  it('lists mindspace-scoped workflows for an authorized project member', async () => {
    const { createMastra } = await import('../../src/mastra/create-mastra');
    const { listMindspaceMastraWorkflowsForPrincipal } = await import('../../src/services/mindspace-mastra-gateway');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const fixture = await seedProjectFixture();
    const mastra = createMastra(process.env.DATABASE_URL!, { openrouterApiKey: 'not-needed' });

    try {
      const result = await listMindspaceMastraWorkflowsForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
      }, { mastra, mindspaceFactory: fixture.mindspaceFactory });

      expect(result.projectId).toBe(fixture.project.id);
      expect(result.workflows.map((workflow) => workflow.id)).toEqual(['ingestPipeline']);
    } finally {
      await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
    }
  });

  it('creates a workflow run through the mindspace gateway', async () => {
    const { createMastra } = await import('../../src/mastra/create-mastra');
    const { createMindspaceMastraWorkflowRunForPrincipal } = await import('../../src/services/mindspace-mastra-gateway');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const fixture = await seedProjectFixture();
    const mastra = createMastra(process.env.DATABASE_URL!, { openrouterApiKey: 'not-needed' });

    try {
      const result = await createMindspaceMastraWorkflowRunForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
        workflowId: 'ingestPipeline',
      }, { mastra, mindspaceFactory: fixture.mindspaceFactory });

      expect(result.projectId).toBe(fixture.project.id);
      expect(result.workflowId).toBe('ingestPipeline');
      expect(typeof result.runId).toBe('string');
    } finally {
      await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
    }
  });

  it('starts ingestPipeline with server-built workspace context', async () => {
    const { createMastra } = await import('../../src/mastra/create-mastra');
    const { startMindspaceMastraWorkflowForPrincipal } = await import('../../src/services/mindspace-mastra-gateway');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const fixture = await seedProjectFixture();
    const mastra = createMastra(process.env.DATABASE_URL!, { openrouterApiKey: 'not-needed' });

    try {
      const result = await startMindspaceMastraWorkflowForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
        workflowId: 'ingestPipeline',
        inputData: { rootPath: '/' },
      }, { mastra, mindspaceFactory: fixture.mindspaceFactory });

      expect(result.projectId).toBe(fixture.project.id);
      expect(result.workflowId).toBe('ingestPipeline');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.result).toEqual({ summary: '', filesCount: 0 });
      }
    } finally {
      await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
    }
  });
});
