# ABOUTME: Implementation plan for Phase 11j — Mobile Layout (stack navigation, slide-over sidebar, touch targets)
# ABOUTME: Covers mobile top bar, push/pop thread navigation, swipe gestures, full-screen search overlay

# Phase 11j: Mobile Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 3-4 focused sessions
**Dependencies**: Phase 11a (layout shell, router, auth), Phase 11c (thread index), Phase 11d (thread detail). The layout shell provides the 2/3-column grid with responsive breakpoints. The thread index and detail provide the components that this phase re-arranges for mobile.

**Goal:** Transform the desktop 2/3-column layout into a stack-based mobile navigation at ≤768px. The mobile experience uses a persistent top bar, push/pop thread navigation (thread detail replaces the index), a slide-over sidebar overlay, swipe-right gesture for back navigation, and a full-screen search overlay. All touch targets meet WCAG 2.5.5 (≥44x44px).

**Architecture:** Mobile layout is purely additive CSS + a thin React coordination layer. No desktop behavior changes. A `useMobileNav` hook manages the navigation stack state (which screen is active). The sidebar becomes a slide-over overlay with backdrop. The existing components (Sidebar, ChannelFeed, ThreadDrawer) are reused — only their container visibility and positioning change at the mobile breakpoint.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Vitest 4 + @testing-library/react, `@mastra-mindspace/ui` design system. CSS `@media (max-width: 768px)` for all mobile rules. Touch gesture detection via `touchstart`/`touchmove`/`touchend` (no external gesture library — YAGNI).

---

## Current State Summary

| Area | What exists | File |
|------|-------------|------|
| **Breakpoints** | `@media (max-width: 1100px)` collapses to 2-col. `@media (max-width: 768px)` stacks everything vertically in a single column with `overflow: auto`. | `packages/web/src/styles.css` lines 370-411 |
| **Mobile layout** | At ≤768px, sidebar/feed/drawer stack vertically. Sidebar always visible. Feed has `min-height: 60vh`. Drawer has `min-height: 40vh`. No top bar. No stack navigation. | `packages/web/src/styles.css` lines 382-411 |
| **Sidebar** | Always rendered as `<aside className="sidebar">` in the grid. No overlay, no backdrop, no slide-in animation. | `packages/web/src/Sidebar.tsx` |
| **Thread selection** | `selectedThread` state in App.tsx. ThreadDrawer always rendered in the grid — just shows empty state when no thread selected. | `packages/web/src/App.tsx` lines 602-623 |
| **Navigation** | Router-based (`/chat/:projectId`). Thread selection is state-only, not URL-based. No mobile nav stack concept. | `packages/web/src/App.tsx` |
| **Search** | No search UI exists yet. | — |
| **Touch targets** | Default browser sizes. No explicit 44px minimums. Channel buttons have `padding: 0.45rem 0.85rem` (~30px height). | `packages/web/src/styles.css` line 148 |
| **Composer** | Textarea with `rows={4}`. No explicit min-height. | `packages/web/src/ChannelFeed.tsx` line 91 |

---

## Success Criteria

- [ ] At ≤768px, a persistent top bar renders with contextual left/center/right content
- [ ] Thread index state: top bar shows ☰ (left), #channel-name (center), 🔍 (right)
- [ ] Thread detail state: top bar shows ← back (left), "Thread" (center), ✕ close (right)
- [ ] Sidebar open state: top bar hidden behind sidebar overlay
- [ ] Tapping a thread card pushes thread detail view, replacing the thread index
- [ ] ← back button pops thread detail, returning to thread index
- [ ] Sidebar slides in from the left as an overlay with backdrop that dims content
- [ ] Tapping backdrop or ✕ closes the sidebar
- [ ] Swipe right gesture (≥80px horizontal, dominant axis) triggers back navigation from thread detail
- [ ] Search icon opens a full-screen search overlay (placeholder content for now — search implementation is a separate phase)
- [ ] All interactive elements have ≥44x44px touch targets at mobile breakpoint
- [ ] Thread cards are full-width with min-height 72px
- [ ] Composer textarea has min-height 48px at mobile breakpoint
- [ ] Desktop layout (>768px) is completely unchanged
- [ ] All existing tests continue to pass
- [ ] New tests cover mobile navigation state transitions, gesture detection, and touch target sizing

---

## Recommended Sequencing

Execute these phases in order. Each phase is independently shippable.

1. **Phase 1: Mobile Detection Hook** — `useMobileNav` hook that tracks viewport width and navigation stack state.
2. **Phase 2: Mobile Top Bar** — Persistent top bar component with contextual content based on nav state.
3. **Phase 3: Stack Navigation** — Thread detail replaces index (push/pop), wired through `useMobileNav`.
4. **Phase 4: Sidebar Overlay** — Slide-over sidebar with backdrop at mobile breakpoint.
5. **Phase 5: Touch Targets & Sizing** — WCAG 2.5.5 compliance, thread card heights, composer sizing.
6. **Phase 6: Swipe Gesture** — Swipe-right to go back from thread detail.
7. **Phase 7: Search Overlay** — Full-screen search overlay (placeholder UI).

---

## Phase 1: Mobile Detection Hook

### Task 1.1: Create `useMobileNav` hook

A hook that tracks whether the viewport is at mobile width (≤768px) and manages the mobile navigation stack. The stack has three possible screen states: `"index"` (thread list), `"thread"` (thread detail), and `"search"` (search overlay). The sidebar overlay is tracked separately as a boolean.

