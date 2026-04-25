# ABOUTME: Implementation plan for adding light mode theming to Mastra Mindspace
# ABOUTME: Covers OKLCH token inversion, system preference detection, useTheme hook, and toggle button

# Phase 11k: Light Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Assigned**: Claude + Remy
**Priority**: Medium
**Estimated Effort**: 1 focused session
**Dependencies**: Phase 11a (Foundation) — minimal. Phase 11b (Sidebar) — for toggle button placement only; hook and CSS can be built first.

**Goal:** Add light mode support to the Mastra Mindspace frontend. Users can choose light, dark, or system-matched theming via a 3-state cycle toggle. All existing UI automatically adapts because components already use semantic CSS custom properties.

**Architecture:** The token layer in `packages/ui/src/styles.css` defines every semantic color as an OKLCH value. Light mode adds a `:root[data-theme="light"]` block that flips the lightness channel for each token. A `@media (prefers-color-scheme: light)` block handles users without a manual preference. A small `useTheme` hook manages localStorage persistence and the `data-theme` attribute. The toggle button goes in the sidebar user footer.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Vitest + @testing-library/react, `@mastra-mindspace/ui` design system, OKLCH color space.

---

## Codebase Investigation Findings

### Token inventory (dark mode — current `:root` in `packages/ui/src/styles.css`)

| Token | Dark value |
|-------|-----------|
| `--background` | `oklch(0.13 0.008 248)` |
| `--foreground` | `oklch(0.95 0.008 60)` |
| `--card` | `oklch(0.17 0.008 248)` |
| `--card-foreground` | `oklch(0.95 0.008 60)` |
| `--primary` | `oklch(0.75 0.14 55)` |
| `--primary-foreground` | `oklch(0.13 0.008 248)` |
| `--secondary` | `oklch(0.22 0.006 248)` |
| `--secondary-foreground` | `oklch(0.85 0.006 60)` |
| `--muted` | `oklch(0.20 0.005 248)` |
| `--muted-foreground` | `oklch(0.62 0.008 60)` |
| `--accent` | `oklch(0.70 0.14 55)` |
| `--accent-foreground` | `oklch(0.13 0.008 248)` |
| `--destructive` | `oklch(0.55 0.22 25)` |
| `--destructive-foreground` | `oklch(0.97 0.008 60)` |
| `--border` | `oklch(0.26 0.006 248)` |
| `--input` | `oklch(0.19 0.008 248)` |
| `--ring` | `oklch(0.75 0.14 55)` |
| `--sidebar` | `oklch(0.11 0.008 248)` |
| `--sidebar-foreground` | `oklch(0.95 0.008 60)` |
| `--sidebar-border` | `oklch(0.20 0.005 248)` |

### Hardcoded color issues found

1. **`packages/web/src/styles.css`** — body gradient uses raw OKLCH values: `oklch(0.55 0.22 250 / 0.18)` and `oklch(0.75 0.14 55 / 0.14)`. These need light-mode overrides.
2. **`packages/web/src/styles.css`** — hover states use `rgba(255, 255, 255, 0.05)` which will be nearly invisible on light backgrounds. Needs light-mode override.
3. **`packages/web/src/InlineError.tsx`** — three inline `oklch()` style values for error text, background, and border. These work acceptably in both modes (red on any background) but should be validated visually.
4. **`packages/web/src/styles.css`** — multiple `oklch(from var(--primary) l c h / <alpha>)` relative-color calls. These derive from `--primary` and will automatically adapt when `--primary` changes — no action needed.
5. **`packages/web/src/styles.css`** — `oklch(from var(--background) l c h / 0.88)` and `oklch(from var(--card) l c h / 0.88)` — these derive from tokens and auto-adapt, but the 0.88 opacity should bump to 0.92 in light mode per design doc.

### Component audit — all clean

All UI components (Button, Card, Badge, Input, Textarea) use only semantic Tailwind classes (`bg-primary`, `text-foreground`, `border-border`, etc.). No hardcoded color values. They will adapt automatically once tokens are flipped.

### Tailwind v4 `@theme inline` — no changes needed

