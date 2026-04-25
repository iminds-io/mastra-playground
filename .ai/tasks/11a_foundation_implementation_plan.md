# ABOUTME: Implementation plan for Phase 11a — Foundation (router, auth flow, theme system, layout shell)
# ABOUTME: Covers client-side routing, Google sign-in screen, useTheme hook, and 2/3-column layout shell

# Phase 11a: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: Task 10 (frontend hardening) complete. Existing test suite passes. Design doc `05_target_frontend_ui_architecture_design.md` approved.

**Goal:** Replace the manual `readRoute`/`navigate` routing, admin-console landing page, and fixed 3-column layout with a proper component-based router, Google-only sign-in screen, theme system, and a responsive 2/3-column layout shell that supports thread detail slide-in.

**Architecture:** Build from the bottom up — theme system first (no dependencies), then router (no UI changes yet), then layout shell (CSS restructure), then auth flow (ties router + layout together). Each phase is independently testable.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Vitest 4 + @testing-library/react, `@mastra-mindspace/ui` design system, Firebase Auth (Google provider). No external router library — we build a minimal component-based router since we only have 3 routes.

---

## Current State Summary

| Area | What exists | File |
|------|-------------|------|
| **Routing** | `readRoute()` + `navigate()` functions in App.tsx. Two states: `chat` and `admin`. `popstate` listener syncs URL. | `packages/web/src/App.tsx` lines 36-60 |
| **Auth** | Firebase Google + email/password sign-in. `onAuthStateChanged` listener in App. No sign-in screen — admin console IS the landing page. | `packages/web/src/firebase.ts`, `App.tsx` lines 191-195 |
| **Layout** | Fixed 3-column grid: `20rem | 1fr | 24rem`. Thread drawer always rendered. Responsive breakpoints at 1100px and 768px. | `packages/web/src/styles.css` lines 33-37 |
| **Theme** | Dark mode only. OKLCH tokens in `:root`. No light mode. No toggle. | `packages/ui/src/styles.css` lines 38-69 |
| **Tests** | 10 tests in `App.test.tsx`. Mock Firebase auth, mock API. Tests navigate via `window.history.pushState`. | `packages/web/src/App.test.tsx` |

---

## Success Criteria

- [ ] `useTheme()` hook reads/writes localStorage, sets `data-theme` on `<html>`, supports 3-state cycle (light → dark → system)
- [ ] Light mode token block exists in `packages/ui/src/styles.css` under `:root[data-theme="light"]`
- [ ] Component-based router replaces `readRoute`/`navigate` with `<Route>` matching
- [ ] Routes: `/` (sign-in or redirect), `/chat/:projectId` (chat), `/admin/test` (dev-only)
- [ ] Sign-in screen with single "Sign in with Google" button, centered, branded
- [ ] Post-sign-in smart routing: 0 projects → dead-end, 1 project → direct nav, 2+ → picker
- [ ] Layout shell supports 2-column (sidebar + content) and 3-column (sidebar + compressed index + detail)
- [ ] Thread detail slides in with 200ms CSS transition
- [ ] All existing tests continue to pass
- [ ] New tests cover each new behavior
- [ ] `pnpm typecheck` passes across all packages

---

## Recommended Sequencing

Execute these phases in order. Each phase is independently shippable.

1. **Phase 1: Theme System** — `useTheme()` hook + light mode tokens. No layout changes.
2. **Phase 2: Router** — Component-based router replaces `readRoute`/`navigate`. No UI changes.
3. **Phase 3: Layout Shell** — 2/3-column CSS grid with thread detail slide-in transition.
4. **Phase 4: Auth Flow** — Sign-in screen, post-auth smart routing, project picker.

---

## Phase 1: Theme System

### Task 1.1: Create `useTheme` hook

The hook manages a 3-state theme preference: `"light"`, `"dark"`, `"system"`. It persists to `localStorage` under key `"mindspace-theme"`, reads `prefers-color-scheme` for system preference, and sets the `data-theme` attribute on `<html>`.

**Files:**

- Create: `packages/web/src/useTheme.ts`
- Create: `packages/web/src/useTheme.test.ts`

**TDD Step 1: Write failing tests**

Create `packages/web/src/useTheme.test.ts`:

```ts
// @vitest-environment jsdom
// ABOUTME: Tests for the useTheme hook — preference persistence, DOM attribute, and cycling
// ABOUTME: Validates 3-state theme cycle and system preference resolution

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from './useTheme';

describe('useTheme', () => {
  let matchMediaListeners: Array<(e: { matches: boolean }) => void>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    matchMediaListeners = [];

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
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
    // matchMedia is stubbed to match 'dark'
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

  it('exposes the resolved theme (what the UI actually shows)', () => {
    const { result } = renderHook(() => useTheme());
    // system resolves to dark (per matchMedia stub)
    expect(result.current.resolvedTheme).toBe('dark');

    act(() => result.current.cycle()); // system → light
    // Wait — cycle from system goes to light
    // Cycle order is light → dark → system, so:
    // Starting at 'system', cycle() → 'light'
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('responds to system preference changes when in system mode', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('dark');

    // Simulate system switching to light
    act(() => {
      for (const listener of matchMediaListeners) {
        listener({ matches: false });
      }
    });

    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/useTheme.test.ts
```

Expected: fails because `useTheme` module does not exist.

**TDD Step 3: Implement the hook**

Create `packages/web/src/useTheme.ts`:

```ts
// ABOUTME: Theme preference hook with 3-state cycle and system preference detection
// ABOUTME: Persists to localStorage, sets data-theme attribute on <html>

import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'mindspace-theme';
const CYCLE_ORDER: ThemePreference[] = ['light', 'dark', 'system'];

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }

  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const resolvedTheme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handler = (event: { matches: boolean }) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const cycle = useCallback(() => {
    setPreference((current) => {
      const currentIndex = CYCLE_ORDER.indexOf(current);
      const next = CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length]!;
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { preference, resolvedTheme, cycle } as const;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/useTheme.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/useTheme.ts packages/web/src/useTheme.test.ts
git commit -m "Add useTheme hook with 3-state cycle and system preference detection"
```

---

### Task 1.2: Add light mode token block

Add a `:root[data-theme="light"]` block to the design system CSS. Per the design doc (Section 11j), same semantic token names with flipped lightness values. Dark mode remains the default (no attribute needed).

**Files:**

- Modify: `packages/ui/src/styles.css`
- Create: `packages/web/src/theme.test.ts`

**TDD Step 1: Write failing test**

Create `packages/web/src/theme.test.ts`:

```ts
// ABOUTME: Tests that the design system CSS contains light mode token definitions
// ABOUTME: Validates the data-theme="light" selector exists with required tokens

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const uiStylesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../ui/src/styles.css',
);
const uiStyles = readFileSync(uiStylesPath, 'utf8');

const webStylesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'styles.css',
);
const webStyles = readFileSync(webStylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('light mode tokens', () => {
  it('defines a :root[data-theme="light"] block with background and foreground tokens', () => {
    const normalized = normalizeCss(uiStyles);
    expect(normalized).toContain(':root[data-theme="light"]');
    expect(normalized).toMatch(/data-theme="light"\]\s*\{[^}]*--background:/);
    expect(normalized).toMatch(/data-theme="light"\]\s*\{[^}]*--foreground:/);
    expect(normalized).toMatch(/data-theme="light"\]\s*\{[^}]*--primary:/);
  });

  it('adjusts the body gradient for light mode', () => {
    const normalized = normalizeCss(webStyles);
    expect(normalized).toMatch(/\[data-theme="light"\][^{]*body/);
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/theme.test.ts
```

**TDD Step 3: Implement light mode tokens**

In `packages/ui/src/styles.css`, add after the `:root { ... }` block (after line 69):

```css
:root[data-theme="light"] {
  color-scheme: light;

  --background:             oklch(0.97 0.005 60);
  --foreground:             oklch(0.15 0.008 248);
  --card:                   oklch(0.99 0.003 60);
  --card-foreground:        oklch(0.15 0.008 248);
  --primary:                oklch(0.55 0.18 55);
  --primary-foreground:     oklch(0.97 0.005 60);
  --secondary:              oklch(0.93 0.004 60);
  --secondary-foreground:   oklch(0.25 0.006 248);
  --muted:                  oklch(0.94 0.003 60);
  --muted-foreground:       oklch(0.45 0.008 248);
  --accent:                 oklch(0.50 0.18 55);
  --accent-foreground:      oklch(0.97 0.005 60);
  --destructive:            oklch(0.50 0.22 25);
  --destructive-foreground: oklch(0.97 0.005 60);
  --border:                 oklch(0.88 0.004 60);
  --input:                  oklch(0.95 0.003 60);
  --ring:                   oklch(0.55 0.18 55);
  --sidebar:                oklch(0.95 0.005 60);
  --sidebar-foreground:     oklch(0.15 0.008 248);
  --sidebar-border:         oklch(0.88 0.004 60);
}
```

In `packages/web/src/styles.css`, add a light mode gradient adjustment after the existing `body` rule (after line 20):

```css
:root[data-theme="light"] body {
  background:
    radial-gradient(circle at top left,  oklch(0.55 0.22 250 / 0.06), transparent 28%),
    radial-gradient(circle at bottom right, oklch(0.75 0.14 55 / 0.04), transparent 26%),
    var(--background);
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/theme.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/ui/src/styles.css packages/web/src/styles.css packages/web/src/theme.test.ts
git commit -m "Add light mode OKLCH token block and gradient adjustment"
```

---

## Phase 2: Router

### Task 2.1: Build a minimal component-based router

Replace the `readRoute`/`navigate` functions with a proper `<Router>` + `<Route>` component system. This is intentionally minimal — we only have 3 routes and don't need react-router. The router provides:

- `<Router>` — context provider that tracks current pathname via `popstate`
- `<Route path="/chat/:projectId">` — renders children when path matches, extracts params
- `useRoute()` — returns `{ path, params, navigate }`
- `navigate(path)` — pushes to history and triggers re-render

**Files:**

