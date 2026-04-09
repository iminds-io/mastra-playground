import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

describe('agent run route', () => {
  it('returns 401 when no bearer token is provided', async () => {
    const app = await createApp();
    const response = await app.request('/api/projects/project-1/agent/run', {
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });
});
