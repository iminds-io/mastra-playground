import { describe, expect, it } from 'vitest';

import { parseEnv } from '../../src/env';

describe('parseEnv', () => {
  it('requires the database and firebase fields', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('parses the expected environment shape', () => {
    expect(
      parseEnv({
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/hono_workspace',
        WORKSPACE_ROOT: '/tmp/hono-workspace',
        FIREBASE_PROJECT_ID: 'demo-project',
        FIREBASE_TOKEN: 'demo-token',
        PORT: '4001',
      }),
    ).toEqual({
      databaseUrl: 'postgres://postgres:postgres@localhost:5432/hono_workspace',
      workspaceRoot: '/tmp/hono-workspace',
      firebaseProjectId: 'demo-project',
      firebaseApiKey: 'demo-token',
      port: 4001,
    });
  });
});
