# ABOUTME: Implementation plan for Phase 11b — Sidebar & Navigation rebuild
# ABOUTME: Covers project switcher, channels, minds, teammates, user footer, and sidebar collapse

# Phase 11b: Sidebar & Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: Phase 11a (Foundation) provides: working router with `/chat/:projectId`, auth state (user object), layout shell with sidebar slot, theme toggle hook (`useTheme()`).

**Goal:** Replace the current flat-list sidebar with the target navigation architecture: a project switcher dropdown, hero channel list with inline creation, minds and teammates awareness sections, a user footer with sign-out and theme toggle, and responsive sidebar collapse to an icon rail on medium screens.

**Architecture:** Build bottom-up from data types and API functions, through presentational sub-components, up to the composed Sidebar. Each task is independently testable. The existing `Sidebar.tsx` is rewritten in place (same file path, same import in `App.tsx`), so no routing or layout changes are needed.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Vitest + @testing-library/react, `@mastra-mindspace/ui` design system (Button, Card, Badge, Input, Textarea, ScrollArea, Spinner, cn()). CSS custom properties from `packages/ui/src/styles.css`.

---

## Current State Summary

The existing `Sidebar.tsx` (`packages/web/src/Sidebar.tsx`) is a flat list of all projects. The active project expands to show its channels nested under it with a left-border indentation. Channel creation is an always-visible input + button. There is no project switcher, no minds section, no teammates section, no user footer, and no responsive collapse.

### Key gaps between current and target

| Area | Current | Target |
|------|---------|--------|
| Project selection | All projects listed as buttons, active one highlighted | Dropdown switcher at top, one project visible, overlay for switching |
| Channel list | Nested under active project with left-border | Top-level hero section, `#` prefix, `+ Add channel` as collapsible text link |
| Minds | Not shown | Section listing AI persona minds with emoji avatar, accent ring, presence |
| Teammates | Not shown | Section listing human project members with initials avatar, presence |
| User footer | "Admin Console" + "Sign out" buttons | Current user identity, sign out link, theme toggle |
| Responsive | No collapse behavior | 48px icon rail at 768-1100px, floating overlay on hover/click |
| API data | `listAccessibleProjects`, `listProjectChannels` | Needs `listProjectMembers`, `listProjectMinds` (or stubs) |

### Backend API gaps

The backend currently has NO endpoints for listing project members or minds. The routes file (`packages/app/src/routes/projects.ts`) only has a stub `GET /:projectId/mindspace`. The `getMe` endpoint returns `{ uid, email, emailVerified, name }`.

**Decision needed from Remy:** For v1, we can either:
- (A) Add backend endpoints for members/minds and consume them
- (B) Stub the data on the frontend with hardcoded placeholder data, and wire real endpoints later

This plan assumes **(B) — frontend stubs** — since Phase 11b is a frontend-only phase. Each section notes where real API calls will replace stubs. The stub types and data are isolated in a single file (`packages/web/src/sidebar-stubs.ts`) for easy removal later.

---

## Success Criteria

- [ ] Project switcher dropdown at sidebar top shows active project name + slug
- [ ] Clicking dropdown opens overlay with search, active/archived grouping, project list
- [ ] Selecting a project navigates to `/chat/:projectId` and closes overlay
- [ ] Gear icon in project switcher is present (no-op click for v1)
- [ ] `+ Create project` hidden for non-admin users
- [ ] Channels section shows channels with `#` prefix, selected channel highlighted
- [ ] `+ Add channel` is a text link that expands inline into input + button on click
- [ ] After channel creation, input collapses back to text link
- [ ] Minds section shows stub mind data with emoji avatar + accent ring + presence dot
- [ ] Clicking a mind is a no-op for v1
- [ ] Teammates section shows stub teammate data with initials avatar + presence dot
- [ ] User footer shows current user identity pinned at bottom
- [ ] Sign out link in footer works
- [ ] Theme toggle (3-state cycle) in footer works
- [ ] Sidebar collapses to 48px icon rail at 768-1100px viewport width
- [ ] Hovering/clicking collapsed sidebar expands as floating overlay
- [ ] All existing tests continue to pass
- [ ] New tests cover each new behavior
- [ ] `pnpm typecheck` passes across all packages

---

## Recommended Sequencing

Execute these tasks in order. Each task is independently committable.

1. **Task 1: Sidebar data types and stubs** — Types + stub data for minds and teammates
2. **Task 2: Avatar component** — Shared presentational component for initials and emoji avatars
3. **Task 3: Project switcher** — Dropdown trigger + overlay with search and project list
4. **Task 4: Channel list refactor** — Hero channel section with collapsible `+ Add channel`
5. **Task 5: Minds section** — Mind list with emoji avatars and presence dots
6. **Task 6: Teammates section** — Teammate list with initials avatars and presence dots
7. **Task 7: User footer** — Current user identity, sign out, theme toggle
8. **Task 8: Composed Sidebar** — Assemble all sections, update props, wire to App.tsx
9. **Task 9: Sidebar collapse** — Responsive icon rail at 768-1100px with hover overlay
10. **Task 10: Integration tests** — End-to-end sidebar behavior tests in App.test.tsx

---

## Task 1: Sidebar Data Types and Stubs

### Goal
Define TypeScript types for minds and teammates that the sidebar sections will consume. Provide stub data until backend endpoints exist.

### TDD Steps

