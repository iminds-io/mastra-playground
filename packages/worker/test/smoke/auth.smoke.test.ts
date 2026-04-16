// ABOUTME: Smoke test for deployed worker auth — verifies it rejects unauthed and accepts valid Firebase tokens.

import { describe, it, expect, afterAll } from 'vitest';

import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.SMOKE_BASE_URL;
const shouldRun = Boolean(baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS);
// Authed GET /api/projects queries the projects table, which requires the
// production DB to have migrations applied. Gate the authed test on an opt-in env.
const shouldExerciseDb = process.env.SMOKE_REQUIRES_MIGRATED_DB === 'true';

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const u of createdUsers) {
    await u.delete().catch(() => {
      /* best effort */
    });
  }
});

describe.skipIf(!shouldRun)('deployed worker auth', () => {
  it('rejects unauthed /api/projects with 401', async () => {
    const response = await fetch(`${baseUrl}/api/projects`);
    expect(response.status).toBe(401);
  });

  it.skipIf(!shouldExerciseDb)(
    'accepts /api/projects with a valid Firebase token (requires migrated DB)',
    async () => {
      const user = await createTestUser();
      createdUsers.push(user);
      const response = await fetch(`${baseUrl}/api/projects`, {
        headers: { authorization: `Bearer ${user.idToken}` },
      });
      expect(response.status).toBe(200);
    },
  );
});
