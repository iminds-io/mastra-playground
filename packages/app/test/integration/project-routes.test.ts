import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

describe('project routes', () => {
  it('rejects missing auth on protected routes', async () => {
    const app = await createApp();
    const response = await app.request('/api/projects/project-1/workspace');

    expect(response.status).toBe(401);
  });
});