1. Write a test that imports the types and stub data, and asserts shape
2. Run test — fails (file doesn't exist)
3. Create the file with types and stubs
4. Run test — passes

### Files

**Create:** `packages/web/src/sidebar-stubs.ts`
**Create:** `packages/web/src/sidebar-stubs.test.ts`

### Test: `packages/web/src/sidebar-stubs.test.ts`

```typescript
// ABOUTME: Tests that sidebar stub data conforms to expected types
// ABOUTME: Guards against accidental shape changes in placeholder data

import { describe, expect, it } from 'vitest';

import { STUB_MINDS, STUB_TEAMMATES, type MindSummary, type TeammateSummary } from './sidebar-stubs';

describe('sidebar stubs', () => {
  it('provides mind summaries with required fields', () => {
    expect(STUB_MINDS.length).toBeGreaterThan(0);

    for (const mind of STUB_MINDS) {
      const typed: MindSummary = mind;
      expect(typed.id).toBeTruthy();
      expect(typed.name).toBeTruthy();
      expect(typed.icon).toBeTruthy();
      expect(['online', 'offline']).toContain(typed.presence);
    }
  });

  it('provides teammate summaries with required fields', () => {
    expect(STUB_TEAMMATES.length).toBeGreaterThan(0);

    for (const teammate of STUB_TEAMMATES) {
      const typed: TeammateSummary = teammate;
      expect(typed.id).toBeTruthy();
      expect(typed.displayName).toBeTruthy();
      expect(typed.initials).toBeTruthy();
      expect(typed.initials).toHaveLength(2);
      expect(['online', 'offline']).toContain(typed.presence);
    }
  });
});
```

### Implementation: `packages/web/src/sidebar-stubs.ts`

```typescript
// ABOUTME: Placeholder data for sidebar sections that lack backend endpoints
// ABOUTME: Replace with real API calls when member/mind list endpoints ship

export type MindSummary = {
  id: string;
  name: string;
  icon: string;
  presence: 'online' | 'offline';
};

export type TeammateSummary = {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  presence: 'online' | 'offline';
};

export const STUB_MINDS: MindSummary[] = [
  { id: 'mind-librarian', name: 'Librarian', icon: '\u{1F4DA}', presence: 'online' },
  { id: 'mind-claude', name: 'Claude', icon: '\u{1F916}', presence: 'online' },
];

export const STUB_TEAMMATES: TeammateSummary[] = [
  { id: 'teammate-1', displayName: 'Alice Chen', initials: 'AC', email: 'alice@example.com', presence: 'online' },
  { id: 'teammate-2', displayName: 'Bob Martinez', initials: 'BM', email: 'bob@example.com', presence: 'offline' },
];
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/sidebar-stubs.test.ts
```

---

## Task 2: Avatar Component

### Goal
Create a shared `Avatar` component used by minds, teammates, and the user footer. Supports two modes: initials (2-letter text on colored circle) and icon (emoji on accent-ringed circle).

### TDD Steps

1. Write rendering tests for both avatar modes
2. Run tests — fail (component doesn't exist)
3. Create the component
4. Run tests — pass

### Files

**Create:** `packages/web/src/Avatar.tsx`
**Create:** `packages/web/src/Avatar.test.tsx`

### Test: `packages/web/src/Avatar.test.tsx`

```typescript
// ABOUTME: Tests for the Avatar component covering initials and icon modes
// ABOUTME: Verifies rendering, accessibility, and accent ring presence

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  afterEach(cleanup);

  it('renders initials text for the initials variant', () => {
    render(<Avatar variant="initials" text="AC" />);

    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('renders emoji for the icon variant', () => {
    render(<Avatar variant="icon" text="\u{1F916}" />);

    expect(screen.getByText('\u{1F916}')).toBeTruthy();
  });

  it('applies accent ring class for the icon variant', () => {
    render(<Avatar variant="icon" text="\u{1F4DA}" />);

    const avatar = screen.getByText('\u{1F4DA}').closest('.avatar');
    expect(avatar?.classList.contains('avatar-accent-ring')).toBe(true);
  });

  it('does not apply accent ring for the initials variant', () => {
    render(<Avatar variant="initials" text="BM" />);

    const avatar = screen.getByText('BM').closest('.avatar');
    expect(avatar?.classList.contains('avatar-accent-ring')).toBe(false);
  });

  it('supports a size prop', () => {
    render(<Avatar variant="initials" text="AC" size="sm" />);

    const avatar = screen.getByText('AC').closest('.avatar');
    expect(avatar?.classList.contains('avatar-sm')).toBe(true);
  });
});
```

### Implementation: `packages/web/src/Avatar.tsx`

```tsx
// ABOUTME: Renders a circular avatar with initials text or an emoji icon
// ABOUTME: Icon variant gets an accent-colored ring to distinguish AI minds

export type AvatarProps = {
  variant: 'initials' | 'icon';
  text: string;
  size?: 'sm' | 'md';
};

export function Avatar({ variant, text, size = 'md' }: AvatarProps) {
  const classes = [
    'avatar',
    `avatar-${size}`,
    variant === 'icon' ? 'avatar-accent-ring' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} aria-hidden="true">
      {text}
    </span>
  );
}
```

### CSS additions to `packages/web/src/styles.css`

Add the following in the `/* --- Sidebar ---*/` section:

```css
/* ─── Avatar ────────────────────────────────────────────────────────────── */
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 600;
  font-family: var(--font-heading);
  flex-shrink: 0;
  background: oklch(from var(--primary) l c h / 0.18);
  color: var(--foreground);
}

.avatar-sm {
  width: 1.5rem;
  height: 1.5rem;
  font-size: 0.6rem;
}

.avatar-md {
  width: 2rem;
  height: 2rem;
  font-size: 0.78rem;
}

.avatar-accent-ring {
  box-shadow: 0 0 0 2px var(--primary);
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/Avatar.test.tsx
```

---

## Task 3: Project Switcher

### Goal
Replace the flat project list with a dropdown trigger showing the active project. Clicking opens an overlay with search input, active/archived project grouping, and project selection. Gear icon for settings (no-op). `+ Create project` hidden for non-admin users.

### TDD Steps

1. Write tests: renders active project name, opens overlay on click, filters by search, selects project, shows gear icon, hides create for non-admin
2. Run tests — fail
3. Create `ProjectSwitcher.tsx`
4. Run tests — pass

### Files

**Create:** `packages/web/src/ProjectSwitcher.tsx`
**Create:** `packages/web/src/ProjectSwitcher.test.tsx`

### Test: `packages/web/src/ProjectSwitcher.test.tsx`

```typescript
// ABOUTME: Tests for the project switcher dropdown overlay
// ABOUTME: Covers display, search filtering, project selection, and access control

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccessibleProjectSummary } from './api';
import { ProjectSwitcher } from './ProjectSwitcher';

const PROJECTS: AccessibleProjectSummary[] = [
  { id: 'p1', organizationId: 'org-1', name: 'Acme Engineering', slug: 'acme-eng', status: 'active' },
  { id: 'p2', organizationId: 'org-1', name: 'Q2 Roadmap', slug: 'q2-roadmap', status: 'active' },
  { id: 'p3', organizationId: 'org-1', name: 'Auth Rewrite', slug: 'auth-rewrite', status: 'archived' },
];

describe('ProjectSwitcher', () => {
  afterEach(cleanup);

  it('shows the active project name and slug', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Acme Engineering')).toBeTruthy();
    expect(screen.getByText(/acme-eng/)).toBeTruthy();
  });

  it('opens the project list overlay when the trigger is clicked', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText(/search projects/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));

    expect(screen.getByPlaceholderText(/search projects/i)).toBeTruthy();
  });

  it('filters projects by search text', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    fireEvent.change(screen.getByPlaceholderText(/search projects/i), {
      target: { value: 'road' },
    });

    expect(screen.queryByText('Acme Engineering')).toBeNull();
    expect(screen.getByText('Q2 Roadmap')).toBeTruthy();
  });

  it('groups projects into active and archived sections', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));

    expect(screen.getByText('ACTIVE')).toBeTruthy();
    expect(screen.getByText('ARCHIVED')).toBeTruthy();
    expect(screen.getByText('Auth Rewrite')).toBeTruthy();
  });

  it('calls onSelectProject and closes overlay when a project is clicked', () => {
    const onSelect = vi.fn();

    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={onSelect}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    fireEvent.click(screen.getByText('Q2 Roadmap'));

    expect(onSelect).toHaveBeenCalledWith('p2');
    expect(screen.queryByPlaceholderText(/search projects/i)).toBeNull();
  });

  it('shows a checkmark next to the active project', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));

    const activeItem = screen.getByText('Acme Engineering').closest('[data-project-id]');
    expect(activeItem?.querySelector('.project-switcher-check')).toBeTruthy();
  });

  it('shows gear icon that calls onOpenSettings', () => {
    const onSettings = vi.fn();

    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={onSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /project settings/i }));

    expect(onSettings).toHaveBeenCalled();
  });

  it('hides + Create project for non-admin users', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));

    expect(screen.queryByText(/create project/i)).toBeNull();
  });

  it('shows + Create project for admin users', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={true}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));

    expect(screen.getByText(/create project/i)).toBeTruthy();
  });

  it('closes overlay when clicking outside', () => {
    render(
      <div>
        <ProjectSwitcher
          projects={PROJECTS}
          activeProjectId="p1"
          isAdmin={false}
          onSelectProject={vi.fn()}
          onOpenSettings={vi.fn()}
        />
        <div data-testid="outside">outside</div>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.getByPlaceholderText(/search projects/i)).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(screen.queryByPlaceholderText(/search projects/i)).toBeNull();
  });
});
```

### Implementation: `packages/web/src/ProjectSwitcher.tsx`

```tsx
// ABOUTME: Dropdown project switcher with search, active/archived grouping, and settings gear
// ABOUTME: Shows one active project at a time with overlay for switching

import { useEffect, useRef, useState } from 'react';

import { Input } from '@mastra-mindspace/ui';

import type { AccessibleProjectSummary } from './api';

export type ProjectSwitcherProps = {
  projects: AccessibleProjectSummary[];
  activeProjectId: string;
  isAdmin: boolean;
  onSelectProject: (projectId: string) => void;
  onOpenSettings: () => void;
};

export function ProjectSwitcher({
  projects,
  activeProjectId,
  isAdmin,
  onSelectProject,
  onOpenSettings,
}: ProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const memberCount = projects.length;

  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()),
  );

  const active = filtered.filter((p) => p.status === 'active');
  const archived = filtered.filter((p) => p.status === 'archived');

  function handleSelect(projectId: string) {
    onSelectProject(projectId);
    setIsOpen(false);
    setSearch('');
  }

  return (
    <div className="project-switcher" ref={containerRef}>
      <div className="project-switcher-trigger">
        <button
          className="project-switcher-button"
          aria-label="Switch project"
          onClick={() => {
            setIsOpen(!isOpen);
            setSearch('');
          }}
        >
          <span className="project-switcher-arrow">{isOpen ? '\u25B2' : '\u25BC'}</span>
          <div className="project-switcher-info">
            <span className="project-switcher-name">
              {activeProject?.name ?? 'No project selected'}
            </span>
            <span className="project-switcher-meta">
              {activeProject?.slug ?? ''}{activeProject ? ` \u00B7 ${memberCount} project${memberCount === 1 ? '' : 's'}` : ''}
            </span>
          </div>
        </button>

        <button
          className="project-switcher-gear"
          aria-label="Project settings"
          onClick={onOpenSettings}
        >
          {'\u2699\uFE0F'}
        </button>
      </div>

      {isOpen ? (
        <div className="project-switcher-overlay">
          <div className="project-switcher-search">
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {active.length > 0 ? (
            <div className="project-switcher-group">
              <p className="eyebrow">ACTIVE</p>
              {active.map((p) => (
                <button
                  key={p.id}
                  className="project-switcher-item"
                  data-project-id={p.id}
                  onClick={() => handleSelect(p.id)}
                >
                  <span>{p.name}</span>
                  {p.id === activeProjectId ? (
                    <span className="project-switcher-check">{'\u2713'}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {archived.length > 0 ? (
            <div className="project-switcher-group">
              <p className="eyebrow">ARCHIVED</p>
              {archived.map((p) => (
                <button
                  key={p.id}
                  className="project-switcher-item project-switcher-item-archived"
                  data-project-id={p.id}
                  onClick={() => handleSelect(p.id)}
                >
                  <span>{p.name}</span>
                  {p.id === activeProjectId ? (
                    <span className="project-switcher-check">{'\u2713'}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {isAdmin ? (
            <div className="project-switcher-footer">
              <button className="project-switcher-create">
                + Create project
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

### CSS additions to `packages/web/src/styles.css`

```css
/* ─── Project switcher ──────────────────────────────────────────────────── */
.project-switcher {
  position: relative;
}

.project-switcher-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.project-switcher-button {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.5rem 0.4rem;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background 160ms ease;
}

.project-switcher-button:hover {
  background: rgba(255, 255, 255, 0.05);
}

.project-switcher-arrow {
  font-size: 0.65rem;
  color: var(--muted-foreground);
}

.project-switcher-info {
  display: grid;
  gap: 0.15rem;
}

.project-switcher-name {
  font-weight: 600;
  font-family: var(--font-heading);
  font-size: 1.1rem;
}

.project-switcher-meta {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.project-switcher-gear {
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  transition: color 160ms ease;
}

.project-switcher-gear:hover {
  color: var(--foreground);
}

.project-switcher-overlay {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  background: var(--sidebar);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  padding: 0.6rem;
  margin-top: 0.3rem;
  display: grid;
  gap: 0.5rem;
  max-height: 24rem;
  overflow-y: auto;
  box-shadow: 0 8px 32px oklch(0 0 0 / 0.4);
}

.project-switcher-search {
  padding: 0 0 0.3rem;
}

.project-switcher-group {
  display: grid;
  gap: 0.2rem;
}

.project-switcher-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.5rem 0.65rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  text-align: left;
  transition: background 160ms ease;
}

.project-switcher-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.project-switcher-item-archived {
  color: var(--muted-foreground);
}

.project-switcher-check {
  color: var(--primary);
  font-weight: 600;
}

.project-switcher-footer {
  border-top: 1px solid var(--sidebar-border);
  padding-top: 0.4rem;
}

.project-switcher-create {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 0.45rem 0.65rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  text-align: left;
  transition: color 160ms ease;
}

.project-switcher-create:hover {
  color: var(--foreground);
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/ProjectSwitcher.test.tsx
```

---

## Task 4: Channel List Refactor

### Goal
Refactor the channel section into a standalone component. Channels are the hero section of the sidebar. `+ Add channel` starts as a text link that expands inline into an input + button on click, then collapses after creation.

### TDD Steps

1. Write tests: renders channels with `#` prefix, highlights selected, text link expands to input, creates channel and collapses
2. Run tests — fail
3. Create `ChannelList.tsx`
4. Run tests — pass

### Files

**Create:** `packages/web/src/ChannelList.tsx`
**Create:** `packages/web/src/ChannelList.test.tsx`

### Test: `packages/web/src/ChannelList.test.tsx`

```typescript
// ABOUTME: Tests for the ChannelList sidebar section
// ABOUTME: Covers channel display, selection, and collapsible add-channel flow

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChannelSummary } from './api';
import { ChannelList } from './ChannelList';

const CHANNELS: ChannelSummary[] = [
  { id: 'ch-1', name: 'general', slug: 'general' },
  { id: 'ch-2', name: 'engineering', slug: 'engineering' },
  { id: 'ch-3', name: 'design-review', slug: 'design-review' },
];

describe('ChannelList', () => {
  afterEach(cleanup);

  it('renders each channel with a # prefix', () => {
    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={vi.fn()}
      />,
    );

    expect(screen.getByText('general')).toBeTruthy();
    expect(screen.getByText('engineering')).toBeTruthy();
    expect(screen.getAllByText('#').length).toBe(3);
  });

  it('highlights the selected channel', () => {
    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-2"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={vi.fn()}
      />,
    );

    const engineeringButton = screen.getByText('engineering').closest('button');
    expect(engineeringButton?.className).toContain('channel-button-active');
  });

  it('calls onSelectChannel when a channel is clicked', () => {
    const onSelect = vi.fn();

    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={onSelect}
        onCreateChannel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('engineering'));

    expect(onSelect).toHaveBeenCalledWith('ch-2');
  });

  it('shows "+ Add channel" text link that expands to input on click', () => {
    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/new channel name/i)).toBeNull();

    fireEvent.click(screen.getByText(/add channel/i));

    expect(screen.getByLabelText(/new channel name/i)).toBeTruthy();
  });

  it('calls onCreateChannel with the entered name and collapses the input', () => {
    const onCreate = vi.fn();

    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={onCreate}
      />,
    );

    fireEvent.click(screen.getByText(/add channel/i));
    fireEvent.change(screen.getByLabelText(/new channel name/i), {
      target: { value: 'product' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onCreate).toHaveBeenCalledWith('product');
  });

  it('shows the CHANNELS section header', () => {
    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={vi.fn()}
      />,
    );

    expect(screen.getByText('CHANNELS')).toBeTruthy();
  });
});
```

### Implementation: `packages/web/src/ChannelList.tsx`

```tsx
// ABOUTME: Channel navigation list for the sidebar with collapsible add-channel flow
// ABOUTME: Channels are the hero navigation element, shown with # prefix and selection highlight

import { useState } from 'react';

import { Button, Input } from '@mastra-mindspace/ui';

import type { ChannelSummary } from './api';
import { InlineError } from './InlineError';

export type ChannelListProps = {
  channels: ChannelSummary[];
  selectedChannelId: string;
  isCreatingChannel: boolean;
  channelError: string | undefined;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string) => void;
};

export function ChannelList({
  channels,
  selectedChannelId,
  isCreatingChannel,
  channelError,
  onSelectChannel,
  onCreateChannel,
}: ChannelListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;

    onCreateChannel(trimmed);
    setNewName('');
    setIsAdding(false);
  }

  return (
    <section className="sidebar-section">
      <p className="eyebrow">CHANNELS</p>

      <nav className="channel-list" aria-label="Channels">
        {channels.map((channel) => (
          <button
            key={channel.id}
            className={
              channel.id === selectedChannelId
                ? 'channel-button channel-button-active'
                : 'channel-button'
            }
            onClick={() => onSelectChannel(channel.id)}
          >
            <span className="channel-hash">#</span>
            <span>{channel.name}</span>
          </button>
        ))}
      </nav>

      {isAdding ? (
        <div className="channel-add-form">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="channel-name"
            aria-label="New channel name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
              if (e.key === 'Escape') {
                setIsAdding(false);
                setNewName('');
              }
            }}
          />
          <Button size="sm" onClick={handleAdd} disabled={isCreatingChannel || !newName.trim()}>
            Add
          </Button>
        </div>
      ) : (
        <button className="channel-add-link" onClick={() => setIsAdding(true)}>
          + Add channel
        </button>
      )}

      <InlineError message={channelError} />
    </section>
  );
}
```

### CSS additions to `packages/web/src/styles.css`

```css
/* ─── Sidebar sections ──────────────────────────────────────────────────── */
.sidebar-section {
  display: grid;
  gap: 0.3rem;
}

.sidebar-section > .eyebrow {
  padding: 0 0.4rem;
}

.sidebar-divider {
  border: none;
  border-top: 1px solid var(--sidebar-border);
  margin: 0.3rem 0;
}

.channel-add-link {
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 0.4rem 0.85rem;
  font-size: 0.82rem;
  text-align: left;
  transition: color 160ms ease;
}

.channel-add-link:hover {
  color: var(--foreground);
}

.channel-add-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.4rem;
  align-items: center;
  padding: 0.2rem 0.4rem;
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/ChannelList.test.tsx
```

---

## Task 5: Minds Section

### Goal
Create a `MindsList` component that renders configured AI minds with emoji avatars, accent rings, and presence dots. Click is a no-op for v1.

### TDD Steps

1. Write tests: renders mind names, shows emoji avatars with accent ring, shows presence dots
2. Run tests — fail
3. Create `MindsList.tsx`
4. Run tests — pass

### Files

**Create:** `packages/web/src/MindsList.tsx`
**Create:** `packages/web/src/MindsList.test.tsx`

### Test: `packages/web/src/MindsList.test.tsx`

```typescript
// ABOUTME: Tests for the MindsList sidebar section
// ABOUTME: Verifies mind rendering with avatars, names, and presence indicators

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { MindSummary } from './sidebar-stubs';
import { MindsList } from './MindsList';

const MINDS: MindSummary[] = [
  { id: 'mind-1', name: 'Claude', icon: '\u{1F916}', presence: 'online' },
  { id: 'mind-2', name: 'Reviewer', icon: '\u{1F50D}', presence: 'offline' },
];

describe('MindsList', () => {
  afterEach(cleanup);

  it('renders each mind name', () => {
    render(<MindsList minds={MINDS} />);

    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Reviewer')).toBeTruthy();
  });

  it('shows the MINDS section header', () => {
    render(<MindsList minds={MINDS} />);

    expect(screen.getByText('MINDS')).toBeTruthy();
  });

  it('renders emoji avatars', () => {
    render(<MindsList minds={MINDS} />);

    expect(screen.getByText('\u{1F916}')).toBeTruthy();
    expect(screen.getByText('\u{1F50D}')).toBeTruthy();
  });

  it('shows presence indicators', () => {
    const { container } = render(<MindsList minds={MINDS} />);

    const onlineDots = container.querySelectorAll('.presence-online');
    const offlineDots = container.querySelectorAll('.presence-offline');

    expect(onlineDots.length).toBe(1);
    expect(offlineDots.length).toBe(1);
  });

  it('renders empty state when no minds are configured', () => {
    render(<MindsList minds={[]} />);

    expect(screen.getByText(/no minds configured/i)).toBeTruthy();
  });
});
```

### Implementation: `packages/web/src/MindsList.tsx`

```tsx
// ABOUTME: Sidebar section listing configured AI persona minds
// ABOUTME: Shows emoji avatar with accent ring, name, and presence dot

import { Avatar } from './Avatar';
import type { MindSummary } from './sidebar-stubs';

export type MindsListProps = {
  minds: MindSummary[];
};

export function MindsList({ minds }: MindsListProps) {
  return (
    <section className="sidebar-section">
      <p className="eyebrow">MINDS</p>

      {minds.length === 0 ? (
        <p className="sidebar-empty">No minds configured</p>
      ) : (
        <div className="sidebar-member-list">
          {minds.map((mind) => (
            <div key={mind.id} className="sidebar-member-row">
              <Avatar variant="icon" text={mind.icon} size="sm" />
              <span className="sidebar-member-name mind-name">{mind.name}</span>
              <span
                className={`presence-dot ${mind.presence === 'online' ? 'presence-online' : 'presence-offline'}`}
                aria-label={mind.presence}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

### CSS additions to `packages/web/src/styles.css`

```css
/* ─── Member/mind rows ──────────────────────────────────────────────────── */
.sidebar-member-list {
  display: grid;
  gap: 0.15rem;
}

.sidebar-member-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0.6rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
}

.sidebar-member-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mind-name {
  color: var(--primary);
}

.sidebar-empty {
  margin: 0;
  padding: 0.35rem 0.6rem;
  font-size: 0.82rem;
  color: var(--muted-foreground);
}

.presence-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.presence-online {
  background: oklch(0.72 0.2 145);
}

.presence-offline {
  background: var(--muted-foreground);
  opacity: 0.4;
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/MindsList.test.tsx
```

---

## Task 6: Teammates Section

### Goal
Create a `TeammatesList` component listing human project members with initials avatars and presence dots. Awareness only for v1.

### TDD Steps

1. Write tests: renders teammate names, shows initials avatars, shows presence dots
2. Run tests — fail
3. Create `TeammatesList.tsx`
4. Run tests — pass

### Files

**Create:** `packages/web/src/TeammatesList.tsx`
**Create:** `packages/web/src/TeammatesList.test.tsx`

### Test: `packages/web/src/TeammatesList.test.tsx`

```typescript
// ABOUTME: Tests for the TeammatesList sidebar section
// ABOUTME: Verifies teammate rendering with initials avatars and presence indicators

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TeammateSummary } from './sidebar-stubs';
import { TeammatesList } from './TeammatesList';

const TEAMMATES: TeammateSummary[] = [
  { id: 't-1', displayName: 'Alice Chen', initials: 'AC', email: 'alice@example.com', presence: 'online' },
  { id: 't-2', displayName: 'Bob Martinez', initials: 'BM', email: 'bob@example.com', presence: 'offline' },
];

describe('TeammatesList', () => {
  afterEach(cleanup);

  it('renders each teammate name', () => {
    render(<TeammatesList teammates={TEAMMATES} />);

    expect(screen.getByText('Alice Chen')).toBeTruthy();
    expect(screen.getByText('Bob Martinez')).toBeTruthy();
  });

  it('shows the TEAMMATES section header', () => {
    render(<TeammatesList teammates={TEAMMATES} />);

    expect(screen.getByText('TEAMMATES')).toBeTruthy();
  });

  it('renders initials avatars', () => {
    render(<TeammatesList teammates={TEAMMATES} />);

    expect(screen.getByText('AC')).toBeTruthy();
    expect(screen.getByText('BM')).toBeTruthy();
  });

  it('shows presence indicators', () => {
    const { container } = render(<TeammatesList teammates={TEAMMATES} />);

    const onlineDots = container.querySelectorAll('.presence-online');
    const offlineDots = container.querySelectorAll('.presence-offline');

    expect(onlineDots.length).toBe(1);
    expect(offlineDots.length).toBe(1);
  });

  it('renders empty state when no teammates exist', () => {
    render(<TeammatesList teammates={[]} />);

    expect(screen.getByText(/no teammates/i)).toBeTruthy();
  });
});
```

### Implementation: `packages/web/src/TeammatesList.tsx`

```tsx
// ABOUTME: Sidebar section listing human project members for awareness
// ABOUTME: Shows initials avatar, display name, and presence dot

import { Avatar } from './Avatar';
import type { TeammateSummary } from './sidebar-stubs';

export type TeammatesListProps = {
  teammates: TeammateSummary[];
};

export function TeammatesList({ teammates }: TeammatesListProps) {
  return (
    <section className="sidebar-section">
      <p className="eyebrow">TEAMMATES</p>

      {teammates.length === 0 ? (
        <p className="sidebar-empty">No teammates</p>
      ) : (
        <div className="sidebar-member-list">
          {teammates.map((teammate) => (
            <div key={teammate.id} className="sidebar-member-row">
              <Avatar variant="initials" text={teammate.initials} size="sm" />
              <span className="sidebar-member-name">{teammate.displayName}</span>
              <span
                className={`presence-dot ${teammate.presence === 'online' ? 'presence-online' : 'presence-offline'}`}
                aria-label={teammate.presence}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/TeammatesList.test.tsx
```

---

## Task 7: User Footer

### Goal
Create a `UserFooter` component pinned at the bottom of the sidebar. Shows current user identity (initials + name), sign out link, and theme toggle (3-state cycle).

### TDD Steps

1. Write tests: renders user name, sign out calls handler, theme toggle cycles through states
2. Run tests — fail
3. Create `UserFooter.tsx`
4. Run tests — pass

### Files

**Create:** `packages/web/src/UserFooter.tsx`
**Create:** `packages/web/src/UserFooter.test.tsx`

### Test: `packages/web/src/UserFooter.test.tsx`

```typescript
// ABOUTME: Tests for the UserFooter sidebar component
// ABOUTME: Covers user identity display, sign out, and theme toggle cycling

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserFooter } from './UserFooter';

describe('UserFooter', () => {
  afterEach(cleanup);

  it('renders the user display name', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="system"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByText('Alice Chen')).toBeTruthy();
  });

  it('renders the user initials avatar', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="system"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('calls onSignOut when sign out is clicked', () => {
    const onSignOut = vi.fn();

    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="system"
        onSignOut={onSignOut}
        onToggleTheme={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/sign out/i));

    expect(onSignOut).toHaveBeenCalled();
  });

  it('calls onToggleTheme when theme toggle is clicked', () => {
    const onToggle = vi.fn();

    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="light"
        onSignOut={vi.fn()}
        onToggleTheme={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }));

    expect(onToggle).toHaveBeenCalled();
  });

  it('shows sun icon for light theme', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="light"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /toggle theme/i }).textContent).toContain('\u2600\uFE0F');
  });

  it('shows moon icon for dark theme', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="dark"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /toggle theme/i }).textContent).toContain('\u{1F319}');
  });

  it('shows computer icon for system theme', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="system"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /toggle theme/i }).textContent).toContain('\u{1F4BB}');
  });
});
```

### Implementation: `packages/web/src/UserFooter.tsx`

```tsx
// ABOUTME: Sidebar footer showing current user identity, sign out, and theme toggle
// ABOUTME: Pinned at the bottom of the sidebar with 3-state theme cycling

