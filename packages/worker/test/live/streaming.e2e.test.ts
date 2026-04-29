// ABOUTME: E2E test for Server-Sent Events streaming through the worker.
// ABOUTME: Verifies /messages/stream yields ack → token(s) → done in order.

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
  for (const u of createdUsers) await u.delete().catch(() => {});
});

type SseEvent = { event: string; data: unknown };

async function readSseStream(response: Response): Promise<SseEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SseEvent[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (eventLine && dataLine) {
        events.push({
          event: eventLine.slice('event: '.length).trim(),
          data: JSON.parse(dataLine.slice('data: '.length)),
        });
      }
    }
  }
  return events;
}

describe.skipIf(!shouldRun)('worker SSE streaming', { timeout: 180_000 }, () => {
  it('streams ack → token(s) → done in order', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    const bootstrapResponse = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `sse-${user.uid}` }),
    });
    const bootstrap = await bootstrapResponse.json() as {
      projectId: string;
      defaultChannelId: string;
    };

    const postResponse = await fetch(
      `${baseUrl}/api/projects/${bootstrap.projectId}/channels/${bootstrap.defaultChannelId}/posts`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      },
    );
    const post = await postResponse.json() as { thread: { id: string } };

    const response = await fetch(
      `${baseUrl}/api/projects/${bootstrap.projectId}/channels/${bootstrap.defaultChannelId}/threads/${post.thread.id}/messages/stream`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'respond with a short greeting' }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSseStream(response);
    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('ack');
    expect(kinds).toContain('token');
    expect(kinds.at(-1)).toBe('done');
  });

  it('streams thread_created → ack → token(s) → done for new root posts', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    const bootstrapResponse = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `stream-root-${user.uid}` }),
    });
    const bootstrap = await bootstrapResponse.json() as {
      projectId: string;
      defaultChannelId: string;
    };

    const response = await fetch(
      `${baseUrl}/api/projects/${bootstrap.projectId}/channels/${bootstrap.defaultChannelId}/posts/stream`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'respond with a short greeting' }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSseStream(response);
    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('thread_created');
    expect(kinds[1]).toBe('ack');
    expect(kinds).toContain('token');
    expect(kinds.at(-1)).toBe('done');
  });
});
