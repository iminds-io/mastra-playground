# ABOUTME: Implementation plan for Phase 11h — Error & Offline States for Mastra Mindspace
# ABOUTME: Covers four-layer error handling: connection banner, inline errors, failed messages, and streaming interruption

# Phase 11h: Error & Offline States Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: Phase 11a (foundation — layout shell, routing), Phase 11g (SSE streaming infrastructure for Layer 4)

**Goal:** Implement a four-layer error handling system: (1) connection status banner for network state, (2) scoped inline action errors with auto-dismiss, (3) failed optimistic messages with retry/discard, (4) streaming interruption detection with partial text preservation and retry.

**Architecture:** Bottom-up. Start with design tokens (warning/success colors), then build each layer as an independent component with its own hook/state, then integrate into App.tsx. Each layer is testable in isolation.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4 (via design tokens), Vitest 4 + @testing-library/react, `@mastra-mindspace/ui` design system (Button, Card, Badge, cn()), SSE stream from `api.ts`.

---

## Current State Summary

| Area | What exists | File |
|------|-------------|------|
| **Error state management** | `errors` Map keyed by scope string. `setError(scope, message)` with 5-second auto-dismiss timeout. `clearError(scope)` clears on retry. `errorTimeoutsRef` tracks timeout IDs. | `packages/web/src/App.tsx` lines 102-180 |
| **InlineError component** | Simple `<p role="alert">` with inline styles. Red-toned OKLCH colors. Shows when `message` is truthy. No auto-dismiss, no retry callback. | `packages/web/src/InlineError.tsx` |
| **Error scopes in use** | `'admin'`, `'channels'`, `'feed'`, `'thread'` — each passed to the component that owns that zone. | `packages/web/src/App.tsx` lines 570-610 |
| **Optimistic messages** | `createOptimisticMessage()` generates client-side `ThreadMessage` with temporary ID (`user-{timestamp}-{random}`). Added to `threadMessages` before stream starts. No failure marking. | `packages/web/src/App.tsx` lines 83-90, 548 |
| **Streaming** | `streamThreadReply()` reads SSE via `ReadableStream`. Handles `token`, `message_saved`, `thread_updated`, `done` events. No error event. No interruption detection. `streamingReply` state cleared on `done`. | `packages/web/src/api.ts` lines 237-301, `App.tsx` lines 461-533 |
| **Connection monitoring** | None. No heartbeat, no online/offline detection, no reconnect logic. | — |
| **Design tokens** | `--destructive` (red) exists. No `--warning` (yellow) or `--success` (green) tokens. | `packages/ui/src/styles.css` lines 57-58 |

---

## Success Criteria

- [ ] `--warning` and `--success` semantic color tokens exist in the design system
- [ ] `ConnectionBanner` shows four states: connected (invisible), reconnecting (yellow), offline (red), reconnected (green auto-dismiss)
- [ ] `useConnectionStatus` hook detects online/offline via `navigator.onLine` + `online`/`offline` events
- [ ] Reconnecting state triggers after first failed request; offline after 3 consecutive failures
- [ ] Reconnected banner auto-dismisses after 3 seconds
- [ ] Inputs are disabled during reconnecting state; UI is read-only during offline state
- [ ] `InlineError` updated: 8-second auto-dismiss, `role="alert"`, uses design tokens instead of inline styles
- [ ] Error messages are human-readable (no raw HTTP status codes)
- [ ] Failed optimistic messages show muted/faded with warning icon, "Failed to send. Retry · Discard" actions
- [ ] Retry re-sends the failed message; Discard removes it from the thread
- [ ] Streaming interruption preserves partial text with "⚠ Response interrupted. Retry" link
- [ ] Retry on interrupted stream re-invokes `runThreadStream` for a fresh response
- [ ] All new components have ABOUTME comments and comprehensive tests
- [ ] `pnpm typecheck` passes across all packages
- [ ] All existing tests continue to pass

---

## Recommended Sequencing

Execute these phases in order. Each phase is independently shippable.

1. **Phase 1: Design Tokens** — Add `--warning` and `--success` color tokens.
2. **Phase 2: Inline Error Upgrade** — Upgrade `InlineError` to use tokens, 8-second dismiss, human-readable messages.
3. **Phase 3: Connection Status** — `useConnectionStatus` hook + `ConnectionBanner` component.
4. **Phase 4: Failed Messages** — Mark failed optimistic messages with retry/discard.
5. **Phase 5: Streaming Interruption** — Detect SSE breaks, preserve partial text, retry link.
6. **Phase 6: Integration** — Wire all layers into App.tsx and child components.

---

## Phase 1: Design Tokens

### Task 1.1: Add warning and success semantic color tokens

The design system currently has `--destructive` (red) but no warning (yellow) or success (green) tokens. These are needed for the connection banner states.

**Files:**

- Edit: `packages/ui/src/styles.css`

