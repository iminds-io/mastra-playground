# ABOUTME: Implementation plan for Phase 11c — Thread Index (Channel Feed) redesign
# ABOUTME: Covers rich thread cards, channel header, collapsing composer, and compressed index mode

# Phase 11c: Thread Index (Channel Feed) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-24
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: Phase 11a (foundation — router, layout shell with 2/3-column grid, CSS transitions) complete. Phase 11b (sidebar navigation) complete. Design doc `05_target_frontend_ui_architecture_design.md` Section 4 approved.

**Goal:** Transform the basic thread card list into a rich channel feed with author names, relative timestamps, 2-line message previews, participant avatars, reply counts, selected state, and a collapsing composer. Add a proper channel header with refresh and new-thread buttons. Implement compressed thread index mode (State B) when a thread detail panel is open.

**Architecture:** Build utilities first (timestamp formatter), then the thread card component, then the channel header, then the composer, then the compressed mode CSS. Each piece is independently testable. The `ChannelFeed.tsx` component is refactored in place — no new top-level components except the timestamp utility.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Vitest 4 + @testing-library/react, `@mastra-mindspace/ui` design system. No new dependencies.

---

## Current State Summary

| Area | What exists | File |
|------|-------------|------|
| **Thread cards** | Simple card with `rootMessageText` (no truncation), reply count badge, and raw `toLocaleString()` timestamp. No author name, no participant avatars, no unread dot. | `packages/web/src/ChannelFeed.tsx` lines 68-83 |
| **Channel header** | Shows `#channelName` with eyebrow "Channel" label and a status line. No refresh or "+ New" button. | `packages/web/src/ChannelFeed.tsx` lines 44-58 |
| **Composer** | Always-expanded 4-row textarea with a "Send to channel" button. Label says "Start a post". Cmd+Enter handled in App.tsx. | `packages/web/src/ChannelFeed.tsx` lines 86-103 |
| **Selected state** | `feed-card-active` class adds accent background + left border. | `packages/web/src/styles.css` lines 240-243 |
| **Compressed mode** | 11a added `thread-open` class on `.mindspace-shell` which sets grid to `260px 300px minmax(0, 1fr)`. Thread index column narrows but card content doesn't adapt. | `packages/web/src/styles.css` |
| **Data model** | `ChannelFeedPost` has `threadId`, `rootMessageId`, `rootMessageText`, `rootMessageRole`, `replyCount`, `lastMessageAt`, `createdAt`. No author name or participant data. | `packages/web/src/api.ts` lines 50-58 |
| **Tests** | `App.test.tsx` has integration tests for feed loading, thread opening, post creation, Cmd+Enter. No unit tests for ChannelFeed in isolation. | `packages/web/src/App.test.tsx` |

---

## Success Criteria

- [ ] `formatTimestamp()` utility produces correct output for all 6 timestamp tiers (just now, minutes ago, today, yesterday, this year, older)
- [ ] Thread cards show author name (from `rootMessageRole` — "You" for user, role name for others), timestamp, 2-line truncated message preview, reply count, and relative last-activity time
- [ ] Selected thread card has accent background + left border highlight (existing `feed-card-active` behavior preserved)
- [ ] Hover on thread card shows subtle background highlight (existing behavior preserved)
- [ ] Keyboard focus on thread card shows focus ring (existing `:focus-visible` behavior preserved)
- [ ] Channel header shows `#channelName`, a refresh button, and a `+ New` button
- [ ] Refresh button calls `onRefreshFeed` callback
- [ ] `+ New` button scrolls to and focuses the composer
- [ ] Composer is collapsed to single line by default, expands to 3-4 rows on focus
- [ ] Composer collapses back on blur (when empty)
- [ ] Composer shows `Cmd+Enter` / `Ctrl+Enter` hint text
- [ ] Composer submit creates thread and opens it (existing behavior preserved)
- [ ] Thread index compresses gracefully in State B (~300px width) — message preview truncates to 1 line, participant avatars hidden
- [ ] All existing `App.test.tsx` tests continue to pass
- [ ] `pnpm typecheck` passes across all packages

---

## Recommended Sequencing

Execute these phases in order. Each phase is independently shippable.

1. **Phase 1: Timestamp Formatter** — Pure utility function, no UI changes.
2. **Phase 2: Thread Card Redesign** — Rich card layout with author, timestamp, preview, reply count.
3. **Phase 3: Channel Header** — Refresh button, `+ New` button with scroll-to-composer.
4. **Phase 4: Collapsing Composer** — Single-line default, expand on focus, keyboard hint.
5. **Phase 5: Compressed Index Mode** — CSS for compact cards when thread detail is open.

---

## Phase 1: Timestamp Formatter

### Task 1.1: Create `formatTimestamp` utility

