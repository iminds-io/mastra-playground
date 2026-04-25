// @vitest-environment jsdom
// ABOUTME: Tests for the useTheme hook — preference persistence, DOM attribute, and cycling
// ABOUTME: Validates 3-state theme cycle and system preference resolution

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from './useTheme';

describe('useTheme', () => {
  let matchMediaListeners: Array<(event: { matches: boolean }) => void>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    matchMediaListeners = [];

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: (_event: string, handler: (event: { matches: boolean }) => void) => {
        matchMediaListeners.push(handler);
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

  it('defaults to "system" when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('system');
  });

  it('sets data-theme to the resolved system preference on mount', () => {
    renderHook(() => useTheme());

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('reads a stored preference from localStorage', () => {
    localStorage.setItem('mindspace-theme', 'light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('cycles through light → dark → system on each call to cycle()', () => {
    localStorage.setItem('mindspace-theme', 'light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('light');

    act(() => result.current.cycle());
    expect(result.current.preference).toBe('dark');
    expect(localStorage.getItem('mindspace-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.cycle());
    expect(result.current.preference).toBe('system');
    expect(localStorage.getItem('mindspace-theme')).toBe('system');

    act(() => result.current.cycle());
    expect(result.current.preference).toBe('light');
  });

  it('exposes the resolved theme that the UI actually shows', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe('dark');

    act(() => result.current.cycle());

    expect(result.current.resolvedTheme).toBe('light');
  });

  it('responds to system preference changes when in system mode', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe('dark');

    act(() => {
      for (const listener of matchMediaListeners) {
        listener({ matches: false });
      }
    });

    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
