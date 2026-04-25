// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMobileNav } from './useMobileNav';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe('useMobileNav', () => {
  let listeners: Array<(event: { matches: boolean }) => void>;

  beforeEach(() => {
    listeners = [];
    setViewportWidth(375);
    vi.stubGlobal('matchMedia', () => ({
      matches: window.innerWidth <= 768,
      media: '(max-width: 768px)',
      addEventListener: (_event: string, handler: (event: { matches: boolean }) => void) => {
        listeners.push(handler);
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tracks mobile state and stack transitions', () => {
    const { result } = renderHook(() => useMobileNav());

    expect(result.current.isMobile).toBe(true);
    expect(result.current.screen).toBe('index');

    act(() => result.current.pushThread());
    expect(result.current.screen).toBe('thread');

    act(() => result.current.popScreen());
    expect(result.current.screen).toBe('index');
  });

  it('opens and closes the sidebar independently', () => {
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.openSidebar());
    expect(result.current.isSidebarOpen).toBe(true);

    act(() => result.current.closeSidebar());
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('resets stack when leaving mobile width', () => {
    const { result } = renderHook(() => useMobileNav());
    act(() => {
      result.current.pushThread();
      result.current.openSidebar();
    });

    act(() => {
      setViewportWidth(1024);
      for (const listener of listeners) {
        listener({ matches: false });
      }
    });

    expect(result.current.isMobile).toBe(false);
    expect(result.current.screen).toBe('index');
    expect(result.current.isSidebarOpen).toBe(false);
  });
});