- Create: `packages/web/src/router.tsx`
- Create: `packages/web/src/router.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/router.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the minimal component-based router
// ABOUTME: Validates path matching, param extraction, navigation, and route rendering

import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Router, Route, useRoute, navigate } from './router';

function TestRouteDisplay() {
  const route = useRoute();
  return (
    <div>
      <span data-testid="path">{route.path}</span>
      <span data-testid="params">{JSON.stringify(route.params)}</span>
    </div>
  );
}

describe('Router', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the matching route', () => {
    window.history.pushState({}, '', '/chat/project-1');

    render(
      <Router>
        <Route path="/"><div>home</div></Route>
        <Route path="/chat/:projectId"><div>chat view</div></Route>
      </Router>,
    );

    expect(screen.getByText('chat view')).toBeTruthy();
    expect(screen.queryByText('home')).toBeNull();
  });

  it('extracts params from the URL', () => {
    window.history.pushState({}, '', '/chat/project-abc');

    render(
      <Router>
        <Route path="/chat/:projectId">
          <TestRouteDisplay />
        </Route>
      </Router>,
    );

    expect(screen.getByTestId('params').textContent).toBe('{"projectId":"project-abc"}');
  });

  it('matches the root path', () => {
    window.history.pushState({}, '', '/');

    render(
      <Router>
        <Route path="/"><div>root</div></Route>
        <Route path="/chat/:projectId"><div>chat</div></Route>
      </Router>,
    );

    expect(screen.getByText('root')).toBeTruthy();
  });

  it('updates on navigate()', () => {
    window.history.pushState({}, '', '/');

    render(
      <Router>
        <Route path="/"><div>home</div></Route>
        <Route path="/chat/:projectId"><div>chat</div></Route>
      </Router>,
    );

    expect(screen.getByText('home')).toBeTruthy();

    act(() => navigate('/chat/project-2'));

    expect(screen.queryByText('home')).toBeNull();
    expect(screen.getByText('chat')).toBeTruthy();
  });

  it('renders nothing when no route matches', () => {
    window.history.pushState({}, '', '/unknown/path');

    const { container } = render(
      <Router>
        <Route path="/"><div>home</div></Route>
        <Route path="/chat/:projectId"><div>chat</div></Route>
      </Router>,
    );

    expect(container.textContent).toBe('');
  });

  it('provides path and params via useRoute inside a matched route', () => {
    window.history.pushState({}, '', '/chat/my-project');

    render(
      <Router>
        <Route path="/chat/:projectId">
          <TestRouteDisplay />
        </Route>
      </Router>,
    );

    expect(screen.getByTestId('path').textContent).toBe('/chat/my-project');
  });

  it('matches /admin/test as a static path', () => {
    window.history.pushState({}, '', '/admin/test');

    render(
      <Router>
        <Route path="/"><div>home</div></Route>
        <Route path="/admin/test"><div>admin</div></Route>
      </Router>,
    );

    expect(screen.getByText('admin')).toBeTruthy();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/router.test.tsx
```

**TDD Step 3: Implement the router**

Create `packages/web/src/router.tsx`:

```tsx
// ABOUTME: Minimal component-based router for 3-route app
// ABOUTME: Provides Router context, Route matching with param extraction, and navigate()

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from 'react';

type RouteParams = Record<string, string>;

type RouteContextValue = {
  path: string;
  params: RouteParams;
  navigate: (path: string) => void;
};

const RouteContext = createContext<RouteContextValue>({
  path: '/',
  params: {},
  navigate: () => {},
});

export function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute() {
  return useContext(RouteContext);
}

type RouteProps = {
  path: string;
  children: ReactNode;
};

function matchPath(
  pattern: string,
  pathname: string,
): RouteParams | null {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = pathname.split('/').filter(Boolean);

  // Root path special case
  if (patternSegments.length === 0 && pathSegments.length === 0) {
    return {};
  }

  if (patternSegments.length !== pathSegments.length) {
    return null;
  }

  const params: RouteParams = {};

  for (let i = 0; i < patternSegments.length; i++) {
    const patternPart = patternSegments[i]!;
    const pathPart = pathSegments[i]!;

    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

export function Route({ path: pattern, children }: RouteProps) {
  const { path } = useContext(RouteContext);
  const match = matchPath(pattern, path);

  if (!match) {
    return null;
  }

  return (
    <RouteContext.Provider value={{ path, params: match, navigate }}>
      {children}
    </RouteContext.Provider>
  );
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const contextValue = useMemo(
    () => ({ path, params: {}, navigate }),
    [path],
  );

  return (
    <RouteContext.Provider value={contextValue}>
      {children}
    </RouteContext.Provider>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/router.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/router.tsx packages/web/src/router.test.tsx
git commit -m "Add minimal component-based router with param extraction"
```

---

### Task 2.2: Wire the router into App.tsx

Replace the manual `readRoute`/`navigate`/`RouteState` system in App.tsx with the new `<Router>` + `<Route>` components. The admin console moves to a separate component behind a dev-only route guard.

**Important:** This task changes routing infrastructure but does NOT change any visual UI. The same components render at the same routes. The sign-in screen is added in Phase 4.

**Files:**

- Modify: `packages/web/src/App.tsx` — remove `readRoute`, `navigate`, `RouteState`; wrap in `<Router>`; use `<Route>` for each view
- Create: `packages/web/src/AdminConsole.tsx` — extract the admin panel JSX from App.tsx
- Modify: `packages/web/src/App.test.tsx` — update to work with new router structure
- Modify: `packages/web/src/main.tsx` — wrap `<App>` in `<Router>`

**TDD Step 1: Update tests for router structure**

In `packages/web/src/App.test.tsx`, the tests already use `window.history.pushState` for navigation, which is compatible with our router. However, we need to wrap `<App>` in `<Router>` since routing context moves there.

Update the import and render pattern:

```tsx
// Add to imports
import { Router, navigate } from './router';

// Update each render() call to wrap in Router:
render(<Router><App /></Router>);

// Replace any remaining window.history.pushState for navigation
// that happens AFTER render with navigate():
// e.g., in the bootstrap test, change:
//   fireEvent.click(screen.getByRole('button', { name: /open chat mindspace/i }));
// This still works because the button internally calls navigate().
```

