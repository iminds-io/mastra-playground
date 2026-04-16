import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

describe('app health', () => {
  it('serves the health endpoint', async () => {
    const app = await createApp();
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
