// ABOUTME: E2E coverage for the project-scoped workspace supervisor route.
// ABOUTME: Verifies bootstrap + authenticated Tier B supervisor execution through Wrangler.

import { afterAll, describe, expect, it } from 'vitest';

import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const user of createdUsers) await user.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('POST /api/projects/:projectId/supervise', { timeout: 180_000 }, () => {
  it('runs the workspace supervisor after project bootstrap', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `supervisor-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    const { projectId } = await bootstrap.json() as { projectId: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/supervise`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Review this empty demo workspace and return one short sentence.',
        paths: ['README.md'],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { text?: string; projectId?: string };
    expect(body.projectId).toBe(projectId);
    expect(typeof body.text).toBe('string');
    expect(body.text!.length).toBeGreaterThan(0);
  });
});
