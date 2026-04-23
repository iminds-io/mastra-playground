import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config';

describe('vite config', () => {
  it('loads frontend environment variables from the repo root', async () => {
    const resolved = await (typeof viteConfig === 'function'
      ? viteConfig({ command: 'serve', mode: 'development' })
      : viteConfig);
    expect(resolved.envDir).toBe('../..');
  });
});
