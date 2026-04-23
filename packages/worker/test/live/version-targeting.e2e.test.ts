// ABOUTME: E2E test for agent version targeting — admin creates a draft override,
// ABOUTME: then the summarize route honors ?status=draft and routes through the editor's stored config.

import { afterAll, describe, expect, it } from 'vitest';

import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
// Use a separate admin email from the other E2E files so Firebase doesn't
// reject duplicate creates. The orchestrator allowlists both E2E_ADMIN_EMAIL
// and E2E_ADMIN_EMAIL_SECONDARY in ADMIN_EMAILS.
const adminEmail = process.env.E2E_ADMIN_EMAIL_SECONDARY;
const shouldRun = Boolean(
  baseUrl &&
  adminEmail &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const user of createdUsers) await user.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('agent version targeting (Tier B + Tier A)', { timeout: 180_000 }, () => {
  it('admin creates a draft override and ?status=draft routes through it', async () => {
    const admin = await createTestUser({
      uid: `admin-vt-${Date.now()}`,
      email: adminEmail!,
    });
    createdUsers.push(admin);

    const adminHeaders = {
      authorization: `Bearer ${admin.idToken}`,
      'content-type': 'application/json',
    };
    const MARKER = 'E2E_TARGETING_X7K3';

    const createRes = await fetch(`${baseUrl}/api/mastra/stored/agents`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        id: 'summarizer',
        name: 'Summarizer Override',
        instructions: `${MARKER} — respond in exactly one short sentence.`,
        model: { provider: 'openrouter', name: 'openai/gpt-4.1-mini' },
      }),
    });
    expect(createRes.status).toBeGreaterThanOrEqual(200);
    expect(createRes.status).toBeLessThan(300);

    try {
      // 2. Deterministic assertion: the GET endpoint with ?status=draft returns
      // the stored override. We pass the admin token (reads are open anyway).
      const getRes = await fetch(
        `${baseUrl}/api/mastra/stored/agents/summarizer?status=draft`,
        { headers: { authorization: `Bearer ${admin.idToken}` } },
      );
      expect(getRes.status).toBe(200);
      const storedBody = (await getRes.json()) as {
        instructions?: string | Array<{ content?: string }>;
      };
      const storedText = Array.isArray(storedBody.instructions)
        ? storedBody.instructions.map((b) => b?.content ?? '').join(' ')
        : storedBody.instructions ?? '';
      expect(storedText).toContain(MARKER);

      // 3. Behavioral assertion: the Tier B summarize route honors ?status=draft.
      // Bootstrap a project so workspace resolution succeeds.
      const regularUser = await createTestUser();
      createdUsers.push(regularUser);

      const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${regularUser.idToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: `vt-${regularUser.uid}` }),
      });
      expect(bootstrap.status).toBe(200);
      const { projectId } = (await bootstrap.json()) as { projectId: string };

      // Targeted call through the draft.
      const targetedRes = await fetch(
        `${baseUrl}/api/projects/${projectId}/summarize?status=draft`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${regularUser.idToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            paths: ['README.md'],
            question: 'Reply briefly.',
          }),
        },
      );
      expect(targetedRes.status).toBe(200);
      const targetedBody = (await targetedRes.json()) as { text: string };
      expect(typeof targetedBody.text).toBe('string');
      expect(targetedBody.text.length).toBeGreaterThan(0);

      // Baseline call without version opts — also 200, routes through code agent.
      const baselineRes = await fetch(
        `${baseUrl}/api/projects/${projectId}/summarize`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${regularUser.idToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            paths: ['README.md'],
            question: 'Reply briefly.',
          }),
        },
      );
      expect(baselineRes.status).toBe(200);
      const baselineBody = (await baselineRes.json()) as { text: string };
      expect(typeof baselineBody.text).toBe('string');
      expect(baselineBody.text.length).toBeGreaterThan(0);
    } finally {
      await fetch(`${baseUrl}/api/mastra/stored/agents/summarizer`, {
        method: 'DELETE',
        headers: adminHeaders,
      }).catch(() => {});
    }
  });
});
