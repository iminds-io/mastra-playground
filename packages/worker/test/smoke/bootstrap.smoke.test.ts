// ABOUTME: Smoke test that exercises the deployed worker's bootstrap path to prove
// ABOUTME: real Neon + Firebase integration in production. Cleans up Firebase user after.

import { describe, it, expect, afterAll } from 'vitest';

import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.SMOKE_BASE_URL;
// Bootstrap writes to the production DB, which requires the schema to be applied.
// Opt in with SMOKE_REQUIRES_MIGRATED_DB=true once the production DB is migrated.
const shouldRun = Boolean(
  baseUrl &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  process.env.SMOKE_REQUIRES_MIGRATED_DB === 'true',
);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const u of createdUsers) {
    await u.delete().catch(() => {
      /* best effort */
    });
  }
});

describe.skipIf(!shouldRun)('deployed worker bootstrap', { timeout: 60_000 }, () => {
  it('bootstrap-project creates a real project with workspace and channel', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const response = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `smoke-${user.uid}` }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      projectId: string;
      organizationId: string;
      defaultChannelId: string;
      workspaceRootPath: string;
    };
    expect(body.projectId).toBeTruthy();
    expect(body.organizationId).toBeTruthy();
    expect(body.defaultChannelId).toBeTruthy();
    expect(body.workspaceRootPath).toBeTruthy();

    // NOTE: The project persists in production DB. Firebase user is cleaned up
    // in afterAll, but the project/org rows remain under the (now-deleted) UID.
    // Production cleanup of orphaned test projects is a known follow-up.
  });
});