**TDD Step 1: Write failing test**

Add to existing `packages/web/src/styles.test.ts` (or create a token test if needed):

```ts
// Test that warning and success tokens resolve to valid values
describe('design tokens', () => {
  it('defines --warning token', () => {
    const root = document.documentElement;
    const value = getComputedStyle(root).getPropertyValue('--warning');
    expect(value).toBeTruthy();
  });

  it('defines --success token', () => {
    const root = document.documentElement;
    const value = getComputedStyle(root).getPropertyValue('--success');
    expect(value).toBeTruthy();
  });
});
```

**TDD Step 2: Run test, confirm failure**

**TDD Step 3: Implement**

Edit `packages/ui/src/styles.css`:

In the `@theme inline` block, add:
```css
--color-warning:              var(--warning);
--color-warning-foreground:   var(--warning-foreground);
--color-success:              var(--success);
--color-success-foreground:   var(--success-foreground);
```

In the `:root` block (after `--destructive-foreground`), add:
```css
--warning:                oklch(0.75 0.15 85);
--warning-foreground:     oklch(0.15 0.02 85);
--success:                oklch(0.65 0.18 145);
--success-foreground:     oklch(0.15 0.02 145);
```

These follow the existing OKLCH pattern. Warning is yellow-toned (hue 85), success is green-toned (hue 145).

**TDD Step 4: Run test, confirm pass**

---

## Phase 2: Inline Error Upgrade

### Task 2.1: Upgrade InlineError to use design tokens and 8-second auto-dismiss

The current `InlineError` uses inline styles with hardcoded OKLCH values and has no auto-dismiss. The design doc specifies 8-second auto-dismiss and design-token-based styling.

**Files:**

- Edit: `packages/web/src/InlineError.tsx`
- Create: `packages/web/src/InlineError.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/InlineError.test.tsx`:

```ts
// @vitest-environment jsdom
// ABOUTME: Tests for the InlineError component
// ABOUTME: Validates rendering, auto-dismiss, accessibility, and clear-on-retry behavior

import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InlineError } from './InlineError';

describe('InlineError', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders nothing when message is undefined', () => {
    const { container } = render(<InlineError message={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the error message with role="alert"', () => {
    render(<InlineError message="Couldn't create thread" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toBe("Couldn't create thread");
  });

  it('auto-dismisses after 8 seconds', () => {
    const onDismiss = vi.fn();
    render(<InlineError message="Something failed" onDismiss={onDismiss} />);
    expect(screen.getByRole('alert')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(8000); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not auto-dismiss if no onDismiss callback is provided', () => {
    render(<InlineError message="Something failed" />);
    act(() => { vi.advanceTimersByTime(10000); });
    // Component still renders — no crash, no removal
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('clears previous timer when message changes', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<InlineError message="Error 1" onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(5000); });
    rerender(<InlineError message="Error 2" onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(5000); });
    // 5s into the second message — should not have dismissed yet (needs 8s)
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

**TDD Step 2: Run test, confirm failure**

**TDD Step 3: Implement**

Edit `packages/web/src/InlineError.tsx`:

```tsx
// ABOUTME: Scoped inline error banner for action-level errors
// ABOUTME: Auto-dismisses after 8 seconds, uses design tokens, supports role="alert"

import { useEffect, useRef } from 'react';

export type InlineErrorProps = {
  message: string | undefined;
  onDismiss?: () => void;
};

export function InlineError({ message, onDismiss }: InlineErrorProps) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (message && onDismiss) {
      timerRef.current = window.setTimeout(() => {
        onDismiss();
        timerRef.current = null;
      }, 8000);
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <p
      role="alert"
      className="inline-error"
    >
      {message}
    </p>
  );
}
```

**TDD Step 4: Run test, confirm pass**

### Task 2.2: Add InlineError CSS class using design tokens

Replace the inline styles with a CSS class that uses the existing `--destructive` token.

**Files:**

- Edit: `packages/web/src/styles.css`

Add to styles.css (after the existing error-related or thread styles):

```css
/* ─── Inline errors ─────────────────────────────────────────────────────── */
.inline-error {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  color: oklch(from var(--destructive) calc(l + 0.3) c h);
  background: oklch(from var(--destructive) l c h / 0.12);
  border-radius: var(--radius-sm);
  border: 1px solid oklch(from var(--destructive) l c h / 0.25);
}
```

### Task 2.3: Update App.tsx error timeout from 5 seconds to 8 seconds

The current `setError()` in App.tsx auto-dismisses after 5 seconds. The design doc specifies 8 seconds. Update the timeout value.

**Files:**

- Edit: `packages/web/src/App.tsx` — line 156, change `5000` to `8000`

### Task 2.4: Add human-readable error message mapping

Create a utility that converts raw API errors into human-readable messages. The design doc specifies messages like "Couldn't create thread" instead of "Error: [500]".

**Files:**

- Create: `packages/web/src/errorMessages.ts`
- Create: `packages/web/src/errorMessages.test.ts`

**TDD Step 1: Write failing tests**

Create `packages/web/src/errorMessages.test.ts`:

```ts
// ABOUTME: Tests for the error message humanization utility
// ABOUTME: Validates that raw API errors are converted to user-friendly text