import { Avatar } from './Avatar';

export type Theme = 'light' | 'dark' | 'system';

const THEME_ICONS: Record<Theme, string> = {
  light: '\u2600\uFE0F',
  dark: '\u{1F319}',
  system: '\u{1F4BB}',
};

export type UserFooterProps = {
  displayName: string;
  initials: string;
  theme: Theme;
  onSignOut: () => void;
  onToggleTheme: () => void;
};

export function UserFooter({
  displayName,
  initials,
  theme,
  onSignOut,
  onToggleTheme,
}: UserFooterProps) {
  return (
    <footer className="user-footer">
      <div className="user-footer-identity">
        <Avatar variant="initials" text={initials} size="sm" />
        <span className="user-footer-name">{displayName}</span>
      </div>
      <div className="user-footer-actions">
        <button
          className="user-footer-theme"
          aria-label="Toggle theme"
          onClick={onToggleTheme}
        >
          {THEME_ICONS[theme]}
        </button>
        <span className="user-footer-separator">{'\u00B7'}</span>
        <button className="user-footer-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </footer>
  );
}
```

### CSS additions to `packages/web/src/styles.css`

```css
/* ─── User footer ───────────────────────────────────────────────────────── */
.user-footer {
  display: grid;
  gap: 0.35rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--sidebar-border);
  margin-top: auto;
}

