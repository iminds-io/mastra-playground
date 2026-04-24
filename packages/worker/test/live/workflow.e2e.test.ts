// ABOUTME: E2E test for the native/internal Mastra workflow surface at /api/mastra/workflows/*.
// ABOUTME: Verifies route reachability and listing, not workspace-backed product workflow success.

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

describe.skipIf(!shouldRun)('Mastra native workflows (internal surface)', { timeout: 180_000 }, () => {
  it('GET /api/mastra/workflows lists ingestPipeline', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const res = await fetch(`${baseUrl}/api/mastra/workflows`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['ingestPipeline']));
  });

  it('POST /workflows/ingestPipeline/create-run + start-async reaches the native workflow surface', async () => {
    // Boot a project so we have a valid projectId, but do not inject a server-built
    // workspace object here. Workspace-backed success is covered by the
    // mindspace-scoped gateway E2E at /api/projects/:projectId/mastra/workflows/*.
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `wf-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    const { projectId } = await bootstrap.json() as { projectId: string };

    // Create a workflow run.
    const createRunRes = await fetch(
      `${baseUrl}/api/mastra/workflows/ingestPipeline/create-run`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(createRunRes.status).toBe(200);
    const runBody = await createRunRes.json() as { runId?: string };
    expect(typeof runBody.runId).toBe('string');
    const runId = runBody.runId!;

    // Start it async with minimal scalar request context only. This proves the native
    // route is reachable, not that it has product-grade workspace context.
    const startRes = await fetch(
      `${baseUrl}/api/mastra/workflows/ingestPipeline/start-async`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          runId,
          inputData: { rootPath: '/' },
          requestContext: {
            projectId,
            organizationId: 'e2e-org',
            role: 'owner',
          },
        }),
      },
    );

    expect(startRes.status).toBeGreaterThanOrEqual(200);
    expect(startRes.status).toBeLessThan(300);
    const body = await startRes.json() as {
      status?: string;
      steps?: Record<string, { status?: string; output?: unknown } | undefined>;
      result?: unknown;
    };
    // Mastra workflow result shape: { status, steps: { [stepId]: { status, output } }, result }.
    // Do not treat success as the product contract here; the mindspace gateway owns that.
    expect(body.status).toBeDefined();
    expect(['success', 'failed', 'suspended']).toContain(body.status);
    expect(body.steps).toBeDefined();
    expect(typeof body.steps).toBe('object');

    // If step records are present, the native route reached the workflow runner.
    const stepIds = Object.keys(body.steps ?? {});
    expect(stepIds.length).toBeGreaterThan(0);

    // If it happened to succeed, a result payload must be present.
    if (body.status === 'success') {
      expect(body.result).toBeDefined();
    }
  });
});
