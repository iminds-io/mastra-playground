// @vitest-environment jsdom
// ABOUTME: Tests for the swipe-back gesture hook
// ABOUTME: Validates horizontal swipe detection with threshold and directional dominance

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSwipeBack } from './useSwipeBack';

function createTouchEvent(type: string, clientX: number, clientY: number) {
  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [{ clientX, clientY } as Touch],
    changedTouches: [{ clientX, clientY } as Touch],
    bubbles: true,
  });
}

describe('useSwipeBack', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onSwipeBack when a rightward swipe exceeds the threshold', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: document.createElement('div') };
    renderHook(() => useSwipeBack(ref, onSwipeBack));

    ref.current.dispatchEvent(createTouchEvent('touchstart', 30, 200));
    ref.current.dispatchEvent(createTouchEvent('touchend', 140, 210));

    expect(onSwipeBack).toHaveBeenCalledOnce();
  });

  it('does not fire for leftward swipes', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: document.createElement('div') };
    renderHook(() => useSwipeBack(ref, onSwipeBack));

    ref.current.dispatchEvent(createTouchEvent('touchstart', 200, 200));
    ref.current.dispatchEvent(createTouchEvent('touchend', 50, 200));

    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('does not fire when horizontal distance is below threshold', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: document.createElement('div') };
    renderHook(() => useSwipeBack(ref, onSwipeBack));

    ref.current.dispatchEvent(createTouchEvent('touchstart', 30, 200));
    ref.current.dispatchEvent(createTouchEvent('touchend', 90, 200));

    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('does not fire when vertical movement dominates', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: document.createElement('div') };
    renderHook(() => useSwipeBack(ref, onSwipeBack));

    ref.current.dispatchEvent(createTouchEvent('touchstart', 30, 100));
    ref.current.dispatchEvent(createTouchEvent('touchend', 140, 300));

    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('does nothing when ref is null', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: null };
    renderHook(() => useSwipeBack(ref, onSwipeBack));

    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('cleans up event listeners on unmount', () => {
    const onSwipeBack = vi.fn();
    const el = document.createElement('div');
    const removeSpy = vi.spyOn(el, 'removeEventListener');
    const ref = { current: el };

    const { unmount } = renderHook(() => useSwipeBack(ref, onSwipeBack));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
  });
});