The existing tests should continue to pass because:
- `window.history.pushState` before `render()` sets the initial URL (router reads it on mount)
- The admin console still renders at `/admin/test`
- The chat view still renders at `/chat/:projectId`

**TDD Step 2: Verify existing tests still pass after the refactor**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 3: Implementation**

**3a. Create `packages/web/src/AdminConsole.tsx`**

Extract lines 628-771 from the current `App.tsx` (the `return` block for the admin route) into a separate component. The component receives props for all the state and handlers it needs.

```tsx
// ABOUTME: Dev-only admin test console for project bootstrapping and API debugging
// ABOUTME: Guarded by import.meta.env.DEV — excluded from production builds

import { Button, Input, Textarea } from '@mastra-mindspace/ui';

import type { AccessibleProjectSummary } from './api';
import { InlineError } from './InlineError';
import { navigate } from './router';

export type AdminConsoleProps = {
  user: { email: string | null } | null;
  projects: AccessibleProjectSummary[];
  projectName: string;
  projectId: string;
  adminMessage: string;
  meResult: string;
  mindspaceResult: string;
  adminResult: string;
  errors: Map<string, string>;
  testEmail: string;
  testPassword: string;
  isLoadingOp: (op: string) => boolean;
  onSetProjectName: (name: string) => void;
  onSetProjectId: (id: string) => void;
  onSetAdminMessage: (message: string) => void;
  onSetTestEmail: (email: string) => void;
  onSetTestPassword: (password: string) => void;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onTestSignIn: () => void;
  onGetMe: () => void;
  onBootstrapProject: () => void;
  onRunAdminTest: () => void;
};

function formatJson(value: unknown, fallback: string) {
  return value ? JSON.stringify(value, null, 2) : fallback;
}

export function AdminConsole({
  user,
  projects,
  projectName,
  projectId,
  adminMessage,
  meResult,
  mindspaceResult,
  adminResult,
  errors,
  testEmail,
  testPassword,
  isLoadingOp,
  onSetProjectName,
  onSetProjectId,
  onSetAdminMessage,
  onSetTestEmail,
  onSetTestPassword,
  onSignInWithGoogle,
  onSignOut,
  onTestSignIn,
  onGetMe,
  onBootstrapProject,
  onRunAdminTest,
}: AdminConsoleProps) {
  return (
    <main className="admin-shell">
      <section className="panel admin-panel">
        <p className="eyebrow">Mastra Mindspace</p>
        <h1>Admin Test Console</h1>
        <p className="lede">
          Authenticate with Firebase, provision a workspace, and jump into the Slack-shaped chat surface.
        </p>

        <div className="control-row">
          <Button onClick={onSignInWithGoogle} disabled={Boolean(user)}>
            Sign in with Google
          </Button>
          <Button onClick={onSignOut} disabled={!user}>
            Sign out
          </Button>
          <Button onClick={onGetMe} disabled={!user || isLoadingOp('me')}>
            GET /api/me
          </Button>
        </div>

        {import.meta.env.DEV ? (
          <fieldset className="field">
            <legend>Test credentials (dev only)</legend>
            <label className="field">
              <span>Email</span>
              <Input
                type="email"
                value={testEmail}
                onChange={(event) => onSetTestEmail(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <Input
                type="password"
                value={testPassword}
                onChange={(event) => onSetTestPassword(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="control-row">
              <Button
                onClick={onTestSignIn}
                disabled={Boolean(user) || !testEmail || !testPassword || isLoadingOp('test-sign-in')}
              >
                Sign in with test credentials
              </Button>
            </div>
          </fieldset>
        ) : null}

        <label className="field">
          <span>Authenticated user</span>
          <Input value={user?.email ?? 'Not signed in'} readOnly />
        </label>

        <label className="field">
          <span>New project name</span>
          <Input value={projectName} onChange={(event) => onSetProjectName(event.target.value)} />
        </label>

        <div className="control-row">
          <Button onClick={onBootstrapProject} disabled={!user || isLoadingOp('bootstrap')}>
            Create Demo Project
          </Button>
          <Button
            onClick={() => {
              if (projectId) {
                navigate(`/chat/${projectId}`);
              }
            }}
            disabled={!projectId}
          >
            Open Chat Mindspace
          </Button>
        </div>

        <label className="field">
          <span>Project ID</span>
          <Input value={projectId} onChange={(event) => onSetProjectId(event.target.value)} />
        </label>

        <label className="field">
          <span>Message</span>
          <Textarea
            aria-label="Message"
            value={adminMessage}
            onChange={(event) => onSetAdminMessage(event.target.value)}
            rows={4}
          />
        </label>

        <div className="control-row">
          <Button onClick={onRunAdminTest} disabled={!user || !projectId || isLoadingOp('admin-test')}>
            Run Admin Test
          </Button>
        </div>
      </section>

      <section className="panel panel-output">
        <InlineError message={errors.get('admin')} />
        <article>
          <h2>Projects</h2>
          <div className="mindspace-list admin-project-list" aria-label="Projects">
            {projects.map((project) => (
              <button
                key={project.id}
                className={project.id === projectId ? 'mindspace-button mindspace-button-active' : 'mindspace-button'}
                onClick={() => onSetProjectId(project.id)}
              >
                <span className="mindspace-button-name">{project.name}</span>
                <span className="mindspace-button-slug">{project.slug}</span>
              </button>
            ))}
          </div>
        </article>
        <article>
          <h2>Profile</h2>
          <pre>{meResult || 'No profile request yet.'}</pre>
        </article>
        <article>
          <h2>Bootstrap response</h2>
          <pre>{mindspaceResult || 'No bootstrap request yet.'}</pre>
        </article>
        <article>
          <h2>Admin Test</h2>
          <pre>{adminResult || 'No admin test response yet.'}</pre>
        </article>
        <article>
          <h2>Last Error</h2>
          <pre>{formatJson(errors.get('admin'), 'No errors.')}</pre>
        </article>
      </section>
    </main>
  );
}
```

