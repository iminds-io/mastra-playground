// ABOUTME: E2E test for Tier A, the Mastra-native HTTP surface at /api/mastra/*.
// ABOUTME: Covers auth, agent listing, synchronous generation, and SSE streaming.

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

describe.skipIf(!shouldRun)('Mastra native surface (Tier A)', { timeout: 120_000 }, () => {
  it('GET /api/mastra/agents lists registered agents', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const res = await fetch(`${baseUrl}/api/mastra/agents`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(expect.arrayContaining([
      'project-agent',
      'summarizer',
      'workspace-reviewer',
      'workspace-supervisor',
    ]));
  });

  it('POST /api/mastra/agents/workspace-reviewer/generate returns a model reply', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const res = await fetch(`${baseUrl}/api/mastra/agents/workspace-reviewer/generate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: 'Say ok in one word.',
        memory: { thread: 'e2e-reviewer', resource: 'harness:tier-a:project:e2e' },
        requestContext: {
          projectId: 'e2e-project',
          organizationId: 'e2e-org',
          role: 'owner',
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { text?: string };
    expect(typeof body.text).toBe('string');
    expect(body.text!.length).toBeGreaterThan(0);
  });

  it('POST /api/mastra/agents/summarizer/generate returns a model reply', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const res = await fetch(`${baseUrl}/api/mastra/agents/summarizer/generate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: 'Summarize: nothing yet. Return one short sentence.',
        memory: { thread: 'e2e-generate', resource: 'harness:tier-a:project:e2e' },
        requestContext: {
          projectId: 'e2e-project',
          organizationId: 'e2e-org',
          role: 'owner',
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { text?: string };
    expect(typeof body.text).toBe('string');
    expect(body.text!.length).toBeGreaterThan(0);
  });

  it('POST /api/mastra/agents/summarizer/stream returns SSE data chunks', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const res = await fetch(`${baseUrl}/api/mastra/agents/summarizer/stream`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: 'Say ok in one word.',
        memory: { thread: 'e2e-stream', resource: 'harness:tier-a:project:e2e' },
        requestContext: {
          projectId: 'e2e-project',
          organizationId: 'e2e-org',
          role: 'owner',
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const chunks = await res.text();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks).toContain('data:');
    expect(chunks).toContain('"type":"text-delta"');
  });
});