import { describe, expect, it } from 'vitest';

import { humanizeError } from './errorMessages';

describe('humanizeError', () => {
  it('returns a human-readable message for known error patterns', () => {
    expect(humanizeError('[500] Internal Server Error', 'feed')).toBe(
      "Couldn't load feed. Please try again.",
    );
  });

  it('maps scope-specific messages', () => {
    expect(humanizeError('[500] something', 'create-post')).toBe(
      "Couldn't create post. Please try again.",
    );
    expect(humanizeError('[500] something', 'thread')).toBe(
      "Couldn't load thread. Please try again.",
    );
    expect(humanizeError('[500] something', 'reply')).toBe(
      "Couldn't send reply. Please try again.",
    );
    expect(humanizeError('[500] something', 'channels')).toBe(
      "Couldn't load channels. Please try again.",
    );
    expect(humanizeError('[500] something', 'create-channel')).toBe(
      "Couldn't create channel. Please try again.",
    );
  });

  it('preserves 403/401 messages as permission errors', () => {
    expect(humanizeError('[403] Forbidden', 'feed')).toBe(
      "You don't have permission to do that.",
    );
    expect(humanizeError('[401] Unauthorized', 'feed')).toBe(
      'Your session has expired. Please sign in again.',
    );
  });

  it('falls back to a generic message for unrecognized errors', () => {
    expect(humanizeError('NetworkError: Failed to fetch', 'unknown-scope')).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
```

**TDD Step 2: Run test, confirm failure**

**TDD Step 3: Implement**

Create `packages/web/src/errorMessages.ts`:

```ts
// ABOUTME: Converts raw API error strings into human-readable messages
// ABOUTME: Maps error scopes (feed, thread, reply, etc.) to contextual phrasing

const SCOPE_LABELS: Record<string, string> = {
  feed: 'load feed',
  'create-post': 'create post',
  thread: 'load thread',
  reply: 'send reply',
  channels: 'load channels',
  'create-channel': 'create channel',
  admin: 'complete that action',
  me: 'load profile',
  bootstrap: 'create project',
  projects: 'load projects',
};

export function humanizeError(raw: string, scope: string): string {
  if (raw.startsWith('[401]')) {
    return 'Your session has expired. Please sign in again.';
  }

  if (raw.startsWith('[403]')) {
    return "You don't have permission to do that.";
  }

  const label = SCOPE_LABELS[scope];

  if (label) {
    return `Couldn't ${label}. Please try again.`;
  }

  return 'Something went wrong. Please try again.';
}
```

**TDD Step 4: Run test, confirm pass**

### Task 2.5: Wire humanizeError into App.tsx setError calls

Update the `setError` function in `App.tsx` to pipe error strings through `humanizeError` before storing them.

**Files:**

- Edit: `packages/web/src/App.tsx`

Change the `setError` function signature to accept a scope parameter (it already does), and wrap the message:

```ts
import { humanizeError } from './errorMessages';

// In setError():
function setError(scope: string, rawMessage: string) {
  const message = humanizeError(rawMessage, scope);
  // ... rest of existing logic, using `message` instead of raw
}
```

Note: The existing catch blocks already pass the scope and `String(error)` — e.g., `setError('feed', String(error))`. No changes needed at call sites.

---

## Phase 3: Connection Status

### Task 3.1: Create useConnectionStatus hook

Monitors browser online/offline state. Tracks consecutive failures to determine reconnecting vs offline vs connected.

**Files:**

- Create: `packages/web/src/useConnectionStatus.ts`
- Create: `packages/web/src/useConnectionStatus.test.ts`

**TDD Step 1: Write failing tests**

Create `packages/web/src/useConnectionStatus.test.ts`:

```ts
// @vitest-environment jsdom
// ABOUTME: Tests for the useConnectionStatus hook
// ABOUTME: Validates state transitions: connected → reconnecting → offline → reconnected

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStatus } from './useConnectionStatus';

describe('useConnectionStatus', () => {
  let onlineListeners: Array<() => void>;
  let offlineListeners: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    onlineListeners = [];
    offlineListeners = [];

    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'online') onlineListeners.push(handler as () => void);
      if (event === 'offline') offlineListeners.push(handler as () => void);
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts as "connected" when browser is online', () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('connected');
  });

  it('transitions to "reconnecting" when browser goes offline', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      offlineListeners.forEach((fn) => fn());
    });

    expect(result.current.status).toBe('reconnecting');
  });

  it('transitions to "reconnecting" after reportFailure is called once', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => { result.current.reportFailure(); });
    expect(result.current.status).toBe('reconnecting');
  });

  it('transitions to "offline" after 3 consecutive failures', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => { result.current.reportFailure(); });
    act(() => { result.current.reportFailure(); });
    act(() => { result.current.reportFailure(); });

    expect(result.current.status).toBe('offline');
  });

  it('transitions to "reconnected" when coming back online after being offline', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      offlineListeners.forEach((fn) => fn());
    });

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      onlineListeners.forEach((fn) => fn());
    });

    expect(result.current.status).toBe('reconnected');
  });

  it('auto-transitions from "reconnected" to "connected" after 3 seconds', () => {
    const { result } = renderHook(() => useConnectionStatus());

    // Go offline then back online
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      offlineListeners.forEach((fn) => fn());
    });
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      onlineListeners.forEach((fn) => fn());
    });

    expect(result.current.status).toBe('reconnected');

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.status).toBe('connected');
  });

  it('resets failure count on reportSuccess', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => { result.current.reportFailure(); });
    act(() => { result.current.reportFailure(); });
    expect(result.current.status).toBe('reconnecting');

    act(() => { result.current.reportSuccess(); });
    expect(result.current.status).toBe('connected');
  });
});
```

**TDD Step 2: Run test, confirm failure**

**TDD Step 3: Implement**

Create `packages/web/src/useConnectionStatus.ts`:

```ts
// ABOUTME: Tracks network connection status for the connection banner
// ABOUTME: Detects online/offline events and consecutive API failures to determine state

