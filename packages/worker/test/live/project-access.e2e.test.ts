// ABOUTME: E2E authorization test for project-scoped routes.
// ABOUTME: Verifies that one authenticated user cannot read another user's project channels.

import { afterAll, describe, expect, it } from 'vitest';

import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const user of createdUsers) {
    await user.delete().catch(() => {
      /* best effort */
    });
  }
});

async function apiCall<T>(
  path: string,
  init: RequestInit & { token: string },
): Promise<{ status: number; body: T }> {
  const { token, ...rest } = init;
  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      ...(rest.headers ?? {}),
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
  const body = await response.json().catch(() => ({})) as T;
  return { status: response.status, body };
}

describe.skipIf(!shouldRun)('worker project access authorization', { timeout: 60_000 }, () => {
  it('returns 403 when a different authenticated user requests another user’s project channels', async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    createdUsers.push(owner, intruder);

    const bootstrap = await apiCall<{
      projectId: string;
      defaultChannelId: string;
    }>('/api/dev/bootstrap-project', {
      method: 'POST',
      token: owner.idToken,
      body: JSON.stringify({ name: `access-check-${owner.uid}` }),
    });

    expect(bootstrap.status).toBe(200);

    const response = await apiCall<{ error: string }>(
      `/api/projects/${bootstrap.body.projectId}/channels`,
      {
        method: 'GET',
        token: intruder.idToken,
      },
    );

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/access/i);
  });
});
