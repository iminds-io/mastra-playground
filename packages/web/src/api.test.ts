// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { runAdminTest } from './api';

describe('apiFetch', () => {
  it('surfaces plain-text server errors without throwing a JSON parse exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('Internal Server Error', {
          status: 500,
          headers: {
            'content-type': 'text/plain',
          },
        }),
      ),
    );

    await expect(
      runAdminTest(
        {
          getIdToken: async () => 'demo-token',
        },
        'project-1',
        'hello',
      ),
    ).rejects.toThrow('[500] Internal Server Error');
  });
});
