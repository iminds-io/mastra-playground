import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

describe('readiness', () => {
  it('returns readiness state', async () => {
    const app = await createApp();
    const response = await app.request('/ready');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
    });
  });
});