.user-footer-identity {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.25rem 0.4rem;
}

.user-footer-name {
  font-size: 0.875rem;
  font-weight: 500;
}

.user-footer-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.4rem;
  font-size: 0.82rem;
}

.user-footer-theme {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.15rem;
  font-size: 0.9rem;
  line-height: 1;
}

.user-footer-separator {
  color: var(--muted-foreground);
}

.user-footer-signout {
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 0;
  font-size: 0.82rem;
  transition: color 160ms ease;
}

.user-footer-signout:hover {
  color: var(--foreground);
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/UserFooter.test.tsx
```

---

## Task 8: Composed Sidebar

### Goal
Rewrite `Sidebar.tsx` to assemble all sub-components: ProjectSwitcher, ChannelList, MindsList, TeammatesList, UserFooter. Update the `SidebarProps` type and wire to `App.tsx`.

### TDD Steps

1. Write a test that renders the full Sidebar with all sections visible
2. Run test — fail (Sidebar still uses old implementation)
3. Rewrite Sidebar.tsx to compose sub-components
4. Update App.tsx to pass new props
5. Run test — pass
6. Run existing App.test.tsx — ensure all existing tests still pass

### Files

**Modify:** `packages/web/src/Sidebar.tsx`
**Modify:** `packages/web/src/App.tsx`
**Create:** `packages/web/src/Sidebar.test.tsx`

### Test: `packages/web/src/Sidebar.test.tsx`

```typescript
// ABOUTME: Integration tests for the composed Sidebar component
// ABOUTME: Verifies all sections render and interact correctly together

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccessibleProjectSummary, ChannelSummary } from './api';
import type { MindSummary, TeammateSummary } from './sidebar-stubs';
import { Sidebar } from './Sidebar';

