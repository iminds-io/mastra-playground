// ABOUTME: Integration test for agent version targeting through domain routes.
// ABOUTME: Verifies the ?versionId and ?status query params reach the service dep.

import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

const VERIFIED_PRINCIPAL = {
  uid: 'uid-version',
  email: 'version@test.local',
  emailVerified: true,
  name: 'Version Test',
  picture: null,
  authTime: null,
  rawClaims: {},
};

function tokenVerifier() {
  return {
    async verifyIdToken() {
      return VERIFIED_PRINCIPAL;
    },
  };
}

describe('agent version targeting via query params', () => {
  it('passes ?versionId= through to the summarize service', async () => {
    let capturedVersion: unknown = 'uncalled';
    const app = await createApp({
      tokenVerifier: tokenVerifier(),
      summarizeProjectDocs: async (input, deps) => {
        capturedVersion = deps?.version;
        return {
          projectId: input.projectId,
          paths: input.paths,
          text: 'stubbed',
          runId: 'r-1',
          modelId: 'stub',
        };
      },
    });

    const response = await app.request(
      '/api/projects/project-1/summarize?versionId=draft-xyz',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ paths: ['README.md'] }),
      },
    );

    expect(response.status).toBe(200);
    expect(capturedVersion).toEqual({ versionId: 'draft-xyz' });
  });

  it('passes ?status=draft through to the summarize service', async () => {
    let capturedVersion: unknown = 'uncalled';
    const app = await createApp({
      tokenVerifier: tokenVerifier(),
      summarizeProjectDocs: async (input, deps) => {
        capturedVersion = deps?.version;
        return {
          projectId: input.projectId,
          paths: input.paths,
          text: 'stubbed',
          runId: 'r-2',
          modelId: 'stub',
        };
      },
    });

    const response = await app.request(
      '/api/projects/project-1/summarize?status=draft',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ paths: ['README.md'] }),
      },
    );

    expect(response.status).toBe(200);
    expect(capturedVersion).toEqual({ status: 'draft' });
  });

  it('omits version when no query param is set (falls back to published)', async () => {
    let capturedVersion: unknown = 'sentinel';
    const app = await createApp({
      tokenVerifier: tokenVerifier(),
      summarizeProjectDocs: async (input, deps) => {
        capturedVersion = deps?.version;
        return {
          projectId: input.projectId,
          paths: input.paths,
          text: 'stubbed',
          runId: 'r-3',
          modelId: 'stub',
        };
      },
    });

    const response = await app.request(
      '/api/projects/project-1/summarize',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ paths: ['README.md'] }),
      },
    );

    expect(response.status).toBe(200);
    expect(capturedVersion).toBeUndefined();
  });

  it('passes ?versionId= through to the mindspace supervisor service', async () => {
    let capturedVersion: unknown = 'uncalled';
    const app = await createApp({
      tokenVerifier: tokenVerifier(),
      runMindspaceSupervisor: async (input, deps) => {
        capturedVersion = deps?.version;
        return {
          projectId: input.projectId,
          text: 'stubbed supervisor',
        };
      },
    });

    const response = await app.request(
      '/api/projects/project-1/supervise?versionId=supervisor-v1',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'review' }),
      },
    );

    expect(response.status).toBe(200);
    expect(capturedVersion).toEqual({ versionId: 'supervisor-v1' });
  });

  it('passes ?status=draft through to the mindspace supervisor service', async () => {
    let capturedVersion: unknown = 'uncalled';
    const app = await createApp({
      tokenVerifier: tokenVerifier(),
      runMindspaceSupervisor: async (input, deps) => {
        capturedVersion = deps?.version;
        return {
          projectId: input.projectId,
          text: 'stubbed supervisor',
        };
      },
    });

    const response = await app.request(
      '/api/projects/project-1/supervise?status=draft',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'review' }),
      },
    );

    expect(response.status).toBe(200);
    expect(capturedVersion).toEqual({ status: 'draft' });
  });

  it('omits supervisor version when no query param is set', async () => {
    let capturedVersion: unknown = 'sentinel';
    const app = await createApp({
      tokenVerifier: tokenVerifier(),
      runMindspaceSupervisor: async (input, deps) => {
        capturedVersion = deps?.version;
        return {
          projectId: input.projectId,
          text: 'stubbed supervisor',
        };
      },
    });

    const response = await app.request(
      '/api/projects/project-1/supervise',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'review' }),
      },
    );

    expect(response.status).toBe(200);
    expect(capturedVersion).toBeUndefined();
  });

  it('passes ?versionId through to mindspace-scoped agent generate', async () => {
    let capturedVersion: unknown = 'uncalled';
    const app = await createApp({
      tokenVerifier: tokenVerifier(),
      generateWorkspaceMastraAgent: async (input, deps) => {
        capturedVersion = deps?.version;
        return {
          projectId: input.projectId,
          agentId: input.agentId,
          threadId: 'thread-1',
          resourceId: 'resource-1',
          text: 'stubbed gateway agent',
        };
      },
    });

    const response = await app.request(
      '/api/projects/project-1/mastra/agents/summarizer/generate?versionId=agent-v1',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: 'hello' }),
      },
    );

    expect(response.status).toBe(200);
    expect(capturedVersion).toEqual({ versionId: 'agent-v1' });
  });

  it('passes ?status=draft through to mindspace-scoped agent stream', async () => {
    let capturedVersion: unknown = 'uncalled';
    const app = await createApp({
      tokenVerifier: tokenVerifier(),
      streamWorkspaceMastraAgent: async function* (_input, deps) {
        capturedVersion = deps?.version;
        yield { event: 'done', data: { text: 'stubbed' } };
      },
    });

    const response = await app.request(
      '/api/projects/project-1/mastra/agents/summarizer/stream?status=draft',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: 'hello' }),
      },
    );

    expect(response.status).toBe(200);
    expect(capturedVersion).toEqual({ status: 'draft' });
  });
});