**3b. Update `packages/web/src/App.tsx`**

Remove `readRoute`, `navigate`, `RouteState` type. Import `Route`, `useRoute`, `navigate` from `./router`. Use `<Route>` for view switching:

```tsx
import { Route, useRoute, navigate } from './router';
import { AdminConsole } from './AdminConsole';

// Remove: type RouteState, function readRoute, function navigate
// Remove: const [route, setRoute] = useState<RouteState>(() => readRoute(...))
// Remove: the useEffect for popstate handling

// Inside App(), the chat view becomes a child component:
export function App() {
  // ... keep all state except route ...

  return (
    <>
      <Route path="/chat/:projectId">
        <ChatView user={user} /* ...props... */ />
      </Route>
      {import.meta.env.DEV ? (
        <Route path="/admin/test">
          <AdminConsole /* ...props... */ />
        </Route>
      ) : null}
      <Route path="/">
        {/* Phase 4 will add the sign-in screen here */}
        {/* For now, redirect authenticated users or show admin */}
      </Route>
    </>
  );
}
```

The `ChatView` component is a function within or extracted from App that wraps `<Sidebar>`, `<ChannelFeed>`, `<ThreadDrawer>`. It uses `useRoute()` to get `projectId` from params.

**Note:** The exact extraction of `ChatView` is mechanical — move the `route.name === 'chat'` branch into a component that reads `projectId` via `useRoute().params.projectId`. All the existing handlers stay in App or move with ChatView. The key architectural change is: routing is now declarative, not imperative.

**3c. Update `packages/web/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import { Router } from './router';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
```

**TDD Step 4: Verify all existing tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/AdminConsole.tsx packages/web/src/main.tsx packages/web/src/App.test.tsx
git commit -m "Wire component-based router into App, extract AdminConsole"
```

---

## Phase 3: Layout Shell

### Task 3.1: Implement 2-column default / 3-column thread-open layout

The current layout is a fixed 3-column grid (`20rem | 1fr | 24rem`) where the thread drawer is always visible. The target is:

- **State A (default):** 2 columns — sidebar (260px) + thread index (remaining). Thread detail hidden.
- **State B (thread open):** 3 columns — sidebar (260px) + compressed thread index (~300px) + thread detail (remaining). Thread detail slides in from the right with 200ms transition.

**Key insight:** The slide-in effect is achieved by having the thread detail column go from `0fr` to `1fr` with a CSS transition on `grid-template-columns`. The thread detail panel itself uses `overflow: hidden` so content clips during the transition.

**Files:**

- Modify: `packages/web/src/styles.css` — new grid template + transition rules
- Modify: `packages/web/src/App.tsx` (or ChatView) — add a CSS class toggle based on `selectedThread` state
- Create: `packages/web/src/layout.test.ts` — CSS structure tests

**TDD Step 1: Write failing test**

Create `packages/web/src/layout.test.ts`:

```ts
// ABOUTME: Tests that the layout CSS supports 2-column and 3-column states
// ABOUTME: Validates grid template, transition, and thread-open class

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('layout shell', () => {
  it('defines a 2-column default grid for the mindspace shell', () => {
    const normalized = normalizeCss(styles);
    // Default should be sidebar + content (no thread detail column)
    expect(normalized).toMatch(
      /\.mindspace-shell\s*\{[^}]*grid-template-columns:[^}]*260px/,
    );
  });

  it('defines a transition on grid-template-columns for the slide-in effect', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(
      /\.mindspace-shell\s*\{[^}]*transition:[^}]*grid-template-columns/,
    );
  });

  it('expands to 3 columns when thread-open class is applied', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.mindspace-shell\.thread-open/);
  });

  it('hides the thread drawer by default with overflow hidden', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(
      /\.thread-drawer\s*\{[^}]*overflow:\s*hidden/,
    );
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/layout.test.ts
```

**TDD Step 3: Implement the layout changes**

In `packages/web/src/styles.css`, replace the `.mindspace-shell` rule:

```css
.mindspace-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 0fr;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  transition: grid-template-columns 200ms ease-out;
}