const PROJECTS: AccessibleProjectSummary[] = [
  { id: 'p1', organizationId: 'org-1', name: 'Acme Engineering', slug: 'acme-eng', status: 'active' },
  { id: 'p2', organizationId: 'org-1', name: 'Q2 Roadmap', slug: 'q2-roadmap', status: 'active' },
];

const CHANNELS: ChannelSummary[] = [
  { id: 'ch-1', name: 'general', slug: 'general' },
  { id: 'ch-2', name: 'engineering', slug: 'engineering' },
];

const MINDS: MindSummary[] = [
  { id: 'mind-1', name: 'Claude', icon: '\u{1F916}', presence: 'online' },
];

const TEAMMATES: TeammateSummary[] = [
  { id: 't-1', displayName: 'Alice Chen', initials: 'AC', email: 'alice@example.com', presence: 'online' },
];

function renderSidebar(overrides = {}) {
  const defaults = {
    projects: PROJECTS,
    activeProjectId: 'p1',
    isAdmin: false,
    channels: CHANNELS,
    selectedChannelId: 'ch-1',
    isCreatingChannel: false,
    channelError: undefined,
    minds: MINDS,
    teammates: TEAMMATES,
    userName: 'Alice Chen',
    userInitials: 'AC',
    theme: 'system' as const,
    onNavigateProject: vi.fn(),
    onOpenSettings: vi.fn(),
    onSelectChannel: vi.fn(),
    onCreateChannel: vi.fn(),
    onSignOut: vi.fn(),
    onToggleTheme: vi.fn(),
  };

  return render(<Sidebar {...defaults} {...overrides} />);
}

