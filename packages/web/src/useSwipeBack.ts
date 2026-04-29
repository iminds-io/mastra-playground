// ABOUTME: Swipe-back gesture hook for mobile thread navigation
// ABOUTME: Detects rightward horizontal swipes that exceed a threshold

import { useEffect, type RefObject } from 'react';

const SWIPE_THRESHOLD_PX = 80;

export function useSwipeBack(
  ref: RefObject<HTMLElement | null>,
  onSwipeBack: () => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);

      if (deltaX >= SWIPE_THRESHOLD_PX && deltaX > deltaY) {
        onSwipeBack();
      }
    };

    el.addEventListener('touchstart', handleTouchStart);
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, onSwipeBack]);
}
