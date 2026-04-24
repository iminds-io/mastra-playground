import { describe, expect, it } from 'vitest';

import { parseEnv } from '../../src/env';

describe('parseEnv', () => {
  it('requires the database and firebase fields', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('parses the expected environment shape', () => {
    expect(
      parseEnv({
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/mastra_mindspace',
        MINDSPACE_ROOT: '/tmp/mastra-mindspace',
        FIREBASE_PROJECT_ID: 'demo-project',
        FIREBASE_TOKEN: 'demo-token',
        PORT: '4001',
      }),
    ).toEqual({
      databaseUrl: 'postgres://postgres:postgres@localhost:5432/mastra_mindspace',
      mindspaceRoot: '/tmp/mastra-mindspace',
      firebaseProjectId: 'demo-project',
      firebaseApiKey: 'demo-token',
      port: 4001,
    });
  });
});