.mindspace-shell.thread-open {
  grid-template-columns: 260px 300px minmax(0, 1fr);
}
```

Update `.thread-drawer` to support the slide-in:

```css
.thread-drawer {
  background: var(--sidebar);
  border-left: 1px solid var(--sidebar-border);
  padding: 1.1rem;
  display: grid;
  gap: 1rem;
  align-content: start;
  grid-template-rows: auto 1fr auto auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
```

Update the responsive breakpoints to match. At 1100px, the thread detail should overlay or the sidebar should collapse. At 768px, single column.

Update the `@media (max-width: 1100px)` block:

```css
@media (max-width: 1100px) {
  .mindspace-shell {
    grid-template-columns: 220px minmax(0, 1fr) 0fr;
  }

  .mindspace-shell.thread-open {
    grid-template-columns: 220px 0fr minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  /* ... existing mobile rules ... */
  .mindspace-shell {
    grid-template-columns: 1fr;
    height: 100%;
    overflow: auto;
  }

  .mindspace-shell.thread-open {
    grid-template-columns: 1fr;
  }
}
```

In `packages/web/src/App.tsx` (or the ChatView component), add the `thread-open` class conditionally:

```tsx
<main className={cn('mindspace-shell', selectedThread && 'thread-open')}>
```

This requires importing `cn` from `@mastra-mindspace/ui`.

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/layout.test.ts
```

Also run the full suite:

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/App.tsx packages/web/src/layout.test.ts
git commit -m "Implement 2/3-column layout shell with thread detail slide-in transition"
```

---

## Phase 4: Auth Flow

### Task 4.1: Create the sign-in screen component

A centered, minimal sign-in screen with the Mastra Mindspace brand and a single "Sign in with Google" button. This renders at `/` when the user is not authenticated.

**Files:**

- Create: `packages/web/src/SignIn.tsx`
- Create: `packages/web/src/SignIn.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/SignIn.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the sign-in screen component
// ABOUTME: Validates brand text, Google button, and sign-in callback

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignIn } from './SignIn';

describe('SignIn', () => {
  afterEach(cleanup);

  it('renders the brand name and tagline', () => {
    render(<SignIn onSignInWithGoogle={vi.fn()} isSigningIn={false} />);

    expect(screen.getByText(/mastra mindspace/i)).toBeTruthy();
    expect(screen.getByText(/ai-powered team workspaces/i)).toBeTruthy();
  });

  it('renders a single "Sign in with Google" button', () => {
    render(<SignIn onSignInWithGoogle={vi.fn()} isSigningIn={false} />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect(button).toBeTruthy();
  });

  it('calls onSignInWithGoogle when the button is clicked', () => {
    const handleSignIn = vi.fn();
    render(<SignIn onSignInWithGoogle={handleSignIn} isSigningIn={false} />);

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(handleSignIn).toHaveBeenCalledOnce();
  });

  it('disables the button while signing in', () => {
    render(<SignIn onSignInWithGoogle={vi.fn()} isSigningIn={true} />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect(button).toHaveProperty('disabled', true);
  });

  it('shows an error message when provided', () => {
    render(<SignIn onSignInWithGoogle={vi.fn()} isSigningIn={false} error="Auth failed" />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/auth failed/i)).toBeTruthy();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/SignIn.test.tsx
```

**TDD Step 3: Implement the component**

Create `packages/web/src/SignIn.tsx`:

```tsx
// ABOUTME: Google-only sign-in screen — centered brand mark with single auth button
// ABOUTME: Renders at / when user is not authenticated

import { Button } from '@mastra-mindspace/ui';

import { InlineError } from './InlineError';

export type SignInProps = {
  onSignInWithGoogle: () => void;
  isSigningIn: boolean;
  error?: string;
};

export function SignIn({ onSignInWithGoogle, isSigningIn, error }: SignInProps) {
  return (
    <main className="sign-in-screen">
      <div className="sign-in-card">
        <h1 className="sign-in-brand">Mastra Mindspace</h1>
        <p className="sign-in-tagline">AI-powered team workspaces</p>

        <Button
          onClick={onSignInWithGoogle}
          disabled={isSigningIn}
          className="sign-in-button"
        >
          Sign in with Google
        </Button>

        <InlineError message={error} />
      </div>
    </main>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/SignIn.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/SignIn.tsx packages/web/src/SignIn.test.tsx
git commit -m "Add sign-in screen component with Google auth button"
```

---

### Task 4.2: Add sign-in screen CSS

Centered layout with the existing radial gradient background. The sign-in card is a minimal centered block.

**Files:**

- Modify: `packages/web/src/styles.css`

**TDD Step 1: Write a test for the sign-in CSS structure**

Add to `packages/web/src/layout.test.ts`:

```ts
it('defines the sign-in screen as a centered flexbox layout', () => {
  const normalized = normalizeCss(styles);
  expect(normalized).toMatch(/\.sign-in-screen\s*\{[^}]*display:\s*flex/);
  expect(normalized).toMatch(/\.sign-in-screen\s*\{[^}]*justify-content:\s*center/);
  expect(normalized).toMatch(/\.sign-in-screen\s*\{[^}]*align-items:\s*center/);
  expect(normalized).toMatch(/\.sign-in-screen\s*\{[^}]*height:\s*100vh/);
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/layout.test.ts
```

**TDD Step 3: Implement**

Add to `packages/web/src/styles.css`, before the admin panel section:

```css
/* ─── Sign-in screen ────────────────────────────────────────────────────── */
.sign-in-screen {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}

.sign-in-card {
  display: grid;
  gap: 1.25rem;
  justify-items: center;
  text-align: center;
  max-width: 360px;
  padding: 2.5rem;
}

.sign-in-brand {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sign-in-tagline {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.95rem;
}

.sign-in-button {
  margin-top: 0.75rem;
  min-width: 220px;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/layout.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/layout.test.ts
git commit -m "Add sign-in screen centered layout CSS"
```

---

### Task 4.3: Implement post-sign-in smart routing

After Google auth completes, the app loads the user's accessible projects and routes intelligently:

- **0 projects** → Dead-end screen: "You don't have access to any projects yet. Contact your admin for access." + sign-out button.
- **1 project** → Navigate directly to `/chat/{projectId}` (zero friction).
- **2+ projects** → Project picker (for now, navigate to the first project — the project picker overlay is a later task, not Phase 11a).

**Files:**

- Create: `packages/web/src/PostAuthRouter.tsx`
- Create: `packages/web/src/PostAuthRouter.test.tsx`
- Modify: `packages/web/src/App.tsx` — wire PostAuthRouter at `/` route

**TDD Step 1: Write failing tests**

Create `packages/web/src/PostAuthRouter.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for post-authentication smart routing logic
// ABOUTME: Validates 0/1/2+ project routing behavior

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Router } from './router';
import { PostAuthRouter } from './PostAuthRouter';

const navigateSpy = vi.fn();

vi.mock('./router', async () => {
  const actual = await vi.importActual('./router');
  return {
    ...actual,
    navigate: (...args: unknown[]) => navigateSpy(...args),
  };
});

describe('PostAuthRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('navigates to /chat/:projectId when user has exactly 1 project', async () => {
    const projects = [
      { id: 'proj-1', organizationId: 'org-1', name: 'Solo', slug: 'solo', status: 'active' },
    ];

    render(
      <Router>
        <PostAuthRouter projects={projects} isLoading={false} onSignOut={vi.fn()} />
      </Router>,
    );

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith('/chat/proj-1');
    });
  });

  it('shows a dead-end message when user has 0 projects', () => {
    render(
      <Router>
        <PostAuthRouter projects={[]} isLoading={false} onSignOut={vi.fn()} />
      </Router>,
    );

    expect(screen.getByText(/don't have access/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
  });

  it('navigates to the first project when user has 2+ projects', async () => {
    const projects = [
      { id: 'proj-1', organizationId: 'org-1', name: 'Alpha', slug: 'alpha', status: 'active' },
      { id: 'proj-2', organizationId: 'org-1', name: 'Beta', slug: 'beta', status: 'active' },
    ];

    render(
      <Router>
        <PostAuthRouter projects={projects} isLoading={false} onSignOut={vi.fn()} />
      </Router>,
    );

    // For now, route to first project. Project picker is a future task.
    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith('/chat/proj-1');
    });
  });

  it('shows a loading state while projects are being fetched', () => {
    render(
      <Router>
        <PostAuthRouter projects={[]} isLoading={true} onSignOut={vi.fn()} />
      </Router>,
    );

    expect(screen.getByText(/loading/i)).toBeTruthy();
    expect(screen.queryByText(/don't have access/i)).toBeNull();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/PostAuthRouter.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/PostAuthRouter.tsx`:

```tsx
// ABOUTME: Post-authentication routing — directs users based on project membership count
// ABOUTME: 0 projects = dead-end, 1 project = direct nav, 2+ = first project (picker is future)

import { useEffect } from 'react';

import { Button, Spinner } from '@mastra-mindspace/ui';

import type { AccessibleProjectSummary } from './api';
import { navigate } from './router';

export type PostAuthRouterProps = {
  projects: AccessibleProjectSummary[];
  isLoading: boolean;
  onSignOut: () => void;
};

export function PostAuthRouter({ projects, isLoading, onSignOut }: PostAuthRouterProps) {
  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (projects.length === 1) {
      navigate(`/chat/${projects[0]!.id}`);
      return;
    }

    if (projects.length >= 2) {
      // Future: show project picker modal. For now, route to first.
      navigate(`/chat/${projects[0]!.id}`);
    }
  }, [projects, isLoading]);

  if (isLoading) {
    return (
      <main className="sign-in-screen">
        <div className="sign-in-card">
          <Spinner size="lg" />
          <p>Loading your workspaces...</p>
        </div>
      </main>
    );
  }

  if (projects.length === 0) {
    return (
      <main className="sign-in-screen">
        <div className="sign-in-card">
          <h1 className="sign-in-brand">Mastra Mindspace</h1>
          <p>You don't have access to any projects yet. Contact your admin for access.</p>
          <Button onClick={onSignOut}>Sign out</Button>
        </div>
      </main>
    );
  }

  return null;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/PostAuthRouter.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/PostAuthRouter.tsx packages/web/src/PostAuthRouter.test.tsx
git commit -m "Add post-auth smart routing (0/1/2+ project handling)"
```

---

### Task 4.4: Wire sign-in and post-auth routing into App

Connect the sign-in screen and post-auth router to the main App at the `/` route. The logic:

- Not authenticated → show `<SignIn />`
- Authenticated, at `/` → show `<PostAuthRouter />` (which redirects or shows dead-end)
- Authenticated, at `/chat/:projectId` → show chat view (existing behavior)
- Authenticated, at `/admin/test` + DEV → show admin console (existing behavior)

**Files:**

- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.test.tsx` — add tests for the new routing

**TDD Step 1: Write new tests**

Add these test cases to `packages/web/src/App.test.tsx`:

```tsx
it('shows the sign-in screen at / when not authenticated', async () => {
  // Override the auth mock to return null user
  // (Implementation depends on how the mock is structured — 
  // may need to update the authState.user or add a new mock setup)
  window.history.pushState({}, '', '/');
  // Temporarily set authState.user to null for this test
  const originalUser = authState.user;
  authState.user = null as any;

  render(<Router><App /></Router>);

  expect(screen.getByRole('button', { name: /sign in with google/i })).toBeTruthy();
  expect(screen.getByText(/mastra mindspace/i)).toBeTruthy();

  authState.user = originalUser;
});

it('redirects to /chat/:projectId after auth when user has projects', async () => {
  window.history.pushState({}, '', '/');

  render(<Router><App /></Router>);

  // Auth fires immediately in mock, projects load, smart routing kicks in
  await waitFor(() => {
    expect(window.location.pathname).toMatch(/^\/chat\//);
  });
});
```

**TDD Step 2: Verify new tests fail (the old ones should still pass)**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 3: Implement**

In `App.tsx`, update the `/` route:

```tsx
<Route path="/">
  {user ? (
    <PostAuthRouter
      projects={projects}
      isLoading={isLoadingOp('projects')}
      onSignOut={() => void signOutUser()}
    />
  ) : (
    <SignIn
      onSignInWithGoogle={() => void signInWithGoogle()}
      isSigningIn={isLoadingOp('sign-in')}
      error={errors.get('auth')}
    />
  )}
</Route>
```

Import `SignIn` and `PostAuthRouter`.

**TDD Step 4: Verify all tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 5: Run full test suite and typecheck**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test && pnpm typecheck
```

**TDD Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "Wire sign-in screen and post-auth routing into App at / route"
```

---

### Task 4.5: Add theme toggle to sidebar footer

Wire the `useTheme()` hook into the sidebar user footer area. Add a button that cycles through the 3 theme states.

**Files:**

- Modify: `packages/web/src/Sidebar.tsx` — add theme toggle button
- Modify: `packages/web/src/App.tsx` — pass theme props to Sidebar (or Sidebar calls useTheme directly)

**TDD Step 1: Write failing test**

Add to `packages/web/src/App.test.tsx` or create a new `packages/web/src/Sidebar.test.tsx`:

Since the Sidebar is currently tested indirectly through App.test.tsx, and the theme toggle is a simple button, add a test:

```tsx
it('renders a theme toggle button in the sidebar', async () => {
  window.history.pushState({}, '', '/chat/project-123');

  render(<Router><App /></Router>);

  await waitFor(() => {
    expect(api.listProjectChannels).toHaveBeenCalled();
  });

  const themeButton = screen.getByRole('button', { name: /theme/i });
  expect(themeButton).toBeTruthy();
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 3: Implement**

In `packages/web/src/Sidebar.tsx`, add theme props and render the toggle:

```tsx
// Add to SidebarProps:
themePreference: 'light' | 'dark' | 'system';
onCycleTheme: () => void;

// In the sidebar-actions div, add:
<Button variant="ghost" size="sm" onClick={onCycleTheme} aria-label="Toggle theme">
  {themePreference === 'light' ? '☀️' : themePreference === 'dark' ? '🌙' : '💻'}
</Button>
```

In `App.tsx`, call `useTheme()` and pass the props:

```tsx
const { preference: themePreference, cycle: cycleTheme } = useTheme();

// Pass to Sidebar:
themePreference={themePreference}
onCycleTheme={cycleTheme}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/Sidebar.tsx packages/web/src/App.tsx
git commit -m "Add theme toggle button to sidebar footer"
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

---

## File Summary

### New files created

| File | Purpose |
|------|---------|
| `packages/web/src/useTheme.ts` | Theme preference hook (3-state cycle, localStorage, data-theme attribute) |
| `packages/web/src/useTheme.test.ts` | Tests for useTheme |
| `packages/web/src/theme.test.ts` | Tests for light mode CSS token existence |
| `packages/web/src/router.tsx` | Minimal component-based router (Router, Route, useRoute, navigate) |
| `packages/web/src/router.test.tsx` | Tests for router |
| `packages/web/src/layout.test.ts` | Tests for layout shell CSS structure |
| `packages/web/src/AdminConsole.tsx` | Extracted admin console component |
| `packages/web/src/SignIn.tsx` | Google sign-in screen |
| `packages/web/src/SignIn.test.tsx` | Tests for sign-in screen |
| `packages/web/src/PostAuthRouter.tsx` | Post-auth smart routing (0/1/2+ projects) |
| `packages/web/src/PostAuthRouter.test.tsx` | Tests for post-auth routing |

### Files modified

| File | Changes |
|------|---------|
| `packages/ui/src/styles.css` | Add `:root[data-theme="light"]` token block |
| `packages/web/src/styles.css` | Light mode gradient, sign-in screen CSS, 2/3-column layout shell with transitions |
| `packages/web/src/App.tsx` | Remove manual routing; use Router/Route; wire SignIn, PostAuthRouter, useTheme |
| `packages/web/src/App.test.tsx` | Wrap renders in `<Router>`, add sign-in and routing tests |
| `packages/web/src/main.tsx` | Wrap `<App>` in `<Router>` |
| `packages/web/src/Sidebar.tsx` | Add theme toggle button |

### Files NOT modified (left for future phases)

| File | Reason |
|------|--------|
| `packages/web/src/ChannelFeed.tsx` | Thread index compression is Phase 11b (component work) |
| `packages/web/src/ThreadDrawer.tsx` | Thread detail redesign is Phase 11b |
| `packages/web/src/api.ts` | No API changes needed for foundation |
| `packages/web/src/firebase.ts` | Auth functions are already correct |
