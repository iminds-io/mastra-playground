// ABOUTME: Unit coverage for createApp's required-env behavior.
// ABOUTME: Guards against silent dev-default fallbacks for FIREBASE_PROJECT_ID and DATABASE_URL.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

describe('createApp env requirements', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when FIREBASE_PROJECT_ID is missing and no tokenVerifier override is supplied', async () => {
    process.env.DATABASE_URL = 'postgres://placeholder/db';
    await expect(createApp()).rejects.toThrow(/FIREBASE_PROJECT_ID is required/);
  });

  it('throws when DATABASE_URL is missing and no mastra override is supplied', async () => {
    process.env.FIREBASE_PROJECT_ID = 'placeholder-project';
    await expect(createApp()).rejects.toThrow(/DATABASE_URL is required/);
  });

  it('does not require FIREBASE_PROJECT_ID when a tokenVerifier override is supplied', async () => {
    process.env.DATABASE_URL = 'postgres://placeholder/db';
    const tokenVerifier = {
      verifyIdToken: async () => ({
        uid: 'u',
        email: null,
        emailVerified: false,
        name: null,
        picture: null,
        authTime: null,
        rawClaims: {},
      }),
    };
    await expect(createApp({ tokenVerifier })).resolves.toBeDefined();
  });
});
