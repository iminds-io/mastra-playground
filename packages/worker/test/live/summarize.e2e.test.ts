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

describe.skipIf(!shouldRun)('POST /api/projects/:projectId/summarize', { timeout: 120_000 }, () => {
  it('summarizes after project bootstrap', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `sum-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    const { projectId } = await bootstrap.json() as { projectId: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/summarize`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        paths: ['docs/spec.md'],
        question: 'Reply with "ok".',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { projectId: string; text: string };
    expect(body.projectId).toBe(projectId);
    expect(body.text.length).toBeGreaterThan(0);
  });
});
