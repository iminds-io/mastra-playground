// ABOUTME: E2E coverage for the mindspace-scoped Mastra gateway at /api/projects/:projectId/mastra/*.
// ABOUTME: Verifies authenticated project members can list primitives and run workflows with server-built workspace context.

import { afterAll, describe, expect, it } from 'vitest';

import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const user of createdUsers) await user.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('Mindspace-scoped Mastra gateway', { timeout: 180_000 }, () => {
  it('lists mindspace-scoped agents and workflows after project bootstrap', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `gateway-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    const { projectId } = await bootstrap.json() as { projectId: string };

    const agentRes = await fetch(`${baseUrl}/api/projects/${projectId}/mastra/agents`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });
    expect(agentRes.status).toBe(200);
    const agentBody = await agentRes.json() as {
      projectId?: string;
      agents?: Array<{ id: string }>;
    };
    expect(agentBody.projectId).toBe(projectId);
    expect(agentBody.agents?.map((agent) => agent.id).sort()).toEqual([
      'mindspace-supervisor',
      'mindspaceReviewer',
      'summarizer',
    ]);

    const workflowRes = await fetch(`${baseUrl}/api/projects/${projectId}/mastra/workflows`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });
    expect(workflowRes.status).toBe(200);
    const workflowBody = await workflowRes.json() as {
      projectId?: string;
      workflows?: Array<{ id: string }>;
    };
    expect(workflowBody.projectId).toBe(projectId);
    expect(workflowBody.workflows?.map((workflow) => workflow.id)).toEqual(['ingestPipeline']);
  });

  it('starts ingestPipeline successfully through the mindspace-scoped gateway', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `gateway-wf-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    const { projectId } = await bootstrap.json() as { projectId: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/mastra/workflows/ingestPipeline/start`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inputData: { rootPath: '/' },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      projectId?: string;
      workflowId?: string;
      runId?: string;
      status?: string;
      result?: unknown;
    };
    expect(body.projectId).toBe(projectId);
    expect(body.workflowId).toBe('ingestPipeline');
    expect(typeof body.runId).toBe('string');
    expect(body.status).toBe('success');
    expect(body.result).toEqual({ summary: '', filesCount: 0 });
  });

  it('generates through the mindspace-scoped agent surface', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `gateway-agent-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    const { projectId } = await bootstrap.json() as { projectId: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/mastra/agents/summarizer/generate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: 'Say ok in one word.',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      projectId?: string;
      agentId?: string;
      resourceId?: string;
      text?: string;
    };
    expect(body.projectId).toBe(projectId);
    expect(body.agentId).toBe('summarizer');
    expect(body.resourceId).toBe(`mindspace-mastra:agent:summarizer:project:${projectId}`);
    expect(typeof body.text).toBe('string');
    expect(body.text!.length).toBeGreaterThan(0);
  });
});
