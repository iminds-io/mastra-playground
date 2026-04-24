import { rm } from 'node:fs/promises';

import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '@mastra-mindspace/platform/node';

import { createApp } from '../../src/server/factory';

describe('dev bootstrap route', () => {
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

    await rm('/Users/pureicis/dev/mastra-playground/hono-mindspace/var/workspaces', {
      recursive: true,
      force: true,
    });
  });

  it('creates a demo project and provisions its workspace for the authenticated user', async () => {
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
    });

    const response = await app.request('/api/dev/bootstrap-project', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Demo Project',
      }),
    });

    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(payload.projectId).toBeTruthy();
    expect(payload.organizationId).toBeTruthy();
    expect(payload.defaultChannelId).toBeTruthy();
    expect(payload.mindspaceRootPath).toContain(`/project_${payload.projectId}`);
    expect(payload.binding).toEqual({
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
    });
  });
});
