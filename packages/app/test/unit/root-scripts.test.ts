import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

describe('root scripts', () => {
  it('exposes a single command to run backend and frontend together', () => {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['dev:full']).toBeDefined();
  });

  it('targets the mastra-mindspace package scope in root scripts', () => {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.dev).toContain('@mastra-mindspace/app');
    expect(packageJson.scripts?.['dev:web']).toContain('@mastra-mindspace/web');
    expect(packageJson.scripts?.['test:e2e']).toContain('@mastra-mindspace/worker');
    expect(packageJson.scripts?.['test:smoke']).toContain('@mastra-mindspace/worker');
  });
});