import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline' | 'reconnected';

const MAX_FAILURES_BEFORE_OFFLINE = 3;
const RECONNECTED_DISMISS_MS = 3000;

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const failureCountRef = useRef(0);
  const previouslyDisconnectedRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function handleOffline() {
      previouslyDisconnectedRef.current = true;
      setStatus('reconnecting');
    }

    function handleOnline() {
      if (previouslyDisconnectedRef.current) {
        failureCountRef.current = 0;
        setStatus('reconnected');

        if (dismissTimerRef.current !== null) {
          window.clearTimeout(dismissTimerRef.current);
        }

        dismissTimerRef.current = window.setTimeout(() => {
          setStatus('connected');
          previouslyDisconnectedRef.current = false;
          dismissTimerRef.current = null;
        }, RECONNECTED_DISMISS_MS);
      }
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const reportFailure = useCallback(() => {
    failureCountRef.current += 1;
    previouslyDisconnectedRef.current = true;

    if (failureCountRef.current >= MAX_FAILURES_BEFORE_OFFLINE) {
      setStatus('offline');
    } else {
      setStatus('reconnecting');
    }
  }, []);

  const reportSuccess = useCallback(() => {
    if (failureCountRef.current > 0 || previouslyDisconnectedRef.current) {
      failureCountRef.current = 0;
      previouslyDisconnectedRef.current = false;
      setStatus('connected');
    }
  }, []);

  return { status, reportFailure, reportSuccess };
}
```

**TDD Step 4: Run test, confirm pass**

### Task 3.2: Create ConnectionBanner component

Renders the thin status bar at the top of the main content area.

**Files:**

- Create: `packages/web/src/ConnectionBanner.tsx`
- Create: `packages/web/src/ConnectionBanner.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/ConnectionBanner.test.tsx`:

```ts
// @vitest-environment jsdom
// ABOUTME: Tests for the ConnectionBanner component
// ABOUTME: Validates rendering for each connection state and accessibility

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectionBanner } from './ConnectionBanner';

