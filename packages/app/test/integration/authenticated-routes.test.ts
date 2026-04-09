import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

describe('authenticated routes', () => {
  it('returns the verified principal on /api/me', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return {
            uid: 'firebase-user-1',
            email: 'user@example.com',
            emailVerified: true,
            name: 'Demo User',
            picture: null,
            authTime: 123,
            rawClaims: {},
          };
        },
      },
      executeProjectAgent: async () => ({
        resourceId: 'project:project-1',
        workspaceRootPath: '/tmp/project-1',
        binding: null,
        message: 'hello',
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

  it('executes the project wrapper for authenticated agent runs', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return {
            uid: 'firebase-user-1',
            email: 'user@example.com',
            emailVerified: true,
            name: 'Demo User',
            picture: null,
            authTime: 123,
            rawClaims: {},
          };
        },
      },
      executeProjectAgent: async ({ projectId, message }) => ({
        resourceId: `project:${projectId}`,
        workspaceRootPath: `/tmp/${projectId}`,
        binding: null,
        message,
      }),
    });

    const response = await app.request('/api/projects/project-1/agent/run', {
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
      message: 'hello',
    });
  });
});