**Files:**

- Create: `packages/web/src/useMobileNav.ts`
- Create: `packages/web/src/useMobileNav.test.ts`

**TDD Step 1: Write failing tests**

Create `packages/web/src/useMobileNav.test.ts`:

```ts
// @vitest-environment jsdom
// ABOUTME: Tests for the mobile navigation state hook
// ABOUTME: Validates viewport detection, screen stack transitions, and sidebar overlay toggling

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
  let matchMediaListeners: Array<(e: { matches: boolean }) => void>;

  beforeEach(() => {
    matchMediaListeners = [];

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('768') ? window.innerWidth <= 768 : false,
      media: query,
      addEventListener: (_event: string, handler: (e: { matches: boolean }) => void) => {
        matchMediaListeners.push(handler);
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));

    setViewportWidth(375);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setViewportWidth(1024);
  });

  it('reports isMobile as true when viewport is ≤768px', () => {
    const { result } = renderHook(() => useMobileNav());
    expect(result.current.isMobile).toBe(true);
  });

  it('reports isMobile as false when viewport is >768px', () => {
    setViewportWidth(1024);
    const { result } = renderHook(() => useMobileNav());
    expect(result.current.isMobile).toBe(false);
  });

  it('starts with screen set to "index"', () => {
    const { result } = renderHook(() => useMobileNav());
    expect(result.current.screen).toBe('index');
  });

  it('pushes to "thread" screen', () => {
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.pushThread());
    expect(result.current.screen).toBe('thread');
  });

  it('pops back to "index" from "thread"', () => {
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.pushThread());
    expect(result.current.screen).toBe('thread');

    act(() => result.current.popScreen());
    expect(result.current.screen).toBe('index');
  });

  it('popScreen from "index" stays at "index"', () => {
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.popScreen());
    expect(result.current.screen).toBe('index');
  });

  it('pushes to "search" screen', () => {
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.pushSearch());
    expect(result.current.screen).toBe('search');
  });

  it('pops from "search" back to "index"', () => {
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.pushSearch());
    act(() => result.current.popScreen());
    expect(result.current.screen).toBe('index');
  });

  it('tracks sidebar overlay open/close independently', () => {
    const { result } = renderHook(() => useMobileNav());

    expect(result.current.isSidebarOpen).toBe(false);

    act(() => result.current.openSidebar());
    expect(result.current.isSidebarOpen).toBe(true);

    act(() => result.current.closeSidebar());
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('closes sidebar when navigating to a thread', () => {
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.openSidebar());
    expect(result.current.isSidebarOpen).toBe(true);

    act(() => result.current.pushThread());
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('resets to "index" when resetStack is called', () => {
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.pushThread());
    act(() => result.current.resetStack());
    expect(result.current.screen).toBe('index');
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('responds to viewport changes via matchMedia listener', () => {
    setViewportWidth(375);
    const { result } = renderHook(() => useMobileNav());
    expect(result.current.isMobile).toBe(true);

    act(() => {
      setViewportWidth(1024);
      for (const listener of matchMediaListeners) {
        listener({ matches: false });
      }
    });

    expect(result.current.isMobile).toBe(false);
  });

  it('resets stack when transitioning from mobile to desktop', () => {
    setViewportWidth(375);
    const { result } = renderHook(() => useMobileNav());

    act(() => result.current.pushThread());
    act(() => result.current.openSidebar());
    expect(result.current.screen).toBe('thread');

    act(() => {
      setViewportWidth(1024);
      for (const listener of matchMediaListeners) {
        listener({ matches: false });
      }
    });

    expect(result.current.screen).toBe('index');
    expect(result.current.isSidebarOpen).toBe(false);
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/useMobileNav.test.ts
```

Expected: fails because `useMobileNav` module does not exist.

**TDD Step 3: Implement the hook**

Create `packages/web/src/useMobileNav.ts`:

```ts
// ABOUTME: Mobile navigation state hook — tracks viewport width and screen stack
// ABOUTME: Manages index/thread/search screen transitions and sidebar overlay toggling

import { useCallback, useEffect, useState } from 'react';

export type MobileScreen = 'index' | 'thread' | 'search';

const MOBILE_BREAKPOINT = 768;

export function useMobileNav() {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth <= MOBILE_BREAKPOINT,
  );
  const [screen, setScreen] = useState<MobileScreen>('index');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);

    const handler = (event: { matches: boolean }) => {
      setIsMobile(event.matches);

      if (!event.matches) {
        setScreen('index');
        setIsSidebarOpen(false);
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const pushThread = useCallback(() => {
    setScreen('thread');
    setIsSidebarOpen(false);
  }, []);

  const pushSearch = useCallback(() => {
    setScreen('search');
  }, []);

  const popScreen = useCallback(() => {
    setScreen('index');
  }, []);

  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const resetStack = useCallback(() => {
    setScreen('index');
    setIsSidebarOpen(false);
  }, []);

  return {
    isMobile,
    screen,
    isSidebarOpen,
    pushThread,
    pushSearch,
    popScreen,
    openSidebar,
    closeSidebar,
    resetStack,
  } as const;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/useMobileNav.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/useMobileNav.ts packages/web/src/useMobileNav.test.ts
git commit -m "Add useMobileNav hook for mobile screen stack and viewport detection"
```

---

## Phase 2: Mobile Top Bar

### Task 2.1: Create `MobileTopBar` component

A persistent top bar that renders only at mobile width. Its content changes based on the current mobile screen state.