describe('ConnectionBanner', () => {
  afterEach(cleanup);

  it('renders nothing when status is "connected"', () => {
    const { container } = render(<ConnectionBanner status="connected" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a warning banner when status is "reconnecting"', () => {
    render(<ConnectionBanner status="reconnecting" />);
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('Connection lost');
    expect(banner.textContent).toContain('Reconnecting');
  });

  it('renders a destructive banner when status is "offline"', () => {
    render(<ConnectionBanner status="offline" onRetry={() => {}} />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('Unable to connect');
  });

  it('renders a Retry button when offline', () => {
    const onRetry = vi.fn();
    render(<ConnectionBanner status="offline" onRetry={onRetry} />);
    const button = screen.getByRole('button', { name: /retry/i });
    button.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders a success banner when status is "reconnected"', () => {
    render(<ConnectionBanner status="reconnected" />);
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('Connected');
  });
});
```

**TDD Step 2: Run test, confirm failure**

**TDD Step 3: Implement**

Create `packages/web/src/ConnectionBanner.tsx`:

```tsx
// ABOUTME: Thin connection status banner at the top of the main content area
// ABOUTME: Shows reconnecting (yellow), offline (red), or reconnected (green) states

import { Button } from '@mastra-mindspace/ui';

import type { ConnectionStatus } from './useConnectionStatus';

export type ConnectionBannerProps = {
  status: ConnectionStatus;
  onRetry?: () => void;
};

export function ConnectionBanner({ status, onRetry }: ConnectionBannerProps) {
  if (status === 'connected') {
    return null;
  }

  if (status === 'reconnecting') {
    return (
      <div role="status" className="connection-banner connection-banner-warning">
        ⚠ Connection lost. Reconnecting...
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div role="alert" className="connection-banner connection-banner-destructive">
        <span>✕ Unable to connect.</span>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  // reconnected
  return (
    <div role="status" className="connection-banner connection-banner-success">
      ✓ Connected
    </div>
  );
}
```

**TDD Step 4: Run test, confirm pass**

### Task 3.3: Add ConnectionBanner CSS styles

**Files:**

- Edit: `packages/web/src/styles.css`

Add after the inline error styles:

```css
/* ─── Connection banner ─────────────────────────────────────────────────── */
.connection-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.35rem 1rem;
  font-size: 0.8rem;
  font-weight: 500;
  text-align: center;
}

.connection-banner-warning {
  background: oklch(from var(--warning) l c h / 0.15);
  color: var(--warning);
  border-bottom: 1px solid oklch(from var(--warning) l c h / 0.25);
}

.connection-banner-destructive {
  background: oklch(from var(--destructive) l c h / 0.15);
  color: oklch(from var(--destructive) calc(l + 0.25) c h);
  border-bottom: 1px solid oklch(from var(--destructive) l c h / 0.25);
}

.connection-banner-success {
  background: oklch(from var(--success) l c h / 0.15);
  color: var(--success);
  border-bottom: 1px solid oklch(from var(--success) l c h / 0.25);
}
```

---

## Phase 4: Failed Messages

### Task 4.1: Extend ThreadMessage type with failure state

Add optional fields to track whether an optimistic message failed to send, and the original message text needed for retry.

**Files:**

- Edit: `packages/web/src/api.ts` — extend `ThreadMessage` type

Add to the `ThreadMessage` type:

```ts
export type ThreadMessage = {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  sendFailed?: boolean;
};
```

### Task 4.2: Create FailedMessageActions component

Renders the "Failed to send. Retry · Discard" UI inside a thread message card.

**Files:**

- Create: `packages/web/src/FailedMessageActions.tsx`
- Create: `packages/web/src/FailedMessageActions.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/FailedMessageActions.test.tsx`:

```ts
// @vitest-environment jsdom
// ABOUTME: Tests for the FailedMessageActions component
// ABOUTME: Validates retry and discard callbacks and accessibility

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FailedMessageActions } from './FailedMessageActions';

describe('FailedMessageActions', () => {
  afterEach(cleanup);

  it('renders warning text and action links', () => {
    render(<FailedMessageActions onRetry={() => {}} onDiscard={() => {}} />);
    expect(screen.getByText(/Failed to send/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /discard/i })).toBeTruthy();
  });

  it('calls onRetry when Retry is clicked', () => {
    const onRetry = vi.fn();
    render(<FailedMessageActions onRetry={onRetry} onDiscard={() => {}} />);
    screen.getByRole('button', { name: /retry/i }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('calls onDiscard when Discard is clicked', () => {
    const onDiscard = vi.fn();
    render(<FailedMessageActions onRetry={() => {}} onDiscard={onDiscard} />);
    screen.getByRole('button', { name: /discard/i }).click();
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
```

**TDD Step 2: Run test, confirm failure**

**TDD Step 3: Implement**

Create `packages/web/src/FailedMessageActions.tsx`:

```tsx
// ABOUTME: Retry and discard actions for failed optimistic messages in a thread
// ABOUTME: Rendered below the message text when sendFailed is true

export type FailedMessageActionsProps = {
  onRetry: () => void;
  onDiscard: () => void;
};

export function FailedMessageActions({ onRetry, onDiscard }: FailedMessageActionsProps) {
  return (
    <p className="failed-message-actions" role="alert">
      <span>⚠ Failed to send.</span>
      {' '}
      <button className="failed-message-link" onClick={onRetry} aria-label="Retry sending">
        Retry
      </button>
      {' · '}
      <button className="failed-message-link" onClick={onDiscard} aria-label="Discard message">
        Discard
      </button>
    </p>
  );
}
```

**TDD Step 4: Run test, confirm pass**

### Task 4.3: Add failed message CSS styles

**Files:**

- Edit: `packages/web/src/styles.css`

```css
/* ─── Failed message ────────────────────────────────────────────────────── */
.thread-message-failed {
  opacity: 0.55;
}

.failed-message-actions {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: var(--warning);
}

.failed-message-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--primary);
  font-size: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.failed-message-link:hover {
  color: var(--accent);
}
```

### Task 4.4: Mark optimistic messages as failed on stream error

Update `App.tsx` to set `sendFailed: true` on the optimistic user message when `runThreadStream` fails.

**Files:**

- Edit: `packages/web/src/App.tsx`

In `handleReplyInThread()` (around line 535-561), the optimistic message is added at line 548. Currently, stream errors are caught in `runThreadStream` and set a thread error. The change:

1. Track the optimistic message ID so we can find it later
2. When `runThreadStream` throws, mark the optimistic message as `sendFailed: true`

```ts
async function handleReplyInThread() {
  // ... existing guard checks ...

  const optimisticId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const optimisticMsg: ThreadMessage = {
    id: optimisticId,
    role: 'user',
    text: message,
    createdAt: new Date().toISOString(),
  };

  startLoading('reply');
  clearError('thread');
  setThreadMessages((current) => [...current, optimisticMsg]);
  setReplyMessage('');
  setStreamingReply('');

  try {
    await runThreadStream({
      threadId: selectedThread.id,
      channelId: selectedChannelId,
      message,
    });
  } catch {
    setThreadMessages((current) =>
      current.map((msg) =>
        msg.id === optimisticId ? { ...msg, sendFailed: true } : msg,
      ),
    );
  } finally {
    stopLoading('reply');
  }
}
```

### Task 4.5: Add retry and discard handlers to App.tsx

**Files:**

- Edit: `packages/web/src/App.tsx`

Add two new handler functions:

```ts
function handleRetryMessage(messageId: string) {
  const failedMsg = threadMessages.find((msg) => msg.id === messageId);
  if (!failedMsg || !selectedThread || !selectedChannelId || route.name !== 'chat') {
    return;
  }

  // Remove the failed message, re-send
  setThreadMessages((current) => current.filter((msg) => msg.id !== messageId));
  // Re-trigger reply with the same text
  setReplyMessage(failedMsg.text);
  // Slight delay to let state settle, then submit
  void handleReplyInThread();
}

function handleDiscardMessage(messageId: string) {
  setThreadMessages((current) => current.filter((msg) => msg.id !== messageId));
}
```

Pass `onRetryMessage` and `onDiscardMessage` to `ThreadDrawer`.

### Task 4.6: Update ThreadDrawer to render failed message state

**Files:**

- Edit: `packages/web/src/ThreadDrawer.tsx`

Add props:

```ts
onRetryMessage?: (messageId: string) => void;
onDiscardMessage?: (messageId: string) => void;
```

In the message rendering loop, conditionally add `thread-message-failed` class and render `FailedMessageActions`:

```tsx
import { FailedMessageActions } from './FailedMessageActions';

// In the map:
<Card
  key={entry.id}
  className={cn(
    'p-4',
    entry.role === 'user' ? 'bg-muted/40 border-border/50' : 'bg-primary/10 border-primary/20',
    entry.sendFailed && 'thread-message-failed',
  )}
>
  <p className="thread-message-role">{entry.role}</p>
  <p style={{ margin: 0 }}>{entry.text}</p>
  {entry.sendFailed ? (
    <FailedMessageActions
      onRetry={() => onRetryMessage?.(entry.id)}
      onDiscard={() => onDiscardMessage?.(entry.id)}
    />
  ) : null}
</Card>
```

---

## Phase 5: Streaming Interruption

### Task 5.1: Add interruption detection to streamThreadReply

When the SSE stream breaks mid-response (reader throws, connection drops), the current code throws an error that gets caught in `runThreadStream`. Instead, we need to:
1. Detect the interruption
2. Signal it distinctly from a pre-stream error
3. Preserve whatever partial text has been accumulated

**Files:**

- Edit: `packages/web/src/api.ts`

Add a new exported error class and an `onInterrupted` handler to the streaming function:

```ts
export class StreamInterruptedError extends Error {
  constructor() {
    super('Response interrupted');
    this.name = 'StreamInterruptedError';
  }
}
```

In `streamThreadReply`, wrap the reader loop in a try/catch. If reading throws after tokens have been received, throw `StreamInterruptedError` instead of the raw error:

```ts
let receivedTokens = false;

try {
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;

    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const event = parseEventBlock(block);
      if (event) {
        if (event.event === 'token') receivedTokens = true;
        handlers.onEvent(event);
      }
    }
  }
} catch (error) {
  if (receivedTokens) {
    throw new StreamInterruptedError();
  }
  throw error;
}
```

### Task 5.2: Handle StreamInterruptedError in App.tsx

When `runThreadStream` throws a `StreamInterruptedError`, preserve the current `streamingReply` text and mark it as interrupted rather than clearing it.

**Files:**

- Edit: `packages/web/src/App.tsx`

Add state for tracking interrupted streams:

```ts
const [streamInterrupted, setStreamInterrupted] = useState(false);
```

In the `runThreadStream` catch block (around line 530-532), detect the interruption:

```ts
import { StreamInterruptedError } from './api';

// In runThreadStream catch:
catch (error) {
  if (error instanceof StreamInterruptedError) {
    setStreamInterrupted(true);
    // Don't clear streamingReply — preserve partial text
  } else {
    setStreamingReply('');
    setError('thread', String(error));
  }
}
```

Add a retry handler:

```ts
function handleRetryStream() {
  if (!selectedThread || !selectedChannelId) return;

  setStreamInterrupted(false);
  setStreamingReply('');
  void runThreadStream({
    threadId: selectedThread.id,
    channelId: selectedChannelId,
  });
}
```

Pass `streamInterrupted` and `onRetryStream` to `ThreadDrawer`.

### Task 5.3: Update ThreadDrawer to show interrupted stream UI

**Files:**

- Edit: `packages/web/src/ThreadDrawer.tsx`

Add props:

```ts
streamInterrupted?: boolean;
onRetryStream?: () => void;
```

Update the streaming reply card to show the interruption notice:

```tsx
{streamingReply ? (
  <Card className={cn('p-4 thread-message-streaming', 'bg-primary/10 border-primary/20')}>
    <p className="thread-message-role">assistant</p>
    <p style={{ margin: 0 }}>{streamingReply}</p>
    {streamInterrupted ? (
      <p className="stream-interrupted-notice" role="alert">
        ⚠ Response interrupted.{' '}
        <button className="failed-message-link" onClick={onRetryStream}>
          Retry
        </button>
      </p>
    ) : null}
  </Card>
) : null}
```

### Task 5.4: Add streaming interruption CSS

**Files:**

- Edit: `packages/web/src/styles.css`

```css
/* ─── Stream interruption ───────────────────────────────────────────────── */
.stream-interrupted-notice {
  margin: 0.5rem 0 0;
  font-size: 0.78rem;
  color: var(--warning);
}
```

### Task 5.5: Write integration test for streaming interruption

**Files:**

- Add to: `packages/web/src/App.test.tsx`

```ts
describe('streaming interruption', () => {
  it('preserves partial text and shows retry when stream breaks mid-response', async () => {
    // Setup: mock streamThreadReply to emit some tokens then throw StreamInterruptedError
    api.streamThreadReply.mockImplementation(
      async (_user, _pid, _cid, _tid, _msg, handlers) => {
        handlers.onEvent({ event: 'token', data: { text: 'Partial response...' } });
        throw new StreamInterruptedError();
      },
    );

    // Navigate to chat, open thread, trigger reply
    // Assert: partial text visible, "Response interrupted" text visible, Retry button present
  });
});
```

Note: The exact test setup depends on the test infrastructure established in earlier phases. The mock should simulate the SSE reader throwing after emitting tokens.

---

## Phase 6: Integration

### Task 6.1: Wire ConnectionBanner into the chat layout

**Files:**

- Edit: `packages/web/src/App.tsx`

In the chat route return block, add `ConnectionBanner` at the top of the main content area (inside `<main className="mindspace-shell">`), before `<Sidebar>`:

```tsx
import { ConnectionBanner } from './ConnectionBanner';
import { useConnectionStatus } from './useConnectionStatus';

// In App():
const { status: connectionStatus, reportFailure, reportSuccess } = useConnectionStatus();

// In the chat route return:
return (
  <main className="mindspace-shell">
    <ConnectionBanner
      status={connectionStatus}
      onRetry={() => {
        // Re-attempt loading current data
        if (route.name === 'chat' && route.projectId) {
          void handleLoadChannels(route.projectId);
          if (selectedChannelId) {
            void handleLoadFeed(route.projectId, selectedChannelId);
          }
        }
      }}
    />
    <Sidebar ... />
    <ChannelFeed ... />
    <ThreadDrawer ... />
  </main>
);
```

### Task 6.2: Wire reportFailure/reportSuccess into API calls

**Files:**

- Edit: `packages/web/src/App.tsx`

In each `catch` block of the handler functions (`handleLoadChannels`, `handleLoadFeed`, `handleOpenThread`, `handleCreatePost`, `handleReplyInThread`), call `reportFailure()`. In each successful completion (after `await` resolves without error), call `reportSuccess()`.

Example pattern:

```ts
async function handleLoadFeed(nextProjectId: string, channelId: string) {
  if (!user) return;

  startLoading('feed');
  clearError('feed');
  try {
    const result = await listChannelFeed(user, nextProjectId, channelId);
    setFeedPosts(result.posts);
    reportSuccess();
  } catch (error) {
    reportFailure();
    setError('feed', String(error));
  } finally {
    stopLoading('feed');
  }
}
```

### Task 6.3: Disable inputs during reconnecting state

**Files:**

- Edit: `packages/web/src/App.tsx`

Pass `connectionStatus` or a derived `isDisconnected` boolean to child components. When `connectionStatus` is `'reconnecting'` or `'offline'`, disable all input fields and submit buttons.

Add to the chat route's props:

```ts
const inputsDisabled = connectionStatus === 'reconnecting' || connectionStatus === 'offline';
```

Pass as an additional `disabled` prop to `ChannelFeed` and `ThreadDrawer` composers. The simplest approach is to OR this with the existing `disabled` conditions on the submit buttons and textarea `disabled` props.

### Task 6.4: Add ConnectionBanner CSS grid positioning

The banner needs to span the full width above the 3-column layout. Update the grid to accommodate it.

**Files:**

- Edit: `packages/web/src/styles.css`

Update `.mindspace-shell` to conditionally include a banner row:

```css
.mindspace-shell {
  display: grid;
  grid-template-columns: 20rem minmax(0, 1fr) 24rem;
  grid-template-rows: auto 1fr;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

.connection-banner {
  grid-column: 1 / -1;
}
```

The `auto` row will collapse to 0 when the banner is not rendered, preserving the current layout.

### Task 6.5: Update InlineError onDismiss wiring in App.tsx

The upgraded `InlineError` now accepts an `onDismiss` callback for 8-second auto-dismiss. Wire it into the existing error clearing.

**Files:**

- Edit: `packages/web/src/App.tsx`

Update the `InlineError` usages in child components to pass `onDismiss`:

In `Sidebar`, `ChannelFeed`, and `ThreadDrawer`, the `InlineError` receives `message={someError}`. Add `onDismiss` that calls back to `clearError(scope)`:

Option A (simplest): Pass a `clearError` callback to each child component.
Option B (prop-based): Let `InlineError` handle its own dismiss timer internally (already done in Task 2.1), and have `onDismiss` call back to clear the error from the parent's Map.

Use Option B — add `onClearFeedError`, `onClearThreadError`, `onClearChannelError` callbacks from App.tsx to the respective child components.

### Task 6.6: Final integration test

**Files:**

- Add to: `packages/web/src/App.test.tsx`

```ts
describe('error and offline states integration', () => {
  it('shows connection banner when API calls fail consecutively', async () => {
    // Mock listChannelFeed to reject 3 times
    // Assert: banner transitions from reconnecting to offline
  });

  it('shows human-readable error messages instead of raw HTTP errors', async () => {
    api.listChannelFeed.mockRejectedValueOnce(new Error('[500] Internal Server Error'));
    // Navigate to chat, wait for feed load
    // Assert: error message is "Couldn't load feed. Please try again."
  });

  it('marks failed optimistic messages and supports retry', async () => {
    // Mock streamThreadReply to reject
    // Send a reply, wait for failure
    // Assert: message shows with "Failed to send. Retry · Discard"
    // Click Retry, assert re-send attempted
  });
});
```

---

## File Summary

| File | Action | Phase |
|------|--------|-------|
| `packages/ui/src/styles.css` | Edit — add `--warning`, `--success` tokens | 1 |
| `packages/web/src/InlineError.tsx` | Edit — use CSS class, add `onDismiss` prop with 8s timer | 2 |
| `packages/web/src/InlineError.test.tsx` | Create — test rendering, auto-dismiss, timer reset | 2 |
| `packages/web/src/errorMessages.ts` | Create — `humanizeError()` utility | 2 |
| `packages/web/src/errorMessages.test.ts` | Create — test error message mapping | 2 |
| `packages/web/src/useConnectionStatus.ts` | Create — hook for online/offline/reconnect state machine | 3 |
| `packages/web/src/useConnectionStatus.test.ts` | Create — test state transitions and timers | 3 |
| `packages/web/src/ConnectionBanner.tsx` | Create — thin status bar component | 3 |
| `packages/web/src/ConnectionBanner.test.tsx` | Create — test each banner state | 3 |
| `packages/web/src/api.ts` | Edit — add `sendFailed` to `ThreadMessage`, add `StreamInterruptedError` class, detect mid-stream interruption | 4, 5 |
| `packages/web/src/FailedMessageActions.tsx` | Create — retry/discard UI for failed messages | 4 |
| `packages/web/src/FailedMessageActions.test.tsx` | Create — test retry/discard callbacks | 4 |
| `packages/web/src/ThreadDrawer.tsx` | Edit — render failed message state, streaming interruption notice | 4, 5 |
| `packages/web/src/App.tsx` | Edit — wire all layers, update `setError` timeout to 8s, pipe through `humanizeError`, add connection status, failed message handlers, stream interruption state | 2, 4, 5, 6 |
| `packages/web/src/styles.css` | Edit — add `.inline-error`, `.connection-banner-*`, `.thread-message-failed`, `.failed-message-*`, `.stream-interrupted-notice` classes, update `.mindspace-shell` grid | 2, 3, 4, 5, 6 |
| `packages/web/src/App.test.tsx` | Edit — add integration tests for error/offline scenarios | 5, 6 |
