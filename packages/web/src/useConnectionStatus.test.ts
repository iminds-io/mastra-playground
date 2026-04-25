// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStatus } from './useConnectionStatus';

describe('useConnectionStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts connected', () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('connected');
  });

  it('becomes reconnecting after one failure and offline after three', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => result.current.reportFailure());
    expect(result.current.status).toBe('reconnecting');

    act(() => {
      result.current.reportFailure();
      result.current.reportFailure();
    });
    expect(result.current.status).toBe('offline');
  });

  it('transitions through reconnected back to connected on success', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => result.current.reportFailure());
    act(() => result.current.reportSuccess());

    expect(result.current.status).toBe('reconnected');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.status).toBe('connected');
  });
});
