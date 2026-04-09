import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config';

describe('vite config', () => {
  it('loads frontend environment variables from the repo root', () => {
    expect(viteConfig.envDir).toBe('../..');
  });
});
