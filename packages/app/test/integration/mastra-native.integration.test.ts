import { describe, expect, it } from 'vitest';

import { createMastra } from '@hono-workspace/platform';

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

describe('Mastra native route mount', () => {
  it('requires API auth before listing agents under /api/mastra', async () => {
    const app = await createApp();

    const response = await app.request('/api/mastra/agents');

    expect(response.status).toBe(401);
  });

  it('lists registered agents under /api/mastra for authenticated requests', async () => {
    const app = await createApp({
      mastra: createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace', {
        openrouterApiKey: 'test-key',
      }),
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
    });

    const response = await app.request('/api/mastra/agents', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(expect.arrayContaining([
      'project-agent',
      'summarizer',
      'workspace-reviewer',
      'workspace-supervisor',
    ]));
  });
});