A pure function that formats ISO timestamp strings into the 6-tier display format defined in the design doc (Section 7). Accepts `now` as a parameter for testability.

**Timestamp tiers:**

| Age | Format | Example |
|-----|--------|---------|
| < 1 minute | "Just now" | Just now |
| < 60 minutes | Relative | 5 min ago |
| Today | Time only | 2:30 PM |
| Yesterday | "Yesterday" + time | Yesterday, 2:30 PM |
| This year | Month + day + time | Apr 23, 2:30 PM |
| Older | Full date | Apr 23, 2025 |

**Files:**

- Create: `packages/web/src/formatTimestamp.ts`
- Create: `packages/web/src/formatTimestamp.test.ts`

**TDD Step 1: Write failing tests**

Create `packages/web/src/formatTimestamp.test.ts`:

```ts
// ABOUTME: Tests for the relative timestamp formatting utility
// ABOUTME: Validates all 6 tiers of the timestamp display format

import { describe, expect, it } from 'vitest';

import { formatTimestamp } from './formatTimestamp';

describe('formatTimestamp', () => {
  // Fixed reference point: Wednesday, April 23, 2026, 2:30:00 PM UTC
  const now = new Date('2026-04-23T14:30:00.000Z');

  it('returns "Just now" for timestamps less than 1 minute ago', () => {
    const thirtySecondsAgo = new Date('2026-04-23T14:29:30.000Z');
    expect(formatTimestamp(thirtySecondsAgo.toISOString(), now)).toBe('Just now');
  });

  it('returns "Just now" for timestamps exactly now', () => {
    expect(formatTimestamp(now.toISOString(), now)).toBe('Just now');
  });

  it('returns relative minutes for timestamps 1-59 minutes ago', () => {
    const fiveMinAgo = new Date('2026-04-23T14:25:00.000Z');
    expect(formatTimestamp(fiveMinAgo.toISOString(), now)).toBe('5 min ago');
  });

  it('returns "1 min ago" for exactly 1 minute ago', () => {
    const oneMinAgo = new Date('2026-04-23T14:29:00.000Z');
    expect(formatTimestamp(oneMinAgo.toISOString(), now)).toBe('1 min ago');
  });

  it('returns "59 min ago" for 59 minutes ago', () => {
    const fiftyNineMinAgo = new Date('2026-04-23T13:31:00.000Z');
    expect(formatTimestamp(fiftyNineMinAgo.toISOString(), now)).toBe('59 min ago');
  });

  it('returns time only for timestamps earlier today (60+ minutes ago, same calendar day)', () => {
    const thismorning = new Date('2026-04-23T09:15:00.000Z');
    const result = formatTimestamp(thismorning.toISOString(), now);
    // Should be a time like "9:15 AM" — exact format depends on locale
    expect(result).toMatch(/9:15\s*AM/i);
  });

  it('returns "Yesterday, <time>" for timestamps from yesterday', () => {
    const yesterday = new Date('2026-04-22T14:30:00.000Z');
    const result = formatTimestamp(yesterday.toISOString(), now);
    expect(result).toMatch(/^Yesterday,\s+\d{1,2}:\d{2}\s*(AM|PM)$/i);
  });

  it('returns "Mon DD, <time>" for timestamps earlier this year', () => {
    const earlier = new Date('2026-03-15T10:00:00.000Z');
    const result = formatTimestamp(earlier.toISOString(), now);
    expect(result).toMatch(/^Mar 15,\s+\d{1,2}:\d{2}\s*(AM|PM)$/i);
  });

  it('returns "Mon DD, YYYY" for timestamps from a previous year', () => {
    const lastYear = new Date('2025-12-25T10:00:00.000Z');
    const result = formatTimestamp(lastYear.toISOString(), now);
    expect(result).toBe('Dec 25, 2025');
  });

  it('returns "Just now" for null or undefined input', () => {
    expect(formatTimestamp(null, now)).toBe('Just now');
    expect(formatTimestamp(undefined, now)).toBe('Just now');
  });

  it('returns "Just now" for invalid date strings', () => {
    expect(formatTimestamp('not-a-date', now)).toBe('Just now');
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/formatTimestamp.test.ts
```

Expected: fails because `formatTimestamp` module does not exist.

**TDD Step 3: Implement the utility**

Create `packages/web/src/formatTimestamp.ts`:

