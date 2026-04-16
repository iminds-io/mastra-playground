// ABOUTME: Tests for the workspace factory context holder, verifying
// ABOUTME: that get/set lifecycle and error behavior work correctly.

import { describe, it, expect, afterEach } from 'vitest';
import { setWorkspaceFactory, getWorkspaceFactory } from '../../src/workspace/workspace-context';

describe('workspace context', () => {
  afterEach(() => {
    setWorkspaceFactory(undefined as any);
  });

  it('returns the factory that was set', () => {
    const fakeFactory = async (basePath: string) => ({} as any);
    setWorkspaceFactory(fakeFactory);
    expect(getWorkspaceFactory()).toBe(fakeFactory);
  });

  it('throws when no factory has been set', () => {
    expect(() => getWorkspaceFactory()).toThrow('Workspace factory has not been initialized');
  });
});