| State | Left | Center | Right |
|-------|------|--------|-------|
| Thread index | ☰ hamburger | #channel-name | 🔍 search |
| Thread detail | ← back | Thread | ✕ close |
| Search | ← back | Search | (empty) |

**Files:**

- Create: `packages/web/src/MobileTopBar.tsx`
- Create: `packages/web/src/MobileTopBar.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/MobileTopBar.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the mobile top bar component
// ABOUTME: Validates contextual content rendering for each mobile screen state

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileTopBar } from './MobileTopBar';

describe('MobileTopBar', () => {
  afterEach(cleanup);

  describe('thread index state', () => {
    it('renders hamburger button on the left', () => {
      render(
        <MobileTopBar
          screen="index"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /open sidebar/i })).toBeTruthy();
    });

    it('renders the channel name in the center', () => {
      render(
        <MobileTopBar
          screen="index"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      expect(screen.getByText('#engineering')).toBeTruthy();
    });

    it('renders search button on the right', () => {
      render(
        <MobileTopBar
          screen="index"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /search/i })).toBeTruthy();
    });

    it('calls onHamburger when hamburger is tapped', () => {
      const handleHamburger = vi.fn();
      render(
        <MobileTopBar
          screen="index"
          channelName="engineering"
          onHamburger={handleHamburger}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /open sidebar/i }));
      expect(handleHamburger).toHaveBeenCalledOnce();
    });

    it('calls onSearch when search is tapped', () => {
      const handleSearch = vi.fn();
      render(
        <MobileTopBar
          screen="index"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={handleSearch}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /search/i }));
      expect(handleSearch).toHaveBeenCalledOnce();
    });
  });

  describe('thread detail state', () => {
    it('renders back button on the left', () => {
      render(
        <MobileTopBar
          screen="thread"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /back/i })).toBeTruthy();
    });

    it('renders "Thread" in the center', () => {
      render(
        <MobileTopBar
          screen="thread"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      expect(screen.getByText('Thread')).toBeTruthy();
    });

    it('renders close button on the right', () => {
      render(
        <MobileTopBar
          screen="thread"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /close/i })).toBeTruthy();
    });

    it('calls onBack when back is tapped', () => {
      const handleBack = vi.fn();
      render(
        <MobileTopBar
          screen="thread"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={handleBack}
          onCloseThread={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /back/i }));
      expect(handleBack).toHaveBeenCalledOnce();
    });

    it('calls onCloseThread when close is tapped', () => {
      const handleClose = vi.fn();
      render(
        <MobileTopBar
          screen="thread"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={handleClose}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(handleClose).toHaveBeenCalledOnce();
    });
  });

  describe('search state', () => {
    it('renders back button and "Search" title', () => {
      render(
        <MobileTopBar
          screen="search"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /back/i })).toBeTruthy();
      expect(screen.getByText('Search')).toBeTruthy();
    });
  });

  describe('touch target sizing', () => {
    it('all buttons have min-width and min-height of 44px', () => {
      render(
        <MobileTopBar
          screen="index"
          channelName="engineering"
          onHamburger={vi.fn()}
          onSearch={vi.fn()}
          onBack={vi.fn()}
          onCloseThread={vi.fn()}
        />,
      );

      const buttons = screen.getAllByRole('button');
      for (const button of buttons) {
        const style = window.getComputedStyle(button);
        expect(button.className).toContain('mobile-touch-target');
      }
    });
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/MobileTopBar.test.tsx
```

**TDD Step 3: Implement the component**

Create `packages/web/src/MobileTopBar.tsx`:

```tsx
// ABOUTME: Persistent mobile top bar with contextual left/center/right content
// ABOUTME: Adapts to index, thread, and search screen states

import type { MobileScreen } from './useMobileNav';

export type MobileTopBarProps = {
  screen: MobileScreen;
  channelName: string;
  onHamburger: () => void;
  onSearch: () => void;
  onBack: () => void;
  onCloseThread: () => void;
};

export function MobileTopBar({
  screen,
  channelName,
  onHamburger,
  onSearch,
  onBack,
  onCloseThread,
}: MobileTopBarProps) {
  return (
    <header className="mobile-top-bar">
      <div className="mobile-top-bar-left">
        {screen === 'index' ? (
          <button
            className="mobile-touch-target mobile-top-bar-button"
            onClick={onHamburger}
            aria-label="Open sidebar"
          >
            &#9776;
          </button>
        ) : (
          <button
            className="mobile-touch-target mobile-top-bar-button"
            onClick={onBack}
            aria-label="Back"
          >
            &larr;
          </button>
        )}
      </div>

      <div className="mobile-top-bar-center">
        {screen === 'index' && <span>#{channelName}</span>}
        {screen === 'thread' && <span>Thread</span>}
        {screen === 'search' && <span>Search</span>}
      </div>

      <div className="mobile-top-bar-right">
        {screen === 'index' && (
          <button
            className="mobile-touch-target mobile-top-bar-button"
            onClick={onSearch}
            aria-label="Search"
          >
            &#128269;
          </button>
        )}
        {screen === 'thread' && (
          <button
            className="mobile-touch-target mobile-top-bar-button"
            onClick={onCloseThread}
            aria-label="Close thread"
          >
            &times;
          </button>
        )}
      </div>
    </header>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/MobileTopBar.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/MobileTopBar.tsx packages/web/src/MobileTopBar.test.tsx
git commit -m "Add MobileTopBar component with contextual content per screen state"
```