describe('Sidebar', () => {
  afterEach(cleanup);

  it('renders the project switcher with the active project name', () => {
    renderSidebar();

    expect(screen.getByText('Acme Engineering')).toBeTruthy();
  });

  it('renders the channels section', () => {
    renderSidebar();

    expect(screen.getByText('CHANNELS')).toBeTruthy();
    expect(screen.getByText('general')).toBeTruthy();
    expect(screen.getByText('engineering')).toBeTruthy();
  });

  it('renders the minds section', () => {
    renderSidebar();

    expect(screen.getByText('MINDS')).toBeTruthy();
    expect(screen.getByText('Claude')).toBeTruthy();
  });

  it('renders the teammates section', () => {
    renderSidebar();

    expect(screen.getByText('TEAMMATES')).toBeTruthy();
    expect(screen.getByText('Alice Chen')).toBeTruthy();
  });

  it('renders the user footer with sign out', () => {
    renderSidebar();

    expect(screen.getByText(/sign out/i)).toBeTruthy();
  });

  it('selects a channel when clicked', () => {
    const onSelect = vi.fn();
    renderSidebar({ onSelectChannel: onSelect });

    fireEvent.click(screen.getByText('engineering'));

    expect(onSelect).toHaveBeenCalledWith('ch-2');
  });

  it('signs out when sign out is clicked', () => {
    const onSignOut = vi.fn();
    renderSidebar({ onSignOut });

    fireEvent.click(screen.getByText(/sign out/i));

    expect(onSignOut).toHaveBeenCalled();
  });
});
```

### Implementation: `packages/web/src/Sidebar.tsx` (full rewrite)

```tsx
// ABOUTME: Persistent navigation sidebar composing project switcher, channels, minds, teammates, and user footer
// ABOUTME: Replaces flat project list with progressive-disclosure navigation architecture

