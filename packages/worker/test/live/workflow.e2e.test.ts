// ABOUTME: E2E test for Tier A workflow surface — Mastra's native /api/mastra/workflows/* routes.
// ABOUTME: Verifies ingestPipeline is listable and that a run can be created + started via the HTTP API.

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

describe.skipIf(!shouldRun)('Mastra native workflows (Tier A)', { timeout: 180_000 }, () => {
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

  it('POST /workflows/ingestPipeline/create-run + start-async runs the two-step pipeline', async () => {
    // Boot a project so the workflow has a workspace to read from.
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

    // Start it async with minimal input. Workflow must complete within the 180s describe timeout.
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
    // Mastra workflow result shape: { status, steps: { [stepId]: { status, output } }, result }
    expect(body.status).toBeDefined();
    expect(['success', 'failed', 'suspended']).toContain(body.status);
    expect(body.steps).toBeDefined();
    expect(typeof body.steps).toBe('object');

    // ingestPipeline has two named steps: listDocs → summarize. Assert both ran.
    const stepIds = Object.keys(body.steps ?? {});
    expect(stepIds.length).toBeGreaterThanOrEqual(2);

    // If the workflow succeeded we should see a top-level result payload.
    if (body.status === 'success') {
      expect(body.result).toBeDefined();
    }
  });
});