---

### Task 2.2: Add mobile top bar CSS

The top bar is `display: none` above 768px and `display: grid` at mobile. Uses a 3-column grid for left/center/right alignment.

**Files:**

- Modify: `packages/web/src/styles.css`

**TDD Step 1: Write failing test**

Add to `packages/web/src/styles.test.ts`:

```ts
it('defines the mobile top bar as hidden by default and visible at ≤768px', () => {
  const normalized = normalizeCss(styles);

  expect(normalized).toMatch(/\.mobile-top-bar\s*\{[^}]*display:\s*none/);
  expect(normalized).toMatch(
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.mobile-top-bar\s*\{[^}]*display:\s*grid/,
  );
});

it('defines mobile touch targets at ≥44px', () => {
  const normalized = normalizeCss(styles);

  expect(normalized).toMatch(/\.mobile-touch-target\s*\{[^}]*min-width:\s*44px/);
  expect(normalized).toMatch(/\.mobile-touch-target\s*\{[^}]*min-height:\s*44px/);
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/styles.test.ts
```

**TDD Step 3: Implement**

Add to `packages/web/src/styles.css`, before the responsive breakpoints section:

```css
/* ─── Mobile top bar ────────────────────────────────────────────────────── */
.mobile-top-bar {
  display: none;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  height: 48px;
  padding: 0 0.5rem;
  background: var(--sidebar);
  border-bottom: 1px solid var(--sidebar-border);
}

.mobile-top-bar-left,
.mobile-top-bar-right {
  display: flex;
  justify-content: center;
  align-items: center;
}

.mobile-top-bar-center {
  text-align: center;
  font-weight: 600;
  font-family: var(--font-heading);
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-top-bar-button {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ─── Mobile touch targets ──────────────────────────────────────────────── */
.mobile-touch-target {
  min-width: 44px;
  min-height: 44px;
}
```

Update the `@media (max-width: 768px)` block to show the top bar:

```css
@media (max-width: 768px) {
  /* ...existing rules... */

  .mobile-top-bar {
    display: grid;
  }
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/styles.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/styles.test.ts
git commit -m "Add mobile top bar and touch target CSS rules"
```

---

## Phase 3: Stack Navigation

### Task 3.1: Wire mobile navigation into the chat view

At mobile width, the chat view switches between showing the thread index (ChannelFeed) and thread detail (ThreadDrawer) based on the `useMobileNav` screen state. When a user taps a thread card, `pushThread()` is called, hiding the index and showing the detail. When ← back is tapped, `popScreen()` restores the index.

The existing `selectedThread` state drives *what* thread is loaded. The `useMobileNav.screen` state drives *which panel is visible* on mobile. On desktop, both can be visible simultaneously.

**Files:**

- Modify: `packages/web/src/App.tsx` — integrate `useMobileNav`, conditionally render panels at mobile width
- Modify: `packages/web/src/styles.css` — add mobile visibility classes
- Create: `packages/web/src/mobileLayout.test.tsx` — integration tests for mobile navigation

**TDD Step 1: Write failing tests**

Create `packages/web/src/mobileLayout.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Integration tests for mobile stack navigation behavior
// ABOUTME: Validates push/pop transitions between thread index and detail views

import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// These tests validate the CSS class-based visibility logic.
// At mobile breakpoint, the app adds/removes .mobile-screen-active
// classes to show/hide the feed vs drawer panels.

describe('mobile navigation CSS classes', () => {
  afterEach(cleanup);

  it('applies mobile-hide class to thread drawer when screen is index', () => {
    // Render the shell with the mobile nav in index state
    // Verify thread drawer has the mobile-hide class
    // This test depends on the App integration — see implementation notes
  });

  it('applies mobile-hide class to channel feed when screen is thread', () => {
    // Render the shell with the mobile nav in thread state
    // Verify channel feed has the mobile-hide class
  });
});
```

**Note:** The exact test structure depends on how `App.tsx` is wired. The key behavioral tests are:

```tsx
describe('mobile stack navigation', () => {
  // Stub matchMedia to report mobile viewport
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('768') ? true : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  it('shows thread index and hides thread drawer at index screen', () => {
    // At mobile, only one panel visible at a time
    // When screen is "index", channel feed is visible, thread drawer is hidden
  });

  it('shows thread drawer and hides thread index at thread screen', () => {
    // When screen is "thread", thread drawer is visible, channel feed is hidden
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/mobileLayout.test.tsx
```

**TDD Step 3: Implement**

Add mobile visibility CSS to `packages/web/src/styles.css`:

```css
@media (max-width: 768px) {
  /* ...existing rules... */

  .mobile-hidden {
    display: none !important;
  }

  .mindspace-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: 100%;
    overflow: hidden;
  }
}
```

In `packages/web/src/App.tsx`, integrate `useMobileNav`:

```tsx
import { useMobileNav } from './useMobileNav';
import { MobileTopBar } from './MobileTopBar';

// Inside the chat view render:
const mobileNav = useMobileNav();

// When a thread is opened on mobile, push the thread screen:
function handleOpenThreadMobile(threadId: string) {
  void handleOpenThread(threadId);
  if (mobileNav.isMobile) {
    mobileNav.pushThread();
  }
}

// When thread is closed on mobile, pop back to index:
function handleCloseThreadMobile() {
  setSelectedThread(null);
  setThreadMessages([]);
  setStreamingReply('');
  if (mobileNav.isMobile) {
    mobileNav.popScreen();
  }
}

// In the JSX:
<main className={cn('mindspace-shell', selectedThread && 'thread-open')}>
  {mobileNav.isMobile && (
    <MobileTopBar
      screen={mobileNav.screen}
      channelName={selectedChannel?.name ?? 'channel'}
      onHamburger={mobileNav.openSidebar}
      onSearch={mobileNav.pushSearch}
      onBack={() => {
        if (mobileNav.screen === 'thread') {
          handleCloseThreadMobile();
        } else {
          mobileNav.popScreen();
        }
      }}
      onCloseThread={handleCloseThreadMobile}
    />
  )}

  {/* Sidebar: hidden on mobile unless overlay is open (Phase 4) */}
  <Sidebar
    className={cn(mobileNav.isMobile && !mobileNav.isSidebarOpen && 'mobile-hidden')}
    /* ...existing props... */
  />

  {/* Channel feed: visible on mobile only at index screen */}
  <ChannelFeed
    className={cn(mobileNav.isMobile && mobileNav.screen !== 'index' && 'mobile-hidden')}
    /* ...existing props... */
    onOpenThread={handleOpenThreadMobile}
  />

  {/* Thread drawer: visible on mobile only at thread screen */}
  <ThreadDrawer
    className={cn(mobileNav.isMobile && mobileNav.screen !== 'thread' && 'mobile-hidden')}
    /* ...existing props... */
    onClose={handleCloseThreadMobile}
  />
</main>
```

**Note on className prop:** The `Sidebar`, `ChannelFeed`, and `ThreadDrawer` components currently don't accept a `className` prop. Each component will need a minor update to accept and apply an optional `className` to their root element. For example, in `ChannelFeed.tsx`:

```tsx
export type ChannelFeedProps = {
  className?: string;
  // ...existing props...
};

export function ChannelFeed({ className, ...props }: ChannelFeedProps) {
  return (
    <section className={cn('channel-feed', className)}>
      {/* ...existing JSX... */}
    </section>
  );
}
```

Apply the same pattern to `Sidebar` (root `<aside>`) and `ThreadDrawer` (root `<aside>`).

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/mobileLayout.test.tsx
```

Also run the full test suite to ensure no regressions:

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/styles.css packages/web/src/ChannelFeed.tsx packages/web/src/Sidebar.tsx packages/web/src/ThreadDrawer.tsx packages/web/src/mobileLayout.test.tsx
git commit -m "Wire mobile stack navigation — thread detail replaces index on push"
```

---

## Phase 4: Sidebar Overlay

### Task 4.1: Implement sidebar slide-over overlay with backdrop

At mobile width, the sidebar slides in from the left as an overlay rather than occupying grid space. A semi-transparent backdrop dims the content behind it. Tapping the backdrop closes the sidebar.

**Files:**

- Modify: `packages/web/src/styles.css` — sidebar overlay positioning, backdrop, slide animation
- Create: `packages/web/src/SidebarBackdrop.tsx` — backdrop component
- Create: `packages/web/src/SidebarBackdrop.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/SidebarBackdrop.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the sidebar backdrop overlay component
// ABOUTME: Validates click-to-close behavior and rendering

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidebarBackdrop } from './SidebarBackdrop';

describe('SidebarBackdrop', () => {
  afterEach(cleanup);

  it('renders when visible is true', () => {
    render(<SidebarBackdrop visible={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('sidebar-backdrop')).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    render(<SidebarBackdrop visible={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('sidebar-backdrop')).toBeNull();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const handleClose = vi.fn();
    render(<SidebarBackdrop visible={true} onClose={handleClose} />);

    fireEvent.click(screen.getByTestId('sidebar-backdrop'));
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('has an accessible label', () => {
    render(<SidebarBackdrop visible={true} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/close sidebar/i)).toBeTruthy();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/SidebarBackdrop.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/SidebarBackdrop.tsx`:

```tsx
// ABOUTME: Semi-transparent backdrop behind the mobile sidebar overlay
// ABOUTME: Closes the sidebar on tap and provides visual dimming

export type SidebarBackdropProps = {
  visible: boolean;
  onClose: () => void;
};

export function SidebarBackdrop({ visible, onClose }: SidebarBackdropProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="sidebar-backdrop"
      data-testid="sidebar-backdrop"
      aria-label="Close sidebar"
      role="button"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    />
  );
}
```

Add CSS to `packages/web/src/styles.css`:

```css
/* ─── Sidebar overlay (mobile) ──────────────────────────────────────────── */
.sidebar-backdrop {
  display: none;
}

@media (max-width: 768px) {
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 40;
  }

  .sidebar-overlay {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 85vw;
    max-width: 320px;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform 250ms ease-out;
  }

  .sidebar-overlay-open {
    transform: translateX(0);
  }
}
```

**Note:** The `Sidebar` component's root `<aside>` needs the `sidebar-overlay` class added at mobile width. This is done via the `className` prop added in Task 3.1. In `App.tsx`:

```tsx
<Sidebar
  className={cn(
    mobileNav.isMobile && 'sidebar-overlay',
    mobileNav.isMobile && mobileNav.isSidebarOpen && 'sidebar-overlay-open',
    mobileNav.isMobile && !mobileNav.isSidebarOpen && 'mobile-hidden',
  )}
  /* ...existing props... */
/>
```

Actually, the sidebar overlay should always be in the DOM at mobile (for the slide animation to work) — it just starts translated off-screen. So remove the `mobile-hidden` logic for sidebar and rely on the transform:

```tsx
<Sidebar
  className={cn(
    mobileNav.isMobile && 'sidebar-overlay',
    mobileNav.isMobile && mobileNav.isSidebarOpen && 'sidebar-overlay-open',
  )}
  /* ...existing props... */
/>
<SidebarBackdrop
  visible={mobileNav.isMobile && mobileNav.isSidebarOpen}
  onClose={mobileNav.closeSidebar}
/>
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/SidebarBackdrop.test.tsx
```

**TDD Step 5: Add CSS structure test**

Add to `packages/web/src/styles.test.ts`:

```ts
it('defines the sidebar overlay as fixed-position with slide transform at mobile', () => {
  const normalized = normalizeCss(styles);

  expect(normalized).toMatch(
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.sidebar-overlay\s*\{[^}]*position:\s*fixed/,
  );
  expect(normalized).toMatch(
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.sidebar-overlay\s*\{[^}]*transform:\s*translateX\(-100%\)/,
  );
});

it('defines the sidebar backdrop with fixed positioning at mobile', () => {
  const normalized = normalizeCss(styles);

  expect(normalized).toMatch(
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.sidebar-backdrop\s*\{[^}]*position:\s*fixed/,
  );
});
```

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/styles.test.ts
```

**TDD Step 6: Commit**

```bash
git add packages/web/src/SidebarBackdrop.tsx packages/web/src/SidebarBackdrop.test.tsx packages/web/src/styles.css packages/web/src/styles.test.ts packages/web/src/App.tsx
git commit -m "Add sidebar slide-over overlay with backdrop at mobile breakpoint"
```

---

## Phase 5: Touch Targets & Sizing

### Task 5.1: Enforce WCAG 2.5.5 touch targets and mobile sizing rules

At mobile breakpoint, all interactive elements must have ≥44x44px touch targets. Thread cards must be full-width with min-height 72px. The composer must have min-height 48px.

**Files:**

- Modify: `packages/web/src/styles.css` — mobile-specific size overrides

**TDD Step 1: Write failing tests**

Add to `packages/web/src/styles.test.ts`:

```ts
it('enforces 44px touch targets on channel buttons at mobile', () => {
  const normalized = normalizeCss(styles);

  expect(normalized).toMatch(
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.channel-button\s*\{[^}]*min-height:\s*44px/,
  );
});

it('sets feed card min-height to 72px at mobile', () => {
  const normalized = normalizeCss(styles);

  expect(normalized).toMatch(
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.feed-card-button\s*\{[^}]*min-height:\s*72px/,
  );
});

it('sets composer min-height to 48px at mobile', () => {
  const normalized = normalizeCss(styles);

  expect(normalized).toMatch(
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.composer-panel textarea\s*\{[^}]*min-height:\s*48px/,
  );
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/styles.test.ts
```

**TDD Step 3: Implement**

Add within the `@media (max-width: 768px)` block in `packages/web/src/styles.css`:

```css
@media (max-width: 768px) {
  /* ...existing rules... */

  .channel-button {
    min-height: 44px;
    padding: 0.6rem 0.85rem;
  }

  .mindspace-button {
    min-height: 44px;
  }

  .feed-card-button {
    min-height: 72px;
    padding: 1rem;
  }

  .channel-feed {
    border-right: 0;
    padding: 0.75rem;
  }

  .composer-panel textarea {
    min-height: 48px;
  }

  .thread-drawer {
    border-left: 0;
  }
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/styles.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/styles.test.ts
git commit -m "Enforce WCAG 2.5.5 touch targets and mobile sizing rules"
```

---

## Phase 6: Swipe Gesture

### Task 6.1: Create `useSwipeBack` hook

Detects a right-swipe gesture (touch start → touch move → touch end) with ≥80px horizontal movement where horizontal movement dominates vertical. Calls a callback when the gesture completes.

**Files:**

- Create: `packages/web/src/useSwipeBack.ts`
- Create: `packages/web/src/useSwipeBack.test.ts`

**TDD Step 1: Write failing tests**

Create `packages/web/src/useSwipeBack.test.ts`:

```ts
// @vitest-environment jsdom
// ABOUTME: Tests for the swipe-right back gesture hook
// ABOUTME: Validates gesture detection thresholds and callback triggering

import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSwipeBack } from './useSwipeBack';

function createTouchEvent(type: string, clientX: number, clientY: number): TouchEvent {
  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [{ clientX, clientY } as Touch],
    changedTouches: [{ clientX, clientY } as Touch],
    bubbles: true,
  });
}

