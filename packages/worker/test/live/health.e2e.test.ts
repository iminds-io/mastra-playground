// ABOUTME: E2E test for worker health endpoints. Verifies the spawned wrangler dev
// ABOUTME: instance responds correctly to unauthenticated health/ready probes.

import { describe, it, expect } from 'vitest';

const baseUrl = process.env.WORKER_BASE_URL;

describe.skipIf(!baseUrl)('worker health endpoints', () => {
  it('GET /health returns 200 with status ok', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready returns 200 with ok: true', async () => {
    const response = await fetch(`${baseUrl}/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
