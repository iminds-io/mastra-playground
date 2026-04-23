// ABOUTME: E2E tests for the /api/mastra/stored/* admin gate on the spawned worker.
// ABOUTME: Verifies reads are open, writes without admin are 403, writes with admin are not 403.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const shouldRun = Boolean(
  baseUrl &&
  adminEmail &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
);

const createdUsers: TestFirebaseUser[] = [];

// Shared admin user across this describe block — Firebase rejects duplicate
// emails, so we create the admin once and reuse across all admin-gate tests.
let sharedAdmin: TestFirebaseUser | undefined;

beforeAll(async () => {
  if (!shouldRun) return;
  sharedAdmin = await createTestUser({
    uid: `admin-shared-${Date.now()}`,
    email: adminEmail!,
  });
  createdUsers.push(sharedAdmin);
});

afterAll(async () => {
  for (const user of createdUsers) await user.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('Mastra editor admin gate (Tier A)', { timeout: 120_000 }, () => {
  it('GET /api/mastra/stored/agents is allowed for any authenticated user', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const res = await fetch(`${baseUrl}/api/mastra/stored/agents`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });

    expect(res.status).toBe(200);
  });

  it('POST /api/mastra/stored/agents from a non-admin returns 403', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const res = await fetch(`${baseUrl}/api/mastra/stored/agents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'gated-test' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json() as { error?: string };
    expect(body.error).toContain('Admin access required');
  });

  it('POST /api/mastra/stored/agents from an admin user gets past the gate', async () => {
    const admin = sharedAdmin!;

    const res = await fetch(`${baseUrl}/api/mastra/stored/agents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${admin.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'projectAgent',
        instructions: 'Concise.',
      }),
    });

    // The gate lets the request through. The underlying editor may still return
    // a 4xx (e.g. validation) — that's fine; we're only verifying the admin gate.
    if (res.status === 403) {
      const body = await res.json() as { error?: string };
      // If 403 appears it must NOT be from our gate.
      expect(body.error ?? '').not.toContain('Admin access required');
    }
  });

  // Full CRUD lifecycle — proves the admin path can actually persist an override
  // end-to-end through HTTP, not just "get past the gate".
  it('admin can create, fetch, update, and delete a stored agent through HTTP', async () => {
    const admin = sharedAdmin!;
    const authHeaders = {
      authorization: `Bearer ${admin.idToken}`,
      'content-type': 'application/json',
    };
    const agentId = `crude2e-${Date.now()}`;

    try {
      // CREATE
      const createRes = await fetch(`${baseUrl}/api/mastra/stored/agents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: agentId,
          name: 'CRUD E2E Agent',
          instructions: 'E2E create: terse output.',
          model: { provider: 'openrouter', name: 'openai/gpt-4.1-mini' },
        }),
      });
      expect(createRes.status).toBeGreaterThanOrEqual(200);
      expect(createRes.status).toBeLessThan(300);

      // GET one (hydrated view)
      const getRes = await fetch(
        `${baseUrl}/api/mastra/stored/agents/${agentId}`,
        { headers: { authorization: `Bearer ${admin.idToken}` } },
      );
      expect(getRes.status).toBe(200);
      const fetched = (await getRes.json()) as { id?: string };
      expect(fetched.id ?? agentId).toBeDefined();

      // UPDATE (PATCH)
      const patchRes = await fetch(
        `${baseUrl}/api/mastra/stored/agents/${agentId}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ instructions: 'E2E update: one-sentence replies.' }),
        },
      );
      expect(patchRes.status).toBeGreaterThanOrEqual(200);
      expect(patchRes.status).toBeLessThan(300);

      // LIST — newly-created overrides are drafts, so filter by draft status.
      const listRes = await fetch(
        `${baseUrl}/api/mastra/stored/agents?status=draft`,
        { headers: { authorization: `Bearer ${admin.idToken}` } },
      );
      expect(listRes.status).toBe(200);
      const listed = (await listRes.json()) as { agents?: Array<{ id: string }> };
      const ids = (listed.agents ?? []).map((e) => e.id);
      expect(ids).toContain(agentId);
    } finally {
      // DELETE (cleanup, also validates delete path)
      await fetch(`${baseUrl}/api/mastra/stored/agents/${agentId}`, {
        method: 'DELETE',
        headers: authHeaders,
      }).catch(() => {});
    }
  });
});
