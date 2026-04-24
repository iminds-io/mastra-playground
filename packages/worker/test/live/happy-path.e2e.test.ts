// ABOUTME: E2E happy-path test — full flow through the deployed worker:
// ABOUTME: bootstrap-project → create channel → post message → verify model replied.

import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const u of createdUsers) {
    await u.delete().catch(() => {
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

describe.skipIf(!shouldRun)('worker happy path (non-Mastra)', { timeout: 60_000 }, () => {
  it('completes bootstrap and lists channels', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    const bootstrap = await apiCall<{
      projectId: string;
      organizationId: string;
      defaultChannelId: string;
      mindspaceRootPath: string;
    }>('/api/dev/bootstrap-project', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: `e2e-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.projectId).toBeTruthy();
    expect(bootstrap.body.mindspaceRootPath).toBeTruthy();
    const { projectId, defaultChannelId } = bootstrap.body;

    const channels = await apiCall<{ channels: Array<{ id: string }> }>(
      `/api/projects/${projectId}/channels`,
      { method: 'GET', token },
    );
    expect(channels.status).toBe(200);
    expect(channels.body.channels.some((c) => c.id === defaultChannelId)).toBe(true);

    // Create a second channel to verify the write path
    const newChannel = await apiCall<{ channel: { id: string; name: string } }>(
      `/api/projects/${projectId}/channels`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'test-channel', description: 'e2e' }),
      },
    );
    expect(newChannel.status).toBe(200);
    expect(newChannel.body.channel.name).toBe('test-channel');
  });
});

describe.skipIf(!shouldRun)('worker happy path (Mastra)', { timeout: 180_000 }, () => {
  it('completes bootstrap → create post → send message and receive model reply', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    const bootstrap = await apiCall<{
      projectId: string;
      defaultChannelId: string;
    }>('/api/dev/bootstrap-project', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: `e2e-mastra-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    const { projectId, defaultChannelId } = bootstrap.body;

    const post = await apiCall<{
      thread: { id: string };
      rootMessage: { id: string; text: string };
    }>(`/api/projects/${projectId}/channels/${defaultChannelId}/posts`, {
      method: 'POST',
      token,
      body: JSON.stringify({ message: 'say "ok" and nothing else' }),
    });
    expect(post.status).toBe(200);
    expect(post.body.rootMessage.text).toBeTruthy();
    const threadId = post.body.thread.id;

    const reply = await apiCall<{
      text: string;
      threadId: string;
    }>(`/api/projects/${projectId}/channels/${defaultChannelId}/threads/${threadId}/messages`, {
      method: 'POST',
      token,
      body: JSON.stringify({ message: 'respond with the single word "done"' }),
    });
    expect(reply.status).toBe(200);
    expect(reply.body.threadId).toBe(threadId);
    expect(reply.body.text.length).toBeGreaterThan(0);
  });
});
