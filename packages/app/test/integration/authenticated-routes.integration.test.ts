import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

const verifiedPrincipal = {
  uid: 'firebase-user-1',
  email: 'user@example.com',
  emailVerified: true,
  name: 'Demo User',
  picture: null,
  authTime: 123,
  rawClaims: {},
};

describe('authenticated routes', () => {
  it('returns the verified principal on /api/me', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      executeProjectAgent: async () => ({
        resourceId: 'project:project-1',
        workspaceRootPath: '/tmp/project-1',
        threadId: 'project-1',
        runId: 'run-123',
        modelId: 'openai/gpt-4.1-mini',
        text: 'hello from agent',
      }),
    });

    const response = await app.request('/api/me', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uid: 'firebase-user-1',
      email: 'user@example.com',
      emailVerified: true,
      name: 'Demo User',
    });
  });

  it('lists accessible projects for the authenticated principal', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listAccessibleProjects: async () => ({
        projects: [
          {
            id: 'project-1',
            organizationId: 'org-1',
            name: 'Alpha Workspace',
            slug: 'alpha-workspace',
            status: 'active',
          },
        ],
      }),
    });

    const response = await app.request('/api/projects', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: [
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Alpha Workspace',
          slug: 'alpha-workspace',
          status: 'active',
        },
      ],
    });
  });

  it('executes the project wrapper for authenticated agent runs', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      executeProjectAgent: async ({ projectId, message }) => ({
        resourceId: `project:${projectId}`,
        workspaceRootPath: `/tmp/${projectId}`,
        threadId: projectId,
        runId: 'run-123',
        modelId: 'openai/gpt-4.1-mini',
        text: `agent heard: ${message}`,
      }),
    });

    const response = await app.request('/api/projects/project-1/admin/test', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'hello' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resourceId: 'project:project-1',
      workspaceRootPath: '/tmp/project-1',
      threadId: 'project-1',
      runId: 'run-123',
      modelId: 'openai/gpt-4.1-mini',
      text: 'agent heard: hello',
    });
  });

  it('executes the summarization wrapper for authenticated project summaries', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      summarizeProjectDocs: async ({ projectId, paths, question }) => ({
        projectId,
        paths,
        text: `summary for ${paths.join(', ')}: ${question}`,
        runId: 'run-456',
        modelId: 'openai/gpt-4.1-mini',
      }),
    });

    const response = await app.request('/api/projects/project-1/summarize', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        paths: ['README.md'],
        question: 'What matters?',
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projectId: 'project-1',
      paths: ['README.md'],
      text: 'summary for README.md: What matters?',
      runId: 'run-456',
      modelId: 'openai/gpt-4.1-mini',
    });
  });

  it('executes the workspace supervisor wrapper for authenticated project supervision', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      runWorkspaceSupervisor: async ({ projectId, prompt, paths }) => ({
        projectId,
        text: `supervised:${prompt}:${paths?.join(',') ?? ''}`,
        runId: 'run-supervisor',
        modelId: 'openai/gpt-4.1-mini',
      }),
    });

    const response = await app.request('/api/projects/project-1/supervise', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'review', paths: ['README.md'] }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projectId: 'project-1',
      text: 'supervised:review:README.md',
      runId: 'run-supervisor',
      modelId: 'openai/gpt-4.1-mini',
    });
  });

  it('returns JSON when a protected route throws', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      executeProjectAgent: async () => {
        throw new Error('Boom');
      },
    });

    const response = await app.request('/api/projects/project-1/admin/test', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'hello' }),
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: 'Internal Server Error',
    });
  });
});