```ts
// ABOUTME: Relative timestamp formatting with 6 display tiers
// ABOUTME: Handles "Just now", minutes ago, today, yesterday, this year, and older

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

export function formatTimestamp(
  isoString: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!isoString) {
    return 'Just now';
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  const diffMs = now.getTime() - date.getTime();

  if (diffMs < ONE_MINUTE_MS) {
    return 'Just now';
  }

  if (diffMs < ONE_HOUR_MS) {
    const minutes = Math.floor(diffMs / ONE_MINUTE_MS);
    return `${minutes} min ago`;
  }

  if (isSameDay(date, now)) {
    return formatTime(date);
  }

  if (isYesterday(date, now)) {
    return `Yesterday, ${formatTime(date)}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${formatTime(date)}`;
  }

  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/formatTimestamp.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/formatTimestamp.ts packages/web/src/formatTimestamp.test.ts
git commit -m "Add formatTimestamp utility with 6-tier relative display"
```

---

## Phase 2: Thread Card Redesign

### Task 2.1: Create `ThreadCard` component

Extract the thread card rendering from `ChannelFeed.tsx` into a dedicated `ThreadCard` component with the rich layout from the design doc. The card shows:

- Author name (derived from `rootMessageRole`: "You" for `user`, capitalized role for others)
- Formatted timestamp (using `formatTimestamp`)
- Root message text truncated to 2 lines via CSS
- Reply count with relative last-activity time
- Selected state (accent background + left border)

**Note on missing data:** The current `ChannelFeedPost` type doesn't include author display name or participant avatars. For this phase, we derive what we can from existing data (`rootMessageRole` for author name) and leave participant avatars as a future enhancement when the API provides participant data. This is YAGNI — we don't add fields the API doesn't return yet.

**Files:**

- Create: `packages/web/src/ThreadCard.tsx`
- Create: `packages/web/src/ThreadCard.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/ThreadCard.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the ThreadCard component — rich thread card display
// ABOUTME: Validates author name, timestamp, message truncation, reply count, and selected state

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThreadCard } from './ThreadCard';
import type { ChannelFeedPost } from './api';

const basePost: ChannelFeedPost = {
  threadId: 'thread-1',
  rootMessageId: 'msg-1',
  rootMessageText: 'Deploy the auth fix to staging before the freeze window closes tomorrow.',
  rootMessageRole: 'user',
  replyCount: 4,
  lastMessageAt: '2026-04-23T14:28:00.000Z',
  createdAt: '2026-04-23T14:00:00.000Z',
};

const now = new Date('2026-04-23T14:30:00.000Z');

describe('ThreadCard', () => {
  afterEach(cleanup);

  it('renders the author name derived from rootMessageRole', () => {
    render(
      <ThreadCard
        post={basePost}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('You')).toBeTruthy();
  });

  it('renders a capitalized role name for non-user roles', () => {
    render(
      <ThreadCard
        post={{ ...basePost, rootMessageRole: 'assistant' }}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Assistant')).toBeTruthy();
  });

  it('renders the formatted creation timestamp', () => {
    render(
      <ThreadCard
        post={basePost}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    // 30 minutes ago from now
    expect(screen.getByText('30 min ago')).toBeTruthy();
  });

  it('renders the root message text', () => {
    render(
      <ThreadCard
        post={basePost}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Deploy the auth fix to staging before the freeze window closes tomorrow.'),
    ).toBeTruthy();
  });

  it('renders the reply count', () => {
    render(
      <ThreadCard
        post={basePost}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/4 replies/)).toBeTruthy();
  });

  it('renders "1 reply" for singular', () => {
    render(
      <ThreadCard
        post={{ ...basePost, replyCount: 1 }}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 reply\b/)).toBeTruthy();
  });

  it('renders the relative last-activity time', () => {
    render(
      <ThreadCard
        post={basePost}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    // lastMessageAt is 2 min ago from now
    expect(screen.getByText('2 min ago')).toBeTruthy();
  });

  it('calls onClick when the card is clicked', () => {
    const handleClick = vi.fn();

    render(
      <ThreadCard
        post={basePost}
        isSelected={false}
        now={now}
        onClick={handleClick}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /open thread for deploy the auth fix/i,
      }),
    );

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('applies active styling when selected', () => {
    render(
      <ThreadCard
        post={basePost}
        isSelected={true}
        now={now}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', {
      name: /open thread for deploy the auth fix/i,
    });

    expect(button.className).toContain('feed-card-active');
  });

  it('does not apply active styling when not selected', () => {
    render(
      <ThreadCard
        post={basePost}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', {
      name: /open thread for deploy the auth fix/i,
    });

    expect(button.className).not.toContain('feed-card-active');
  });

  it('hides reply count section when replyCount is 0', () => {
    render(
      <ThreadCard
        post={{ ...basePost, replyCount: 0, lastMessageAt: null }}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByText(/replies?/)).toBeNull();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ThreadCard.test.tsx
```

Expected: fails because `ThreadCard` module does not exist.

**TDD Step 3: Implement the component**

Create `packages/web/src/ThreadCard.tsx`:

```tsx
// ABOUTME: Rich thread card for the channel feed index
// ABOUTME: Shows author, timestamp, 2-line message preview, reply count, and selected state

import { Card, cn } from '@mastra-mindspace/ui';

import type { ChannelFeedPost } from './api';
import { formatTimestamp } from './formatTimestamp';

export type ThreadCardProps = {
  post: ChannelFeedPost;
  isSelected: boolean;
  now?: Date;
  onClick: () => void;
};

function formatAuthorName(role: string): string {
  if (role === 'user') {
    return 'You';
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatReplyCount(count: number): string {
  return `${count} ${count === 1 ? 'reply' : 'replies'}`;
}

export function ThreadCard({ post, isSelected, now, onClick }: ThreadCardProps) {
  const currentTime = now ?? new Date();

  return (
    <Card className="overflow-hidden">
      <button
        className={cn('feed-card-button', isSelected && 'feed-card-active')}
        onClick={onClick}
        aria-label={`Open thread for ${post.rootMessageText}`}
      >
        <div className="feed-card-header">
          <span className="feed-card-author">{formatAuthorName(post.rootMessageRole)}</span>
          <span className="feed-card-timestamp">
            {formatTimestamp(post.createdAt, currentTime)}
          </span>
        </div>

        <p className="feed-card-text">{post.rootMessageText}</p>

        {post.replyCount > 0 ? (
          <div className="feed-card-meta">
            <span className="feed-card-replies">{formatReplyCount(post.replyCount)}</span>
            <span className="feed-card-activity">
              {formatTimestamp(post.lastMessageAt, currentTime)}
            </span>
          </div>
        ) : null}
      </button>
    </Card>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ThreadCard.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/ThreadCard.tsx packages/web/src/ThreadCard.test.tsx
git commit -m "Add ThreadCard component with author, timestamp, preview, and reply count"
```

---

### Task 2.2: Add thread card CSS

Add styles for the new thread card layout: header row with author + timestamp, 2-line message truncation, and meta row.

**Files:**

- Modify: `packages/web/src/styles.css`
- Create: `packages/web/src/threadCard.styles.test.ts`

**TDD Step 1: Write failing test**

Create `packages/web/src/threadCard.styles.test.ts`:

```ts
// ABOUTME: Tests that thread card CSS defines the expected layout rules
// ABOUTME: Validates header row, text truncation, and meta row styles

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('thread card styles', () => {
  it('defines a header row with space-between alignment', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.feed-card-header\s*\{[^}]*display:\s*flex/);
    expect(normalized).toMatch(/\.feed-card-header\s*\{[^}]*justify-content:\s*space-between/);
  });

  it('truncates feed-card-text to 2 lines with line-clamp', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.feed-card-text\s*\{[^}]*-webkit-line-clamp:\s*2/);
  });

  it('defines styles for the author name', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.feed-card-author\s*\{[^}]*font-weight:\s*600/);
  });

  it('defines styles for the timestamp', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.feed-card-timestamp\s*\{[^}]*color:\s*var\(--muted-foreground\)/);
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/threadCard.styles.test.ts
```

**TDD Step 3: Implement the CSS**

In `packages/web/src/styles.css`, add after the existing `.feed-card-meta` block (around line 216), updating and adding rules:

```css
.feed-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.feed-card-author {
  font-weight: 600;
  font-size: 0.875rem;
  font-family: var(--font-heading);
}

.feed-card-timestamp {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  white-space: nowrap;
}
```

Update the existing `.feed-card-text` rule to add 2-line truncation:

```css
.feed-card-text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

Add styles for reply count and activity in the meta row:

```css
.feed-card-replies {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}

