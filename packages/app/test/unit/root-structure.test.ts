import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

describe('workspace scaffold', () => {
  it('creates the expected root files', () => {
    expect(existsSync(resolve(repoRoot, 'package.json'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'docker-compose.yml'))).toBe(true);
  });
});