The `@theme inline` block maps `--color-*` aliases to `var(--*)` CSS custom properties. Since light mode changes the underlying custom property values (not the alias mapping), no `@theme` changes are required.

---

## Success Criteria

- [ ] `:root[data-theme="light"]` block defines light-mode values for all 20 semantic tokens
- [ ] `@media (prefers-color-scheme: light)` applies light tokens when no manual preference is set
- [ ] Body gradient opacity reduced in light mode (18%/14% -> 6%/4%)
- [ ] Backdrop blur opacity adjusted in light mode (0.88 -> 0.92)
- [ ] Cards get subtle box-shadow in light mode
- [ ] Hover states use appropriate alpha for light backgrounds
- [ ] `useTheme` hook reads/writes localStorage, sets `data-theme` attribute, exposes `cycleTheme()`
- [ ] Toggle button renders correct icon for current theme state
- [ ] Theme persists across page reloads
- [ ] System preference is respected when no manual override exists
- [ ] All existing tests continue to pass
- [ ] New tests cover `useTheme` hook behavior
- [ ] `pnpm typecheck` passes across all packages

---

## Recommended Sequencing

Execute these phases in order. Each phase is independently shippable.

1. **Phase 1: Light Mode Token Block** — CSS-only change in `packages/ui/src/styles.css`
2. **Phase 2: System Preference Detection** — `@media` query in `packages/ui/src/styles.css`
3. **Phase 3: App-Level Light Mode Adjustments** — Gradient, backdrop, shadow, hover overrides in `packages/web/src/styles.css`
4. **Phase 4: useTheme Hook** — React hook with localStorage + DOM attribute management
5. **Phase 5: Toggle Button** — Sidebar footer icon button

---

## Phase 1: Light Mode Token Block

### Task 1.1: Add `:root[data-theme="light"]` CSS block with all light-mode tokens

Every dark-mode OKLCH token must have a light-mode counterpart. The strategy:
- Background/surface tokens: flip lightness from low (0.11-0.22) to high (0.93-0.99)
- Foreground/text tokens: flip lightness from high (0.62-0.97) to low (0.15-0.45)
- Primary/accent: deepen (0.75 -> 0.55, increase chroma 0.14 -> 0.18) for WCAG AA on light backgrounds
- Destructive: shift lightness down (0.55 -> 0.45) for contrast on light backgrounds
- Hue channels (248 for blues, 55 for warm, 25 for red) stay the same

**Files:**

- Modify: `packages/ui/src/styles.css`

**Step 1: Write a failing test**

This is a CSS-only change. There is no unit test to write — verification is visual and via the useTheme hook tests in Phase 4. Skip to step 3.

**Step 2: (skipped)**

**Step 3: Add the light-mode token block**

In `packages/ui/src/styles.css`, immediately after the closing `}` of the `:root` block (after line 69), add:

```css
:root[data-theme="light"] {
  color-scheme: light;

  --background:             oklch(0.97 0.005 60);
  --foreground:             oklch(0.15 0.008 248);
  --card:                   oklch(0.99 0.003 60);
  --card-foreground:        oklch(0.15 0.008 248);
  --primary:                oklch(0.55 0.18 55);
  --primary-foreground:     oklch(0.99 0.005 60);
  --secondary:              oklch(0.93 0.006 60);
  --secondary-foreground:   oklch(0.25 0.006 248);
  --muted:                  oklch(0.94 0.004 60);
  --muted-foreground:       oklch(0.45 0.008 248);
  --accent:                 oklch(0.50 0.18 55);
  --accent-foreground:      oklch(0.99 0.005 60);
  --destructive:            oklch(0.45 0.22 25);
  --destructive-foreground: oklch(0.99 0.005 60);
  --border:                 oklch(0.85 0.006 60);
  --input:                  oklch(0.96 0.004 60);
  --ring:                   oklch(0.55 0.18 55);
  --sidebar:                oklch(0.95 0.005 60);
  --sidebar-foreground:     oklch(0.15 0.008 248);
  --sidebar-border:         oklch(0.88 0.004 60);
}
```

**Token-by-token rationale:**

