// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLastProjectId, getLastProjectId, setLastProjectId } from './lastProject';

function installLocalStorageMock() {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}

describe('lastProject storage helpers', () => {
  beforeEach(() => {
    installLocalStorageMock();
    window.localStorage.clear();
  });

  it('stores and reads the last project id', () => {
    setLastProjectId('project-123');

    expect(getLastProjectId()).toBe('project-123');
  });

  it('clears the last project id', () => {
    setLastProjectId('project-123');
    clearLastProjectId();

    expect(getLastProjectId()).toBeNull();
  });

  it('tolerates storage read and write failures', () => {
    const getItemSpy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const removeItemSpy = vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => setLastProjectId('project-123')).not.toThrow();
    expect(getLastProjectId()).toBeNull();
    expect(() => clearLastProjectId()).not.toThrow();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });
});
