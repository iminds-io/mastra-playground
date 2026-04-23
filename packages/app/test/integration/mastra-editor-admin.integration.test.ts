// ABOUTME: Integration tests for the /api/mastra/stored/* admin gate.
// ABOUTME: Exercises the factory's adminEmails allowlist without spinning up wrangler.

import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '@hono-workspace/platform/node';

import { createApp } from '../../src/server/factory';

const ADMIN_EMAIL = 'admin@test.local';
const NON_ADMIN_EMAIL = 'user@test.local';

function makeTokenVerifier(email: string) {
  return {
    async verifyIdToken() {
      return {
        uid: `uid-${email}`,
        email,
        emailVerified: true,
        name: email,
        picture: null,
        authTime: null,
        rawClaims: {},
      };
    },
  };
}

describe('Mastra editor admin gate', () => {
  beforeEach(async () => {
    // Fresh Mastra tables are already provisioned by integration globalSetup.
    // Nothing to truncate for this test — we only hit read endpoints on the
    // happy path, and write attempts are rejected before they touch storage.
    await pool.query(`select 1`);
  });

  it('allows GET /api/mastra/stored/agents for any authenticated user', async () => {
    const app = await createApp({
      tokenVerifier: makeTokenVerifier(NON_ADMIN_EMAIL),
      adminEmails: [ADMIN_EMAIL],
    });

    const response = await app.request('/api/mastra/stored/agents', {
      method: 'GET',
      headers: { authorization: 'Bearer demo-token' },
    });

    expect(response.status).toBe(200);
  });

  it('rejects POST /api/mastra/stored/agents from a non-admin user with 403', async () => {
    const app = await createApp({
      tokenVerifier: makeTokenVerifier(NON_ADMIN_EMAIL),
      adminEmails: [ADMIN_EMAIL],
    });

    const response = await app.request('/api/mastra/stored/agents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'gated-test' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Admin access required for stored-agent mutations',
    });
  });

  it('allows POST /api/mastra/stored/agents when the caller is on the admin allowlist', async () => {
    const app = await createApp({
      tokenVerifier: makeTokenVerifier(ADMIN_EMAIL),
      adminEmails: [ADMIN_EMAIL],
    });

    const response = await app.request('/api/mastra/stored/agents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      // Valid payload shape for Mastra editor's stored-agent create route —
      // overrides a code-defined agent (projectAgent) with a draft instruction set.
      body: JSON.stringify({
        id: 'projectAgent',
        instructions: 'Be concise.',
      }),
    });

    // We don't assert 200 specifically because Mastra's own validation may reject
    // the payload shape; the critical assertion is that we got PAST the admin gate
    // (i.e. NOT 403 with our gate's message).
    const body = await response.json().catch(() => null);
    expect(response.status).not.toBe(403);
    if (response.status === 403) {
      // Prove it's NOT our gate if a different 403 ever appears.
      expect(body).not.toEqual({
        error: 'Admin access required for stored-agent mutations',
      });
    }
  });

  it('rejects POST when ADMIN_EMAILS allowlist is empty', async () => {
    const app = await createApp({
      tokenVerifier: makeTokenVerifier(ADMIN_EMAIL),
      adminEmails: [],
    });

    const response = await app.request('/api/mastra/stored/agents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'gated-test' }),
    });

    expect(response.status).toBe(403);
  });

  it('treats admin email matching as case-insensitive', async () => {
    const app = await createApp({
      tokenVerifier: makeTokenVerifier('Admin@Test.Local'),
      adminEmails: ['ADMIN@test.local'],
    });

    const response = await app.request('/api/mastra/stored/agents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'projectAgent', instructions: 'x' }),
    });

    expect(response.status).not.toBe(403);
  });
});