| Token | Dark L | Light L | Notes |
|-------|--------|---------|-------|
| `--background` | 0.13 | 0.97 | Near-white, slight warm tint. Chroma reduced to 0.005 to avoid visible tinting at high lightness. |
| `--foreground` | 0.95 | 0.15 | Near-black text on near-white background. Same chroma/hue as dark `--background`. |
| `--card` | 0.17 | 0.99 | Slightly brighter than background to create card lift. |
| `--card-foreground` | 0.95 | 0.15 | Matches `--foreground`. |
| `--primary` | 0.75 | 0.55 | Deepened for WCAG AA (4.5:1) on light background per design doc. Chroma boosted 0.14->0.18 to maintain vibrancy at lower lightness. |
| `--primary-foreground` | 0.13 | 0.99 | Light text on deep primary buttons. |
| `--secondary` | 0.22 | 0.93 | Light gray surface. |
| `--secondary-foreground` | 0.85 | 0.25 | Dark text on light gray. |
| `--muted` | 0.20 | 0.94 | Slightly darker than secondary for muted surfaces. |
| `--muted-foreground` | 0.62 | 0.45 | De-emphasized text; must still be readable (>3:1 on 0.97 bg). |
| `--accent` | 0.70 | 0.50 | Slightly deeper than primary for accent differentiation. |
| `--accent-foreground` | 0.13 | 0.99 | Light text on accent surfaces. |
| `--destructive` | 0.55 | 0.45 | Deeper red for contrast on light backgrounds. |
| `--destructive-foreground` | 0.97 | 0.99 | White text on red. |
| `--border` | 0.26 | 0.85 | Subtle gray border visible against 0.97 background. |
| `--input` | 0.19 | 0.96 | Slightly recessed from background. |
| `--ring` | 0.75 | 0.55 | Matches primary for focus rings. |
| `--sidebar` | 0.11 | 0.95 | Sidebar slightly darker than main content in light mode. |
| `--sidebar-foreground` | 0.95 | 0.15 | Matches foreground. |
| `--sidebar-border` | 0.20 | 0.88 | Slightly more visible than main border. |

**Step 4: Verify**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/ui typecheck
```

**Step 5: Commit**

```
git add packages/ui/src/styles.css
git commit -m "Add light mode OKLCH token block to design system"
```

---

## Phase 2: System Preference Detection

### Task 2.1: Add `@media (prefers-color-scheme: light)` fallback

When no manual `data-theme` attribute is set, the system preference should be respected. This block must have **lower specificity** than `:root[data-theme="light"]` so manual overrides win.

**Files:**

- Modify: `packages/ui/src/styles.css`

**Step 1: Write a failing test**

CSS-only change. Skip to step 3.

**Step 2: (skipped)**

**Step 3: Add the system-preference media query**

In `packages/ui/src/styles.css`, immediately after the `:root[data-theme="light"]` block from Phase 1, add:

```css
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    color-scheme: light;

    --background:             oklch(0.97 0.005 60);
    --foreground:             oklch(0.15 0.008 248);
    --card:                   oklch(0.99 0.003 60);
    --card-foreground:        oklch(0.15 0.008 248);
    --primary:                oklch(0.55 0.18 55);
    --primary-foreground:     oklch(0.99 0.005 60);
    --secondary:              oklch(0.93 0.006 60);
    --secondary-foreground:   oklch(0.25 0.006 248);
    --muted:                  oklch(0.94 0.004 60);
    --muted-foreground:       oklch(0.45 0.008 248);
    --accent:                 oklch(0.50 0.18 55);
    --accent-foreground:      oklch(0.99 0.005 60);
    --destructive:            oklch(0.45 0.22 25);
    --destructive-foreground: oklch(0.99 0.005 60);
    --border:                 oklch(0.85 0.006 60);
    --input:                  oklch(0.96 0.004 60);
    --ring:                   oklch(0.55 0.18 55);
    --sidebar:                oklch(0.95 0.005 60);
    --sidebar-foreground:     oklch(0.15 0.008 248);
    --sidebar-border:         oklch(0.88 0.004 60);
  }
}
```

**Why `:root:not([data-theme])`:** When a user manually sets a theme via the toggle (Phase 4), the hook sets `data-theme="light"` or `data-theme="dark"`. The `:not([data-theme])` selector ensures this media query only applies when no manual preference exists. When the user selects "system" mode, the hook *removes* the `data-theme` attribute entirely, allowing this media query to take effect.

**Step 4: Verify**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/ui typecheck
```