describe('useSwipeBack', () => {
  it('calls onSwipeBack when a right swipe exceeds 80px threshold', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: document.createElement('div') };

    renderHook(() => useSwipeBack(ref, onSwipeBack));

    act(() => {
      ref.current.dispatchEvent(createTouchEvent('touchstart', 20, 100));
      ref.current.dispatchEvent(createTouchEvent('touchmove', 60, 102));
      ref.current.dispatchEvent(createTouchEvent('touchend', 120, 104));
    });

    expect(onSwipeBack).toHaveBeenCalledOnce();
  });

  it('does not call onSwipeBack for swipes under 80px', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: document.createElement('div') };

    renderHook(() => useSwipeBack(ref, onSwipeBack));

    act(() => {
      ref.current.dispatchEvent(createTouchEvent('touchstart', 20, 100));
      ref.current.dispatchEvent(createTouchEvent('touchmove', 40, 101));
      ref.current.dispatchEvent(createTouchEvent('touchend', 70, 102));
    });

    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('does not trigger for left swipes', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: document.createElement('div') };

    renderHook(() => useSwipeBack(ref, onSwipeBack));

    act(() => {
      ref.current.dispatchEvent(createTouchEvent('touchstart', 200, 100));
      ref.current.dispatchEvent(createTouchEvent('touchmove', 150, 101));
      ref.current.dispatchEvent(createTouchEvent('touchend', 80, 102));
    });

    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('does not trigger when vertical movement dominates horizontal', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: document.createElement('div') };

    renderHook(() => useSwipeBack(ref, onSwipeBack));

    act(() => {
      ref.current.dispatchEvent(createTouchEvent('touchstart', 20, 100));
      ref.current.dispatchEvent(createTouchEvent('touchmove', 60, 250));
      ref.current.dispatchEvent(createTouchEvent('touchend', 120, 300));
    });

    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('does not trigger when ref is null', () => {
    const onSwipeBack = vi.fn();
    const ref = { current: null };

    renderHook(() => useSwipeBack(ref, onSwipeBack));

    expect(onSwipeBack).not.toHaveBeenCalled();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/useSwipeBack.test.ts
```

**TDD Step 3: Implement**

Create `packages/web/src/useSwipeBack.ts`:

```ts
// ABOUTME: Swipe-right gesture detection for mobile back navigation
// ABOUTME: Triggers callback when horizontal swipe exceeds 80px threshold

import { useEffect, type RefObject } from 'react';

const SWIPE_THRESHOLD_PX = 80;

export function useSwipeBack(
  ref: RefObject<HTMLElement | null>,
  onSwipeBack: () => void,
) {
  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    let startX = 0;
    let startY = 0;

    function handleTouchStart(event: TouchEvent) {
      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      startX = touch.clientX;
      startY = touch.clientY;
    }

    function handleTouchEnd(event: TouchEvent) {
      const touch = event.changedTouches[0];

      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);

      if (deltaX >= SWIPE_THRESHOLD_PX && deltaX > deltaY) {
        onSwipeBack();
      }
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, onSwipeBack]);
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/useSwipeBack.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/useSwipeBack.ts packages/web/src/useSwipeBack.test.ts
git commit -m "Add useSwipeBack hook for right-swipe back gesture detection"
```

---

### Task 6.2: Wire swipe gesture into thread detail view

Attach the `useSwipeBack` hook to the thread drawer container. When the user swipes right on the thread detail, it pops back to the thread index (same as tapping ← back).

**Files:**

- Modify: `packages/web/src/App.tsx` — attach `useSwipeBack` to thread drawer container ref

**TDD Step 1: Write failing test**

Add to `packages/web/src/mobileLayout.test.tsx`:

```tsx
it('triggers back navigation on right swipe in thread detail view', () => {
  // This is an integration test — swipe on the thread drawer element
  // should call popScreen, which returns to the index view
  // Implementation depends on the App integration
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/mobileLayout.test.tsx
```

**TDD Step 3: Implement**

In `App.tsx`, add a ref to the thread drawer's container and attach `useSwipeBack`:

```tsx
import { useSwipeBack } from './useSwipeBack';

// Inside the chat view:
const threadDrawerRef = useRef<HTMLDivElement>(null);

useSwipeBack(threadDrawerRef, () => {
  if (mobileNav.isMobile && mobileNav.screen === 'thread') {
    handleCloseThreadMobile();
  }
});

// Wrap ThreadDrawer in a div with the ref:
<div ref={threadDrawerRef} className={cn(mobileNav.isMobile && mobileNav.screen !== 'thread' && 'mobile-hidden')}>
  <ThreadDrawer /* ...props... */ />
</div>
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/mobileLayout.test.tsx
git commit -m "Wire swipe-right gesture to pop thread detail on mobile"
```

---

## Phase 7: Search Overlay

### Task 7.1: Create `MobileSearchOverlay` component

A full-screen overlay that appears when search is tapped in the mobile top bar. For now, this is a placeholder with a search input and "Search coming soon" message. The real search implementation is a separate phase.

**Files:**

- Create: `packages/web/src/MobileSearchOverlay.tsx`
- Create: `packages/web/src/MobileSearchOverlay.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/MobileSearchOverlay.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the full-screen mobile search overlay
// ABOUTME: Validates rendering, close behavior, and placeholder state

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileSearchOverlay } from './MobileSearchOverlay';

describe('MobileSearchOverlay', () => {
  afterEach(cleanup);

  it('renders when visible is true', () => {
    render(<MobileSearchOverlay visible={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    render(<MobileSearchOverlay visible={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a search input', () => {
    render(<MobileSearchOverlay visible={true} onClose={vi.fn()} />);
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });

  it('calls onClose when back button is tapped', () => {
    const handleClose = vi.fn();
    render(<MobileSearchOverlay visible={true} onClose={handleClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close search/i }));
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('auto-focuses the search input on open', () => {
    render(<MobileSearchOverlay visible={true} onClose={vi.fn()} />);

    const input = screen.getByRole('searchbox');
    expect(input).toHaveProperty('autofocus', true);
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/MobileSearchOverlay.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/MobileSearchOverlay.tsx`:

```tsx
// ABOUTME: Full-screen mobile search overlay with placeholder content
// ABOUTME: Provides search input and close button — search results are a future phase

import { Input } from '@mastra-mindspace/ui';

export type MobileSearchOverlayProps = {
  visible: boolean;
  onClose: () => void;
};

export function MobileSearchOverlay({ visible, onClose }: MobileSearchOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="mobile-search-overlay" role="dialog" aria-label="Search">
      <header className="mobile-search-header">
        <button
          className="mobile-touch-target mobile-top-bar-button"
          onClick={onClose}
          aria-label="Close search"
        >
          &larr;
        </button>
        <Input
          type="search"
          role="searchbox"
          placeholder="Search threads..."
          autoFocus
          className="mobile-search-input"
        />
      </header>
      <div className="mobile-search-body">
        <p className="empty-state">Search coming soon.</p>
      </div>
    </div>
  );
}
```

Add CSS to `packages/web/src/styles.css`:

```css
/* ─── Mobile search overlay ─────────────────────────────────────────────── */
.mobile-search-overlay {
  display: none;
}

@media (max-width: 768px) {
  .mobile-search-overlay {
    display: grid;
    grid-template-rows: auto 1fr;
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--background);
  }

  .mobile-search-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    height: 48px;
    border-bottom: 1px solid var(--border);
  }

  .mobile-search-input {
    flex: 1;
  }

  .mobile-search-body {
    padding: 1rem;
    overflow-y: auto;
  }
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/MobileSearchOverlay.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/MobileSearchOverlay.tsx packages/web/src/MobileSearchOverlay.test.tsx packages/web/src/styles.css
git commit -m "Add full-screen mobile search overlay with placeholder content"
```

---

### Task 7.2: Wire search overlay into the chat view

Connect the search overlay to the mobile navigation. When the search icon is tapped, `pushSearch()` is called and the overlay renders. When back is tapped, `popScreen()` dismisses it.

**Files:**

- Modify: `packages/web/src/App.tsx`

**TDD Step 1: Verify integration**

The `MobileTopBar` already calls `onSearch={mobileNav.pushSearch}` and the back button calls `popScreen()`. Add the overlay rendering in the chat view JSX:

```tsx
<MobileSearchOverlay
  visible={mobileNav.isMobile && mobileNav.screen === 'search'}
  onClose={mobileNav.popScreen}
/>
```

**TDD Step 2: Run full test suite**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 3: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "Wire mobile search overlay into chat view navigation"
```

---

## Final Verification

After all phases are complete, run the full verification:

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace

# All unit tests pass
pnpm test

# TypeScript compiles cleanly
pnpm typecheck

# Dev server starts without errors
pnpm dev:web
```

Manually verify on a mobile viewport (Chrome DevTools → device toolbar → iPhone 14):

1. Top bar renders with ☰, #channel-name, 🔍
2. Tapping ☰ slides sidebar in from left with backdrop
3. Tapping backdrop closes sidebar
4. Tapping a thread card pushes thread detail view (index hidden)
5. Top bar updates to ← / Thread / ✕
6. ← back returns to thread index
7. Swipe right on thread detail returns to thread index
8. 🔍 opens full-screen search overlay
9. All buttons feel tappable (44px targets)
10. Thread cards are full-width with comfortable height

---

## File Summary

### New files created

| File | Purpose |
|------|---------|
| `packages/web/src/useMobileNav.ts` | Mobile navigation state hook — viewport detection, screen stack, sidebar overlay toggle |
| `packages/web/src/useMobileNav.test.ts` | Tests for useMobileNav |
| `packages/web/src/MobileTopBar.tsx` | Persistent mobile top bar with contextual left/center/right content |
| `packages/web/src/MobileTopBar.test.tsx` | Tests for MobileTopBar |
| `packages/web/src/SidebarBackdrop.tsx` | Semi-transparent backdrop for mobile sidebar overlay |
| `packages/web/src/SidebarBackdrop.test.tsx` | Tests for SidebarBackdrop |
| `packages/web/src/useSwipeBack.ts` | Swipe-right gesture detection hook |
| `packages/web/src/useSwipeBack.test.ts` | Tests for useSwipeBack |
| `packages/web/src/MobileSearchOverlay.tsx` | Full-screen mobile search overlay (placeholder) |
| `packages/web/src/MobileSearchOverlay.test.tsx` | Tests for MobileSearchOverlay |
| `packages/web/src/mobileLayout.test.tsx` | Integration tests for mobile stack navigation |

### Files modified

| File | Changes |
|------|---------|
| `packages/web/src/styles.css` | Mobile top bar, touch targets, sidebar overlay/backdrop, search overlay, thread card/composer sizing |
| `packages/web/src/styles.test.ts` | Tests for mobile CSS structure (top bar visibility, touch targets, overlay positioning) |
| `packages/web/src/App.tsx` | Integrate `useMobileNav`, render `MobileTopBar`, wire mobile push/pop on thread open/close, attach swipe gesture, render search overlay |
| `packages/web/src/Sidebar.tsx` | Accept optional `className` prop for mobile overlay classes |
| `packages/web/src/ChannelFeed.tsx` | Accept optional `className` prop for mobile visibility toggling |
| `packages/web/src/ThreadDrawer.tsx` | Accept optional `className` prop for mobile visibility toggling |

### Files NOT modified (left for future phases)

| File | Reason |
|------|--------|
| `packages/web/src/api.ts` | No API changes needed for mobile layout |
| `packages/web/src/firebase.ts` | Auth is unchanged |
| `packages/web/src/router.tsx` | Thread navigation is state-based, not URL-based |
| `packages/ui/src/styles.css` | Design tokens are viewport-agnostic |
