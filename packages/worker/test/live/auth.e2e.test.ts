// ABOUTME: E2E tests for auth middleware — unauthenticated and malformed-token rejections,
// ABOUTME: and that a real Firebase ID token is accepted.

import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.FIREBASE_TOKEN,
);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const u of createdUsers) {
    await u.delete().catch((err) => {
      console.error(`[e2e] failed to delete Firebase user ${u.uid}:`, err);
    });
  }
});

describe.skipIf(!shouldRun)('worker auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const response = await fetch(`${baseUrl}/api/projects`);
    expect(response.status).toBe(401);
  });

  it('rejects requests with malformed Authorization header', async () => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { authorization: 'NotBearer something' },
    });
    expect(response.status).toBe(401);
  });

  it('rejects requests with invalid bearer tokens', async () => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { authorization: 'Bearer not.a.real.jwt' },
    });
    expect(response.status).toBe(401);
  });

  it('accepts requests with a valid Firebase ID token', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { projects: unknown[] };
    expect(body).toHaveProperty('projects');
    expect(Array.isArray(body.projects)).toBe(true);
  });

  it('returns session bootstrap data with a valid Firebase ID token', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      me: { uid: string; email: string | null; name: string | null };
      projects: unknown[];
      preferredProjectId: string | null;
    };
    expect(body.me.uid).toBe(user.uid);
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body).toHaveProperty('preferredProjectId');
  });
});