**Step 5: Commit**

```
git add packages/ui/src/styles.css
git commit -m "Add system preference detection for light mode"
```

---

## Phase 3: App-Level Light Mode Adjustments

### Task 3.1: Override body gradient, backdrop, hover, and card shadows for light mode

Several values in `packages/web/src/styles.css` use hardcoded colors or opacities that need light-mode treatment.

**Files:**

- Modify: `packages/web/src/styles.css`

**Step 1: Write a failing test**

CSS-only change. Skip to step 3.

**Step 2: (skipped)**

**Step 3: Add light-mode overrides**

At the end of `packages/web/src/styles.css` (before the responsive `@media` blocks), add a light-mode section:

```css
/* ─── Light mode adjustments ────────────────────────────────────────────── */
:root[data-theme="light"] body,
:root:not([data-theme]) body {
  /* Reduced gradient opacity for light backgrounds */
  background:
    radial-gradient(circle at top left,  oklch(0.55 0.22 250 / 0.06), transparent 28%),
    radial-gradient(circle at bottom right, oklch(0.75 0.14 55 / 0.04), transparent 26%),
    var(--background);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) body {
    /* Restore dark gradient when system prefers dark and no manual override */
    background:
      radial-gradient(circle at top left,  oklch(0.55 0.22 250 / 0.18), transparent 28%),
      radial-gradient(circle at bottom right, oklch(0.75 0.14 55 / 0.14), transparent 26%),
      var(--background);
  }
}

:root[data-theme="light"] .channel-feed,
:root:not([data-theme]) .channel-feed {
  background: oklch(from var(--background) l c h / 0.92);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) .channel-feed {
    background: oklch(from var(--background) l c h / 0.88);
  }
}

:root[data-theme="light"] .panel,
:root:not([data-theme]) .panel {
  background: oklch(from var(--card) l c h / 0.92);
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.08), 0 1px 2px oklch(0 0 0 / 0.04);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) .panel {
    background: oklch(from var(--card) l c h / 0.88);
    box-shadow: none;
  }
}

/* Card components get subtle shadows in light mode */
:root[data-theme="light"] .rounded-\[--radius-lg\] {
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.03);
}

/* Hover states: white overlay doesn't work on light backgrounds */
:root[data-theme="light"] .mindspace-button:hover:not(:disabled),
:root[data-theme="light"] .channel-button:hover:not(:disabled) {
  background: oklch(0 0 0 / 0.05);
}
```

**Note on the `:root:not([data-theme])` selectors:** These duplicate the light-mode overrides for system-preference users. The `@media (prefers-color-scheme: dark)` blocks inside restore dark-mode behavior. This is verbose but correct — CSS doesn't support "if system is light AND no data-theme" nesting without this pattern. An alternative would be to only apply these via the hook (always set `data-theme`), which would simplify the CSS significantly. **Discuss with Remy** whether the CSS-only system preference approach is worth the duplication, or whether the hook should always resolve and set `data-theme` on page load — making the `@media` queries unnecessary.

