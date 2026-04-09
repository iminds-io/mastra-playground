import { describe, expect, it } from 'vitest';

import { createMastra } from '../../src/mastra/create-mastra';

describe('createMastra', () => {
  it('creates a Mastra instance with the default project agent registered', () => {
    const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');

    expect(mastra).toBeDefined();
    expect(mastra.getAgent('projectAgent')).toBeDefined();
  });
});
