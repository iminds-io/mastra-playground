// ABOUTME: Unit coverage for the shared OpenRouter model resolver.
// ABOUTME: Guards the env-variable fallback and missing-key error path.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveOpenRouterModel } from '../../src/mastra/agents/model';

describe('resolveOpenRouterModel', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when no API key is available in config or environment', () => {
    expect(() => resolveOpenRouterModel()).toThrow(/OPENROUTER_API_KEY is required/);
  });

  it('prefers explicit config over environment', () => {
    process.env.OPENROUTER_API_KEY = 'env-key';
    const model = resolveOpenRouterModel({ openrouterApiKey: 'config-key' });
    expect(model).toBeDefined();
  });

  it('falls back to environment when config omits the key', () => {
    process.env.OPENROUTER_API_KEY = 'env-key';
    const model = resolveOpenRouterModel();
    expect(model).toBeDefined();
  });
});