.feed-card-activity {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/threadCard.styles.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/threadCard.styles.test.ts
git commit -m "Add thread card CSS with header row, 2-line truncation, and meta row"
```

---

### Task 2.3: Wire ThreadCard into ChannelFeed

Replace the inline card rendering in `ChannelFeed.tsx` with the new `ThreadCard` component. Remove the local `formatReplyCount` function (now in ThreadCard). The existing `App.test.tsx` tests must continue to pass — they depend on the `aria-label` pattern and reply count text.

**Files:**

- Modify: `packages/web/src/ChannelFeed.tsx`

**TDD Step 1: Verify existing tests pass before refactoring**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

All existing tests should pass. This is our regression baseline.

**TDD Step 2: Refactor ChannelFeed to use ThreadCard**

In `packages/web/src/ChannelFeed.tsx`:

1. Remove the local `formatReplyCount` function (lines 11-13).
2. Import `ThreadCard` from `./ThreadCard`.
3. Replace the `feedPosts.map(...)` block (lines 68-83) with:

```tsx
feedPosts.map((post) => (
  <ThreadCard
    key={post.threadId}
    post={post}
    isSelected={selectedThreadId === post.threadId}
    onClick={() => onOpenThread(post.threadId)}
  />
))
```

4. Remove the `Badge` and `Card` imports if no longer used directly.

**TDD Step 3: Verify existing tests still pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**Important:** The existing test `'renders the channel feed as root posts...'` checks for:
- `screen.getByRole('button', { name: /open thread for ship the mindspace shell this sprint\./i })` — ThreadCard preserves the same `aria-label` format.
- `screen.getByText(/2 replies/i)` — ThreadCard renders reply count with the same format.
- `postButton.className.toContain('feed-card-active')` — ThreadCard applies the same class.

All three patterns are preserved by the ThreadCard implementation.

**TDD Step 4: Commit**

```bash
git add packages/web/src/ChannelFeed.tsx
git commit -m "Wire ThreadCard into ChannelFeed, replacing inline card rendering"
```

---

## Phase 3: Channel Header

### Task 3.1: Add refresh and "+ New" buttons to channel header

The channel header currently shows `#channelName` and a status line. Add:
- A refresh button (`⟳`) that calls a new `onRefreshFeed` callback
- A `+ New` button that scrolls to and focuses the composer textarea

**Files:**

- Modify: `packages/web/src/ChannelFeed.tsx`
- Modify: `packages/web/src/ChannelFeed.tsx` (add `composerRef` for scroll-to-focus)
- Create: `packages/web/src/ChannelFeed.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/ChannelFeed.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the ChannelFeed component — header buttons, composer, and feed rendering
// ABOUTME: Validates refresh, new-thread, and composer interactions

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChannelFeed } from './ChannelFeed';
import type { ChannelFeedPost, ChannelSummary } from './api';

const defaultChannel: ChannelSummary = {
  id: 'ch-1',
  name: 'engineering',
  slug: 'engineering',
};

const defaultProps = {
  selectedChannel: defaultChannel,
  feedPosts: [] as ChannelFeedPost[],
  selectedThreadId: null,
  newPostMessage: '',
  isFeedLoading: false,
  isCreatingPost: false,
  feedError: undefined,
  onOpenThread: vi.fn(),
  onChangeNewPostMessage: vi.fn(),
  onCreatePost: vi.fn(),
  onComposerKeyDown: vi.fn(),
  onRefreshFeed: vi.fn(),
};

describe('ChannelFeed', () => {
  afterEach(cleanup);

  it('renders the channel name with # prefix', () => {
    render(<ChannelFeed {...defaultProps} />);
    expect(screen.getByText('#engineering')).toBeTruthy();
  });

  it('renders a refresh button that calls onRefreshFeed', () => {
    const onRefreshFeed = vi.fn();
    render(<ChannelFeed {...defaultProps} onRefreshFeed={onRefreshFeed} />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);
    expect(onRefreshFeed).toHaveBeenCalledOnce();
  });

  it('renders a "+ New" button', () => {
    render(<ChannelFeed {...defaultProps} />);
    expect(screen.getByRole('button', { name: /new/i })).toBeTruthy();
  });

  it('focuses the composer when "+ New" is clicked', () => {
    render(<ChannelFeed {...defaultProps} />);

    const newButton = screen.getByRole('button', { name: /new/i });
    fireEvent.click(newButton);

    const composer = screen.getByPlaceholderText(/start a new thread/i);
    expect(document.activeElement).toBe(composer);
  });

  it('disables refresh button while feed is loading', () => {
    render(<ChannelFeed {...defaultProps} isFeedLoading={true} />);
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    expect(refreshButton).toHaveProperty('disabled', true);
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ChannelFeed.test.tsx
```

**TDD Step 3: Implement**

In `packages/web/src/ChannelFeed.tsx`:

1. Add `onRefreshFeed: () => void` to `ChannelFeedProps`.
2. Add a `useRef` for the composer textarea.
3. Update the header JSX:

```tsx
<header className="channel-feed-header">
  <div className="channel-feed-header-row">
    <h2>#{selectedChannel?.name ?? 'Select a channel'}</h2>
    <div className="channel-feed-header-actions">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Refresh feed"
        onClick={onRefreshFeed}
        disabled={isFeedLoading}
      >
        &#x27F3;
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="New thread"
        onClick={() => {
          composerRef.current?.scrollIntoView({ behavior: 'smooth' });
          composerRef.current?.focus();
        }}
      >
        + New
      </Button>
    </div>
  </div>
  <p className="channel-status">
    {isFeedLoading ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
        <Spinner size="sm" /> Loading feed...
      </span>
    ) : (
      'Thread roots appear here.'
    )}
  </p>
</header>
```

4. Remove the eyebrow `<p>` — the design doc shows only the channel name, not an eyebrow label.
5. Add `ref={composerRef}` to the composer `<Textarea>`.
6. Update the composer placeholder to match design doc: `Start a new thread in #${channelName}...`

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ChannelFeed.test.tsx
```

Also verify existing tests still pass:

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**Important:** The existing `App.test.tsx` test `'shows loading text while the channel feed is loading'` looks for `screen.findByText(/loading feed/i)` — this text is preserved in the updated header. The test `'creates a new channel post...'` looks for `screen.getByLabelText(/start a post/i)` — this label must be updated to match the new composer label, OR the App.test.tsx test must be updated to match. Check carefully and update the label in the test if the composer label changes.

**Note on App.test.tsx compatibility:** The existing tests reference `screen.getByLabelText(/start a post/i)` for the composer. If the composer label changes (e.g., to the placeholder text), update these test selectors. The `aria-label` on the textarea should remain stable or be updated in both places.

**TDD Step 5: Commit**

```bash
git add packages/web/src/ChannelFeed.tsx packages/web/src/ChannelFeed.test.tsx
git commit -m "Add refresh and new-thread buttons to channel feed header"
```

---

### Task 3.2: Add channel header CSS

Style the header row with the channel name on the left and action buttons on the right.

**Files:**

- Modify: `packages/web/src/styles.css`

**TDD Step 1: Write failing test**

Add to `packages/web/src/threadCard.styles.test.ts` (or create a separate test — adding here for simplicity since it's the same CSS file):

```ts
it('defines channel header row as a flex container with space-between', () => {
  const normalized = normalizeCss(styles);
  expect(normalized).toMatch(
    /\.channel-feed-header-row\s*\{[^}]*display:\s*flex/,
  );
  expect(normalized).toMatch(
    /\.channel-feed-header-row\s*\{[^}]*justify-content:\s*space-between/,
  );
});

it('defines channel header actions as a flex row', () => {
  const normalized = normalizeCss(styles);
  expect(normalized).toMatch(
    /\.channel-feed-header-actions\s*\{[^}]*display:\s*flex/,
  );
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/threadCard.styles.test.ts
```

**TDD Step 3: Implement**

Add to `packages/web/src/styles.css` in the channel feed section:

```css
.channel-feed-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.channel-feed-header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/threadCard.styles.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/threadCard.styles.test.ts
git commit -m "Add channel header row CSS with space-between alignment"
```

---

### Task 3.3: Wire onRefreshFeed in App.tsx

Add the `onRefreshFeed` prop to the `ChannelFeed` usage in App.tsx. The handler re-calls `handleLoadFeed` with the current project and channel.

**Files:**

- Modify: `packages/web/src/App.tsx`

**TDD Step 1: Verify existing tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 2: Implement**

In `packages/web/src/App.tsx`, add to the `<ChannelFeed>` props:

```tsx
onRefreshFeed={() => {
  if (route.name === 'chat' && route.projectId && selectedChannelId) {
    void handleLoadFeed(route.projectId, selectedChannelId);
  }
}}
```

**Note:** Since `App.tsx` may have already been refactored by 11a to use the router, the route access pattern may differ. Use `useRoute().params.projectId` if the router is already wired, or the existing `route` state if not. Match whatever pattern the current code uses.

**TDD Step 3: Verify existing tests still pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 4: Run typecheck**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm typecheck
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "Wire onRefreshFeed callback to ChannelFeed in App"
```

---

## Phase 4: Collapsing Composer

### Task 4.1: Implement collapsing composer behavior

The composer should:
- Default to a single-line height (1 row)
- Expand to 3-4 rows when focused
- Collapse back to 1 row when blurred (if the textarea is empty)
- Stay expanded if the textarea has content
- Show a keyboard shortcut hint (`Cmd+Enter` on Mac, `Ctrl+Enter` on others)
- Remove the explicit "Send to channel" button — keyboard shortcut is primary

**Files:**

- Modify: `packages/web/src/ChannelFeed.tsx`
- Modify: `packages/web/src/ChannelFeed.test.tsx`

**TDD Step 1: Write failing tests**

Add to `packages/web/src/ChannelFeed.test.tsx`:

```tsx
describe('ChannelFeed composer', () => {
  afterEach(cleanup);

  it('renders the composer with 1 row by default', () => {
    render(<ChannelFeed {...defaultProps} />);
    const composer = screen.getByPlaceholderText(/start a new thread/i);
    expect(composer.getAttribute('rows')).toBe('1');
  });

  it('expands to 4 rows on focus', () => {
    render(<ChannelFeed {...defaultProps} />);
    const composer = screen.getByPlaceholderText(/start a new thread/i);
    fireEvent.focus(composer);
    expect(composer.getAttribute('rows')).toBe('4');
  });

  it('collapses back to 1 row on blur when empty', () => {
    render(<ChannelFeed {...defaultProps} />);
    const composer = screen.getByPlaceholderText(/start a new thread/i);
    fireEvent.focus(composer);
    expect(composer.getAttribute('rows')).toBe('4');
    fireEvent.blur(composer);
    expect(composer.getAttribute('rows')).toBe('1');
  });

  it('stays expanded on blur when text is present', () => {
    render(<ChannelFeed {...defaultProps} newPostMessage="draft text" />);
    const composer = screen.getByPlaceholderText(/start a new thread/i);
    fireEvent.focus(composer);
    expect(composer.getAttribute('rows')).toBe('4');
    fireEvent.blur(composer);
    expect(composer.getAttribute('rows')).toBe('4');
  });

  it('displays a keyboard shortcut hint', () => {
    render(<ChannelFeed {...defaultProps} />);
    // The hint text should be visible somewhere near the composer
    expect(screen.getByText(/[⌘⏎]|Cmd.*Enter|Ctrl.*Enter/i)).toBeTruthy();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ChannelFeed.test.tsx
```

**TDD Step 3: Implement**

In `packages/web/src/ChannelFeed.tsx`:

1. Add `useState` for `isComposerExpanded`:

```tsx
const [isComposerExpanded, setIsComposerExpanded] = useState(false);
```

2. Compute the row count:

```tsx
const composerRows = isComposerExpanded || newPostMessage.length > 0 ? 4 : 1;
```

3. Update the composer section:

```tsx
<div className="composer-panel">
  <InlineError message={feedError} />
  <div className="composer-wrapper">
    <Textarea
      ref={composerRef}
      aria-label="Start a new thread"
      value={newPostMessage}
      onChange={(event) => onChangeNewPostMessage(event.target.value)}
      onKeyDown={onComposerKeyDown}
      onFocus={() => setIsComposerExpanded(true)}
      onBlur={() => {
        if (!newPostMessage) {
          setIsComposerExpanded(false);
        }
      }}
      rows={composerRows}
      placeholder={`Start a new thread in #${selectedChannel?.name ?? 'channel'}...`}
    />
    <span className="composer-hint">
      {navigator.platform?.includes('Mac') ? '⌘⏎' : 'Ctrl+Enter'}
    </span>
  </div>
</div>
```

4. Remove the explicit `<Button>` for sending (the `+ New` button in the header and keyboard shortcut replace it). If this breaks existing App.test.tsx tests that click "Send to general", those tests need to be updated to use keyboard shortcut instead, or the button can be kept as a subtle icon button inside the composer.

**Decision point:** The design doc says "No separate 'Send' button — keyboard shortcut is primary. Small send icon inside the input for discoverability." So: remove the full button, add a small send icon inside the composer wrapper. However, if existing App.test.tsx tests depend on a "Send to" button, keep it temporarily and note it for the implementer to reconcile.

**Important note for implementer:** Check `App.test.tsx` for references to `screen.getByRole('button', { name: /send to general/i })` and similar selectors. If these exist, you have two options:
1. Keep a small send button with the same text (safe, preserves tests)
2. Update the tests to use keyboard submission (matches design doc, but requires test changes)

Recommend option 1 for this task — keep the button but style it as a small icon/text inside the composer. Then revisit in a cleanup pass.

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ChannelFeed.test.tsx
```

Also verify existing tests:

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/ChannelFeed.tsx packages/web/src/ChannelFeed.test.tsx
git commit -m "Implement collapsing composer with focus/blur behavior and keyboard hint"
```

---

### Task 4.2: Add composer CSS

Style the collapsing composer with transition, keyboard hint positioning, and wrapper layout.

**Files:**

- Modify: `packages/web/src/styles.css`

**TDD Step 1: Write failing test**

Add to `packages/web/src/threadCard.styles.test.ts`:

```ts
it('defines the composer wrapper as a positioned container', () => {
  const normalized = normalizeCss(styles);
  expect(normalized).toMatch(/\.composer-wrapper\s*\{[^}]*position:\s*relative/);
});

it('positions the composer hint absolutely within the wrapper', () => {
  const normalized = normalizeCss(styles);
  expect(normalized).toMatch(/\.composer-hint\s*\{[^}]*position:\s*absolute/);
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/threadCard.styles.test.ts
```

**TDD Step 3: Implement**

Add to `packages/web/src/styles.css`:

```css
.composer-wrapper {
  position: relative;
}

.composer-wrapper textarea {
  transition: height 150ms ease;
}

.composer-hint {
  position: absolute;
  bottom: 0.5rem;
  right: 0.6rem;
  font-size: 0.7rem;
  color: var(--muted-foreground);
  pointer-events: none;
  opacity: 0.6;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/threadCard.styles.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/threadCard.styles.test.ts
git commit -m "Add composer wrapper CSS with hint positioning and textarea transition"
```

---

## Phase 5: Compressed Index Mode

### Task 5.1: Add compressed thread card styles

When a thread is open (State B), the `.mindspace-shell.thread-open` class is applied by Phase 11a. The thread index column compresses to ~300px. Thread cards need to adapt:
- Message preview truncates to 1 line instead of 2
- Timestamp in header may be hidden or abbreviated
- Meta row becomes more compact

These are CSS-only changes triggered by the parent `.thread-open` class.

**Files:**

- Modify: `packages/web/src/styles.css`
- Create: `packages/web/src/compressedIndex.styles.test.ts`

**TDD Step 1: Write failing test**

Create `packages/web/src/compressedIndex.styles.test.ts`:

```ts
// ABOUTME: Tests that CSS defines compressed thread card styles for State B
// ABOUTME: Validates 1-line truncation and compact layout when thread detail is open

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('compressed index mode styles', () => {
  it('truncates feed-card-text to 1 line when thread is open', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(
      /\.thread-open\s+\.feed-card-text\s*\{[^}]*-webkit-line-clamp:\s*1/,
    );
  });

  it('reduces feed-card-button padding when thread is open', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(
      /\.thread-open\s+\.feed-card-button\s*\{[^}]*padding/,
    );
  });

  it('hides the composer hint in compressed mode', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(
      /\.thread-open\s+\.composer-hint\s*\{[^}]*display:\s*none/,
    );
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/compressedIndex.styles.test.ts
```

**TDD Step 3: Implement**

Add to `packages/web/src/styles.css`, in a new section after the existing channel feed styles:

```css
/* ─── Compressed thread index (State B — thread open) ────────────────────── */
.thread-open .feed-card-button {
  padding: 0.6rem 0.75rem;
}

.thread-open .feed-card-text {
  font-size: 0.825rem;
  -webkit-line-clamp: 1;
}

.thread-open .feed-card-header {
  gap: 0.4rem;
}

.thread-open .feed-card-timestamp {
  font-size: 0.7rem;
}

.thread-open .feed-card-meta {
  margin-top: 0.5rem;
  font-size: 0.75rem;
}

.thread-open .composer-hint {
  display: none;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/compressedIndex.styles.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/compressedIndex.styles.test.ts
git commit -m "Add compressed thread index CSS for State B (thread detail open)"
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
| `packages/web/src/formatTimestamp.ts` | 6-tier relative timestamp formatting utility |
| `packages/web/src/formatTimestamp.test.ts` | Tests for formatTimestamp |
| `packages/web/src/ThreadCard.tsx` | Rich thread card component with author, timestamp, preview, reply count |
| `packages/web/src/ThreadCard.test.tsx` | Tests for ThreadCard |
| `packages/web/src/ChannelFeed.test.tsx` | Tests for ChannelFeed header buttons and composer behavior |
| `packages/web/src/threadCard.styles.test.ts` | Tests for thread card and channel header CSS |
| `packages/web/src/compressedIndex.styles.test.ts` | Tests for compressed index mode CSS |

### Files modified

| File | Changes |
|------|---------|
| `packages/web/src/ChannelFeed.tsx` | Replace inline cards with ThreadCard; add header buttons (refresh, + New); collapsing composer with focus/blur; remove explicit send button; add composerRef for scroll-to-focus |
| `packages/web/src/styles.css` | Thread card header/text/meta styles; 2-line truncation; channel header row layout; composer wrapper/hint positioning; compressed index mode overrides |
| `packages/web/src/App.tsx` | Add `onRefreshFeed` prop to ChannelFeed usage |

### Files NOT modified (left for future phases)

| File | Reason |
|------|--------|
| `packages/web/src/api.ts` | No API changes — author display names and participant data will come from future API enhancements. Thread card derives author from `rootMessageRole` for now. |
| `packages/web/src/ThreadDrawer.tsx` | Thread detail redesign is Phase 11d |
| `packages/web/src/Sidebar.tsx` | Already handled by Phase 11b |
| `packages/ui/src/styles.css` | No design system token changes needed |

### Deferred features (not in scope for 11c)

| Feature | Reason |
|---------|--------|
| **Participant avatars** | API doesn't return participant data yet. Add when API supports it. |
| **Unread dot** | Requires read-state tracking, which is not yet implemented on the backend. |
| **Live indicator** ("Claude is responding...") | Requires streaming state awareness at the feed level. Add in the streaming enhancements phase. |
| **Author display name** | API returns `rootMessageRole` only, not a display name. "You" for user role, capitalized role name for others. Will be replaced when API provides proper author info. |
