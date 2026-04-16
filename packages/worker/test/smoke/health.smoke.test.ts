// ABOUTME: Smoke test for deployed worker health — validates the production URL responds.

import { describe, it, expect } from 'vitest';

const baseUrl = process.env.SMOKE_BASE_URL;

describe.skipIf(!baseUrl)('deployed worker health', () => {
  it('GET /health returns 200', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready returns 200', async () => {
    const response = await fetch(`${baseUrl}/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