import type { AccessibleProjectSummary, ChannelSummary } from './api';
import type { MindSummary, TeammateSummary } from './sidebar-stubs';
import type { Theme } from './UserFooter';
import { ProjectSwitcher } from './ProjectSwitcher';
import { ChannelList } from './ChannelList';
import { MindsList } from './MindsList';
import { TeammatesList } from './TeammatesList';
import { UserFooter } from './UserFooter';

export type SidebarProps = {
  projects: AccessibleProjectSummary[];
  activeProjectId: string;
  isAdmin: boolean;
  channels: ChannelSummary[];
  selectedChannelId: string;
  isCreatingChannel: boolean;
  channelError: string | undefined;
  minds: MindSummary[];
  teammates: TeammateSummary[];
  userName: string;
  userInitials: string;
  theme: Theme;
  onNavigateProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string) => void;
  onSignOut: () => void;
  onToggleTheme: () => void;
};

export function Sidebar({
  projects,
  activeProjectId,
  isAdmin,
  channels,
  selectedChannelId,
  isCreatingChannel,
  channelError,
  minds,
  teammates,
  userName,
  userInitials,
  theme,
  onNavigateProject,
  onOpenSettings,
  onSelectChannel,
  onCreateChannel,
  onSignOut,
  onToggleTheme,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <ProjectSwitcher
        projects={projects}
        activeProjectId={activeProjectId}
        isAdmin={isAdmin}
        onSelectProject={onNavigateProject}
        onOpenSettings={onOpenSettings}
      />

      <hr className="sidebar-divider" />

      <ChannelList
        channels={channels}
        selectedChannelId={selectedChannelId}
        isCreatingChannel={isCreatingChannel}
        channelError={channelError}
        onSelectChannel={onSelectChannel}
        onCreateChannel={onCreateChannel}
      />

      <hr className="sidebar-divider" />

      <MindsList minds={minds} />

      <hr className="sidebar-divider" />

      <TeammatesList teammates={teammates} />

      <UserFooter
        displayName={userName}
        initials={userInitials}
        theme={theme}
        onSignOut={onSignOut}
        onToggleTheme={onToggleTheme}
      />
    </aside>
  );
}
```

### App.tsx changes

The `App.tsx` Sidebar invocation needs to change from the old props to the new ones. The key changes:

1. **Remove props:** `newChannelName`, `hasUser`, `onChangeNewChannelName`, `onNavigateAdmin`
2. **Add props:** `isAdmin`, `minds`, `teammates`, `userName`, `userInitials`, `theme`, `onOpenSettings`, `onToggleTheme`
3. **Change `onCreateChannel`:** Now receives the channel name as an argument (previously triggered a callback that read from state)
4. **Add state:** Import `STUB_MINDS`, `STUB_TEAMMATES` from `sidebar-stubs.ts`
5. **Wire theme:** Import and use `useTheme()` from Phase 11a foundation

The specific diff in `App.tsx`:

- Import new stubs: `import { STUB_MINDS, STUB_TEAMMATES } from './sidebar-stubs';`
- Import theme hook: `import { useTheme } from './useTheme';` (from Phase 11a)
- Add `const [theme, toggleTheme] = useTheme();` in App component
- Derive `userName` and `userInitials` from the `meResult` or user email
- Replace the old `handleCreateChannel` to accept a name parameter
- Remove `newChannelName` state (now owned by `ChannelList`)
- Pass new props to `<Sidebar />`

**Helper to derive initials:**

```typescript
function deriveInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
}
```

Add this function to `App.tsx` (or extract to a utility file). Use it to compute `userInitials` from the user's display name or email.

### Note on `useTheme` dependency

This task depends on Phase 11a providing a `useTheme()` hook. If that hook is not yet available, create a minimal stub:

```typescript
// packages/web/src/useTheme.ts (temporary stub until Phase 11a ships)
// ABOUTME: Minimal theme preference hook managing light/dark/system cycling
// ABOUTME: Reads from and persists to localStorage, sets data-theme attribute

import { useState, useCallback } from 'react';
import type { Theme } from './UserFooter';

const THEME_CYCLE: Theme[] = ['light', 'dark', 'system'];
const STORAGE_KEY = 'mindspace-theme';

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const index = THEME_CYCLE.indexOf(current);
      const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length]!;
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute('data-theme', next === 'system' ? '' : next);
      return next;
    });
  }, []);

  return [theme, toggle];
}
```

### Existing test impact

The existing `App.test.tsx` tests will need updates because:

1. The `Sidebar` component's props changed — the mock needs updating
2. The "Admin Console" button in the sidebar is gone (replaced by user footer)
3. Channel creation flow changed (no more always-visible input)

Update the relevant assertions in `App.test.tsx` or adjust the mock. The key tests that reference sidebar behavior:
- "bootstraps a project" — still works, project selection via project switcher
- Channel-related tests — update to use the new `+ Add channel` flow

### Test commands

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/Sidebar.test.tsx
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/App.test.tsx
```

---

## Task 9: Sidebar Collapse (Responsive Icon Rail)