**Step 4: Verify**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/web typecheck
```

**Step 5: Commit**

```
git add packages/web/src/styles.css
git commit -m "Add light mode gradient, backdrop, and shadow overrides"
```

---

## Phase 4: useTheme Hook

### Task 4.1: Create `useTheme` hook with localStorage persistence and DOM attribute management

**Files:**

- Create: `packages/ui/src/hooks/use-theme.ts`
- Modify: `packages/ui/src/index.ts` (add export)
- Create: `packages/ui/src/hooks/use-theme.test.ts`

**Step 1: Write a failing test**

Create `packages/ui/src/hooks/use-theme.test.ts`:

```ts
// ABOUTME: Tests for the useTheme hook
// ABOUTME: Validates localStorage persistence, DOM attribute management, and theme cycling

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTheme } from './use-theme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to "system" when no localStorage value exists', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
  });

  it('reads stored preference from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('dark');
  });

  it('sets data-theme="dark" when preference is "dark"', () => {
    localStorage.setItem('theme', 'dark');
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('sets data-theme="light" when preference is "light"', () => {
    localStorage.setItem('theme', 'light');
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('removes data-theme attribute when preference is "system"', () => {
    document.documentElement.dataset.theme = 'dark';
    renderHook(() => useTheme());
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('cycles light -> dark -> system -> light', () => {
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useTheme());

    act(() => result.current.cycleTheme());
    expect(result.current.preference).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => result.current.cycleTheme());
    expect(result.current.preference).toBe('system');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    act(() => result.current.cycleTheme());
    expect(result.current.preference).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('resolvedTheme reflects system preference when in system mode', () => {
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('matchMedia', matchMediaMock);

    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');

    vi.unstubAllGlobals();
  });

  it('resolvedTheme is "dark" when system prefers dark', () => {
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('matchMedia', matchMediaMock);

    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('dark');

    vi.unstubAllGlobals();
  });

  it('resolvedTheme matches explicit preference when not system', () => {
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('light');
  });
});
```

**Step 2: Run the test — confirm it fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/ui exec vitest run src/hooks/use-theme.test.ts
```

Expected: module not found error since `use-theme.ts` doesn't exist yet.

**Step 3: Implement the hook**

Create `packages/ui/src/hooks/use-theme.ts`:

```ts
// ABOUTME: React hook for managing light/dark/system theme preference
// ABOUTME: Persists to localStorage, sets data-theme attribute on document root

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';
const CYCLE_ORDER: ThemePreference[] = ['light', 'dark', 'system'];

function getStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable */
  }
  return 'system';
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function applyThemeToDOM(preference: ThemePreference): void {
  if (preference === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = preference;
  }
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredPreference);

  useEffect(() => {
    applyThemeToDOM(preference);
  }, [preference]);

  const cycleTheme = useCallback(() => {
    setPreference((current) => {
      const idx = CYCLE_ORDER.indexOf(current);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];

      if (next === 'system') {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      } else {
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
      }

      return next;
    });
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    preference === 'system' ? getSystemTheme() : preference;

  return { preference, resolvedTheme, cycleTheme } as const;
}
```

**Step 4: Export from package index**

In `packages/ui/src/index.ts`, add at the end:

```ts
export { useTheme } from './hooks/use-theme';
export type { ThemePreference } from './hooks/use-theme';
```

**Step 5: Run tests — confirm they pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/ui exec vitest run src/hooks/use-theme.test.ts
```

**Step 6: Typecheck**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/ui typecheck
```

**Step 7: Commit**

```
git add packages/ui/src/hooks/use-theme.ts packages/ui/src/hooks/use-theme.test.ts packages/ui/src/index.ts
git commit -m "Add useTheme hook with localStorage persistence and cycling"
```

---

## Phase 5: Toggle Button

### Task 5.1: Add theme toggle button to sidebar user footer

**Depends on:** Phase 11b (Sidebar) for the sidebar user footer component. If the sidebar hasn't been componentized yet, this button can be added to whatever element currently represents the sidebar footer.

**Files:**

- Create: `packages/web/src/components/ThemeToggle.tsx`
- Modify: whichever file renders the sidebar footer (likely `packages/web/src/components/Sidebar.tsx` or `packages/web/src/App.tsx`)

**Step 1: Write a failing test**

Create `packages/web/src/components/ThemeToggle.test.tsx` (or in `packages/ui` if the component lives there):

```tsx
// ABOUTME: Tests for the ThemeToggle button component
// ABOUTME: Validates icon rendering and cycling behavior

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders a button', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /theme/i })).toBeDefined();
  });

  it('shows system icon by default', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /theme/i });
    expect(btn.textContent).toContain('system');
  });

  it('cycles through themes on click', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /theme/i });

    // system -> light
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe('light');

    // light -> dark
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe('dark');

    // dark -> system
    await user.click(btn);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
```

**Step 2: Run the test — confirm it fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/web exec vitest run src/components/ThemeToggle.test.tsx
```

**Note:** The `packages/web` package may not have a vitest config with jsdom. If so, add a minimal `vitest.config.ts` to `packages/web` first (matching the `packages/ui` config pattern), or move this component and test into `packages/ui`.

**Step 3: Implement the toggle component**

Create `packages/web/src/components/ThemeToggle.tsx`:

```tsx
// ABOUTME: Theme toggle button cycling through light, dark, and system modes
// ABOUTME: Renders in the sidebar user footer

import { useTheme, type ThemePreference } from '@mastra-mindspace/ui';
import { Button } from '@mastra-mindspace/ui';

const ICONS: Record<ThemePreference, string> = {
  light: '\u2600\uFE0F',   // sun
  dark: '\uD83C\uDF19',    // crescent moon
  system: '\uD83D\uDCBB',  // laptop
};

const LABELS: Record<ThemePreference, string> = {
  light: 'Theme: light',
  dark: 'Theme: dark',
  system: 'Theme: system',
};

export function ThemeToggle() {
  const { preference, cycleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={LABELS[preference]}
      title={LABELS[preference]}
    >
      {ICONS[preference]}
    </Button>
  );
}
```

**Step 4: Wire into sidebar footer**

Find the sidebar footer rendering location. Add `<ThemeToggle />` next to the sign-out button. The exact integration depends on whether Phase 11b (Sidebar component extraction) is complete.

If sidebar is still in `App.tsx`, add inside the `.sidebar-actions` div:

```tsx
import { ThemeToggle } from './components/ThemeToggle';

// Inside the sidebar-actions div:
<div className="sidebar-actions">
  <ThemeToggle />
  {/* existing sign out button */}
</div>
```

**Step 5: Run tests — confirm they pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/web exec vitest run src/components/ThemeToggle.test.tsx
```

**Step 6: Typecheck both packages**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/ui typecheck && pnpm --filter @mastra-mindspace/web typecheck
```

**Step 7: Commit**

```
git add packages/web/src/components/ThemeToggle.tsx packages/web/src/components/ThemeToggle.test.tsx
git commit -m "Add theme toggle button to sidebar footer"
```

---

## Open Questions for Remy

1. **CSS duplication vs hook-only approach:** The system-preference CSS approach (Phase 2 + Phase 3) requires duplicating every light-mode override inside both `:root[data-theme="light"]` and `@media (prefers-color-scheme: light) { :root:not([data-theme]) }`. An alternative: have `useTheme` always resolve and set `data-theme` on mount (even in "system" mode, it would set `data-theme="light"` or `data-theme="dark"` based on `matchMedia`). This eliminates all `@media` CSS blocks and the `:root:not([data-theme])` selectors. Downside: brief flash of unstyled content before React hydrates. Preference?

2. **InlineError.tsx hardcoded colors:** The `InlineError` component uses inline style OKLCH values. These are all red-spectrum (`hue: 25`) and should read acceptably on both light and dark backgrounds — but should they be refactored to use destructive tokens? That feels like separate scope.

3. **Toggle button placement:** The design doc specifies sidebar user footer. If Phase 11b (Sidebar extraction) isn't done yet, should the toggle go directly into `App.tsx`'s sidebar section, or should we wait?

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OKLCH lightness values don't produce good contrast ratios | Medium | Medium | Manual WCAG AA verification of primary (0.55) on background (0.97) before shipping. Use browser devtools contrast checker. |
| Flash of dark theme before React hydrates on system-light users | Medium | Low | Add a `<script>` tag in `index.html` that reads localStorage and sets `data-theme` before first paint (optional enhancement, not in this plan). |
| `rgba(255, 255, 255, 0.05)` hover states invisible in light mode | High | Low | Phase 3 overrides these with `oklch(0 0 0 / 0.05)`. |
| Relative-color `oklch(from var(--primary) l c h / alpha)` values may look wrong with deeper primary | Low | Low | These alpha overlays will be more subtle with the deeper primary, which is correct behavior. |
