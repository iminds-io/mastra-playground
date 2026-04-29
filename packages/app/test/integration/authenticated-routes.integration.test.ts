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
        mindspaceRootPath: '/tmp/project-1',
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
            name: 'Alpha Mindspace',
            slug: 'alpha-mindspace',
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
          name: 'Alpha Mindspace',
          slug: 'alpha-mindspace',
          status: 'active',
        },
      ],
    });
  });

  it('returns session bootstrap data for the authenticated principal', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      getSessionBootstrap: async () => ({
        me: {
          uid: 'firebase-user-1',
          email: 'user@example.com',
          name: 'Demo User',
        },
        capabilities: {
          canAccessAdminConsole: true,
        },
        projects: [
          {
            id: 'project-1',
            organizationId: 'org-1',
            name: 'Alpha Mindspace',
            slug: 'alpha-mindspace',
            status: 'active',
          },
        ],
        preferredProjectId: 'project-1',
      }),
    });

    const response = await app.request('/api/session/bootstrap', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      me: {
        uid: 'firebase-user-1',
        email: 'user@example.com',
        name: 'Demo User',
      },
      capabilities: {
        canAccessAdminConsole: true,
      },
      projects: [
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Alpha Mindspace',
          slug: 'alpha-mindspace',
          status: 'active',
        },
      ],
      preferredProjectId: 'project-1',
    });
  });

  it('lists all projects on the admin dev route for allowlisted admins', async () => {
    const app = await createApp({
      adminEmails: ['user@example.com'],
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listAdminProjects: async () => ({
        projects: [
          {
            id: 'project-9',
            organizationId: 'org-9',
            name: 'Gamma Mindspace',
            slug: 'gamma-mindspace',
            status: 'active',
          },
        ],
      }),
    });

    const response = await app.request('/api/dev/projects', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: [
        {
          id: 'project-9',
          organizationId: 'org-9',
          name: 'Gamma Mindspace',
          slug: 'gamma-mindspace',
          status: 'active',
        },
      ],
    });
  });

  it('rejects the admin dev project list for non-allowlisted users', async () => {
    const app = await createApp({
      adminEmails: ['someone-else@example.com'],
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listAdminProjects: async () => ({
        projects: [],
      }),
    });

    const response = await app.request('/api/dev/projects', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Admin access required for dev project listing',
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
        mindspaceRootPath: `/tmp/${projectId}`,
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
      mindspaceRootPath: '/tmp/project-1',
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

  it('executes the mindspace supervisor wrapper for authenticated project supervision', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      runMindspaceSupervisor: async ({ projectId, prompt, paths }) => ({
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

  it('searches channel messages for the authenticated principal', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      searchChannelMessages: async ({ firebaseUid, projectId, query, channelId, page }) => ({
        results: [
          {
            messageId: `${firebaseUid}:${query}:${page ?? 0}`,
            threadId: 'thread-1',
            channelId: channelId ?? 'channel-all',
            channelName: channelId ? 'engineering' : 'general',
            messageText: 'deploy the auth fix before 5pm',
            threadTitle: 'Deploy auth fix',
            role: 'user',
            createdAt: '2026-04-20T14:00:00.000Z',
          },
        ],
      }),
    });

    const response = await app.request('/api/projects/project-1/search?q=deploy&channelId=channel-9&page=2', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          messageId: 'firebase-user-1:deploy:2',
          threadId: 'thread-1',
          channelId: 'channel-9',
          channelName: 'engineering',
          messageText: 'deploy the auth fix before 5pm',
          threadTitle: 'Deploy auth fix',
          role: 'user',
          createdAt: '2026-04-20T14:00:00.000Z',
        },
      ],
    });
  });

  it('streams thread_created and ack events for authenticated root post creation', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      createChannelPostAndStream: async function* () {
        yield {
          event: 'thread_created',
          data: {
            thread: {
              id: 'thread-1',
              channelId: 'channel-1',
            },
            rootMessage: {
              id: 'message-1',
              text: 'hello',
            },
          },
        };
        yield {
          event: 'ack',
          data: {
            threadId: 'thread-1',
          },
        };
        yield {
          event: 'done',
          data: {
            threadId: 'thread-1',
          },
        };
      },
    });

    const response = await app.request('/api/projects/project-1/channels/channel-1/posts/stream', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'hello' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('event: thread_created');
    expect(body).toContain('event: ack');
    expect(body).toContain('"threadId":"thread-1"');
  });

  it('lists mindspace-scoped Mastra agents for authenticated project members', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listWorkspaceMastraAgents: async ({ projectId }) => ({
        projectId,
        agents: [{ id: 'summarizer', capability: 'read', operations: ['generate', 'stream'] }],
      }),
    });

    const response = await app.request('/api/projects/project-1/mastra/agents', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projectId: 'project-1',
      agents: [{ id: 'summarizer', capability: 'read', operations: ['generate', 'stream'] }],
    });
  });

  it('generates through mindspace-scoped Mastra agent route without forwarding trusted body context', async () => {
    let captured: unknown;
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      generateWorkspaceMastraAgent: async (input) => {
        captured = input;
        return {
          projectId: input.projectId,
          agentId: input.agentId,
          threadId: input.threadId ?? 'generated-thread',
          resourceId: 'server-resource',
          text: 'ok',
        };
      },
    });

    const response = await app.request('/api/projects/project-1/mastra/agents/summarizer/generate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: 'hello',
        threadId: 'client-thread',
        projectId: 'evil-project',
        role: 'owner',
        resourceId: 'evil-resource',
        requestContext: { workspace: 'evil' },
      }),
    });

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      firebaseUid: verifiedPrincipal.uid,
      projectId: 'project-1',
      agentId: 'summarizer',
      messages: 'hello',
      threadId: 'client-thread',
    });
    expect(await response.json()).toEqual({
      projectId: 'project-1',
      agentId: 'summarizer',
      threadId: 'client-thread',
      resourceId: 'server-resource',
      text: 'ok',
    });
  });

  it('streams through mindspace-scoped Mastra agent route', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      streamWorkspaceMastraAgent: async function* ({ projectId, agentId }) {
        yield { event: 'ack', data: { projectId, agentId, threadId: 't-1', resourceId: 'r-1' } };
        yield { event: 'token', data: { text: 'ok' } };
        yield { event: 'done', data: { projectId, agentId, threadId: 't-1', text: 'ok' } };
      },
    });

    const response = await app.request('/api/projects/project-1/mastra/agents/summarizer/stream', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ messages: 'hello' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await response.text();
    expect(text).toContain('event: ack');
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');
  });

  it('lists mindspace-scoped Mastra workflows for authenticated project members', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listWorkspaceMastraWorkflows: async ({ projectId }) => ({
        projectId,
        workflows: [{ id: 'ingestPipeline', capability: 'read', operations: ['create-run', 'start'] }],
      }),
    });

    const response = await app.request('/api/projects/project-1/mastra/workflows', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projectId: 'project-1',
      workflows: [{ id: 'ingestPipeline', capability: 'read', operations: ['create-run', 'start'] }],
    });
  });

  it('creates mindspace-scoped Mastra workflow runs', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      createWorkspaceMastraWorkflowRun: async ({ projectId, workflowId }) => ({
        projectId,
        workflowId,
        runId: 'run-workflow',
      }),
    });

    const response = await app.request('/api/projects/project-1/mastra/workflows/ingestPipeline/create-run', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projectId: 'project-1',
      workflowId: 'ingestPipeline',
      runId: 'run-workflow',
    });
  });

  it('starts mindspace-scoped Mastra workflows without forwarding trusted body context', async () => {
    let captured: unknown;
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      startWorkspaceMastraWorkflow: async (input) => {
        captured = input;
        return {
          projectId: input.projectId,
          workflowId: input.workflowId,
          runId: input.runId ?? 'run-created',
          status: 'success',
          result: { summary: '', filesCount: 0 },
        };
      },
    });

    const response = await app.request('/api/projects/project-1/mastra/workflows/ingestPipeline/start', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        runId: 'run-client',
        inputData: { rootPath: '/' },
        threadId: 'thread-client',
        projectId: 'evil-project',
        role: 'owner',
        requestContext: { workspace: 'evil' },
      }),
    });

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      firebaseUid: verifiedPrincipal.uid,
      projectId: 'project-1',
      workflowId: 'ingestPipeline',
      runId: 'run-client',
      threadId: 'thread-client',
      inputData: { rootPath: '/' },
    });
    expect(await response.json()).toEqual({
      projectId: 'project-1',
      workflowId: 'ingestPipeline',
      runId: 'run-client',
      status: 'success',
      result: { summary: '', filesCount: 0 },
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