### Goal
At 768-1100px viewport width, collapse the sidebar to a 48px icon rail showing project initials, channel icon, minds icon, teammates icon, and user initials. Hovering or clicking the rail expands the full sidebar as a floating overlay.

### TDD Steps

1. This is primarily CSS + a small state toggle. Write a test that the collapse toggle button exists and toggles a class.
2. Run test — fail
3. Add collapse state and CSS
4. Run test — pass

### Files

**Modify:** `packages/web/src/Sidebar.tsx` — add collapse state and rail rendering
**Modify:** `packages/web/src/styles.css` — add responsive collapse CSS

### Implementation approach

Add a `collapsed` state to the Sidebar (or receive from parent). At medium breakpoints via CSS media query, apply `.sidebar-collapsed` class that sets `width: 48px` and hides text content. Show icon-only buttons. On hover/click, add `.sidebar-expanded` class that renders the full sidebar as an absolutely-positioned overlay.

### CSS additions to `packages/web/src/styles.css`

```css
/* ─── Sidebar collapse (icon rail) ──────────────────────────────────────── */
.sidebar-rail {
  display: none;
}

@media (min-width: 768px) and (max-width: 1100px) {
  .mindspace-shell {
    grid-template-columns: 48px minmax(0, 1fr) 24rem;
  }

  .sidebar {
    width: 48px;
    padding: 0.5rem 0;
    align-items: center;
    overflow: visible;
    position: relative;
  }

  .sidebar-content {
    display: none;
  }

  .sidebar-rail {
    display: grid;
    gap: 0.5rem;
    align-items: center;
    justify-items: center;
    width: 100%;
  }

  .sidebar-rail-icon {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 160ms ease, color 160ms ease;
  }

  .sidebar-rail-icon:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--foreground);
  }

  .sidebar-rail-divider {
    width: 1.5rem;
    border: none;
    border-top: 1px solid var(--sidebar-border);
    margin: 0.15rem 0;
  }

  /* Expanded overlay on hover */
  .sidebar:hover .sidebar-content,
  .sidebar.sidebar-force-open .sidebar-content {
    display: grid;
    position: absolute;
    top: 0;
    left: 48px;
    width: 260px;
    height: 100vh;
    background: var(--sidebar);
    border-right: 1px solid var(--sidebar-border);
    padding: 1.1rem;
    gap: 1rem;
    align-content: start;
    z-index: 40;
    box-shadow: 8px 0 32px oklch(0 0 0 / 0.3);
    overflow-y: auto;
  }

  .sidebar:hover .sidebar-rail,
  .sidebar.sidebar-force-open .sidebar-rail {
    background: oklch(from var(--sidebar) calc(l + 0.03) c h);
  }
}
```

### Sidebar.tsx structural change

Wrap the existing sidebar content in a `<div className="sidebar-content">` and add a `<div className="sidebar-rail">` with icon buttons:

```tsx
<aside className="sidebar">
  {/* Icon rail for collapsed state */}
  <div className="sidebar-rail">
    <button className="sidebar-rail-icon" aria-label="Project">
      {activeProject ? deriveInitials(activeProject.name, null) : '??'}
    </button>
    <hr className="sidebar-rail-divider" />
    <button className="sidebar-rail-icon" aria-label="Channels">#</button>
    <button className="sidebar-rail-icon" aria-label="Minds">{'\u{1F916}'}</button>
    <button className="sidebar-rail-icon" aria-label="Teammates">{'\u{1F465}'}</button>
    <div style={{ flex: 1 }} />
    <button className="sidebar-rail-icon" aria-label="User">
      {userInitials}
    </button>
  </div>

  {/* Full sidebar content (hidden when collapsed) */}
  <div className="sidebar-content">
    <ProjectSwitcher ... />
    <hr className="sidebar-divider" />
    <ChannelList ... />
    <hr className="sidebar-divider" />
    <MindsList ... />
    <hr className="sidebar-divider" />
    <TeammatesList ... />
    <UserFooter ... />
  </div>
</aside>
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/Sidebar.test.tsx
```

---

## Task 10: Integration Tests

### Goal
Update `App.test.tsx` to work with the new Sidebar props and add integration tests covering the full sidebar navigation flow.

### TDD Steps

1. Run existing `App.test.tsx` — identify failures from prop changes
2. Update tests to match new Sidebar interface
3. Add new integration tests for project switching, channel creation via text link
4. Run all tests — pass

### Files

**Modify:** `packages/web/src/App.test.tsx`

### Key test updates

1. **Project navigation:** The old test clicked a project button in the flat list. Now it needs to open the project switcher dropdown and select from the overlay.

2. **Channel creation:** The old test used an always-visible input. Now it needs to click `+ Add channel` first to expand the inline form, then type and submit.

3. **Sidebar actions:** The "Admin Console" button is removed. Tests referencing it need updating.

4. **New tests to add:**
   - Project switcher opens and closes
   - Theme toggle cycles (if `useTheme` is wired)
   - Sign out from user footer

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/App.test.tsx
```

### Full test suite verification

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run
```

---

## CSS removal checklist

When Task 8 (Composed Sidebar) is complete, remove the following CSS classes that are no longer used:

- `.sidebar-brand` — replaced by ProjectSwitcher
- `.mindspace-list` — replaced by sidebar sections
- `.mindspace-button`, `.mindspace-button-active`, `.mindspace-button-name`, `.mindspace-button-slug` — replaced by ProjectSwitcher items
- `.mindspace-channels` — replaced by ChannelList section
- `.mindspace-channels-actions` — replaced by collapsible add-channel form
- `.sidebar-actions` — replaced by UserFooter

Keep `.sidebar`, `.channel-list`, `.channel-button`, `.channel-button-active`, `.channel-hash` as they are reused with the same class names.

---

## Open Questions for Remy

1. **Backend stubs vs real endpoints:** This plan uses frontend stubs for minds and teammates. Should we add backend endpoints for `GET /api/projects/:projectId/members` and `GET /api/projects/:projectId/minds` as part of this phase or defer?

2. **Admin detection:** The project switcher hides `+ Create project` for non-admin users. The current `getMe` endpoint returns no role info. The `loadProjectContext` service returns a `role` field from `organization_memberships`. Should we expose this in the frontend API (e.g., include `role` in the project list response), or hardcode `isAdmin: false` for v1?

3. **useTheme hook:** Does Phase 11a already provide this, or should this plan include the stub implementation shown in Task 7?

4. **User display name:** The `getMe` endpoint returns `name` (from Google auth). Is this sufficient for deriving `userName` and `userInitials`, or do we need a separate profile endpoint?
