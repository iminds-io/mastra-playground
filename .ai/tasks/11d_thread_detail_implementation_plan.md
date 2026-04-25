# ABOUTME: Implementation plan for Phase 11d — Thread Detail (Conversation View)
# ABOUTME: Covers message components, avatar system, markdown rendering, reply composer, and streaming behavior

# Phase 11d: Thread Detail (Conversation View) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: Phase 11a (Foundation) provides: layout shell with thread drawer slot, CSS transitions for slide-in, auth state. Phase 11c (Thread Index) provides: thread cards that trigger `onOpenThread`, compressed thread index when detail is open. Existing `ThreadDrawer.tsx`, `App.tsx`, `api.ts`, and test infrastructure.

**Goal:** Replace the current minimal thread drawer with a polished conversation view: structured thread header with context line, message components with an avatar system (human initials vs mind emoji with accent ring), markdown rendering for message bodies, a reply composer with mind mention chips, and proper streaming behavior with visual phases (dashed border, blinking cursor, solid on complete).

**Architecture:** Build bottom-up from utility functions (avatar colors, timestamp formatting), through presentational components (Avatar, MessageCard, MarkdownBody), up to the composed ThreadDrawer. Each task is independently testable. The existing `ThreadDrawer.tsx` is rewritten in place — same file path, same import in `App.tsx` — so no routing or layout changes are needed.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Vitest 4 + @testing-library/react, `@mastra-mindspace/ui` design system (Button, Card, Badge, Spinner, Textarea, ScrollArea, cn()). No external markdown library — we build a minimal markdown renderer since AI messages use a predictable subset. CSS custom properties from `packages/ui/src/styles.css`.

---

## Current State Summary

| Area | What exists | File |
|------|-------------|------|
| **Thread drawer** | Minimal aside with header ("Thread" eyebrow, "Conversation" / "Select a post" heading), message list as plain `<Card>` elements showing role label + plain text, streaming card with dashed border, reply textarea + button. | `packages/web/src/ThreadDrawer.tsx` |
| **Message rendering** | Raw `entry.text` in `<p>` tags. Role shown as uppercase label ("user" / "assistant"). No avatars, no names, no markdown. | `ThreadDrawer.tsx` lines 73-84 |
| **Streaming** | Streaming reply shown in a separate card with `thread-message-streaming` class (dashed border). Role hardcoded as "assistant". Clears on `message_saved` or `done` event. | `ThreadDrawer.tsx` lines 86-91, `App.tsx` lines 461-533 |
| **Reply composer** | Label "Reply in thread", `<Textarea>` + `<Button>`. Cmd/Ctrl+Enter submits. No mention chips. | `ThreadDrawer.tsx` lines 96-111 |
| **Thread header** | "Thread" eyebrow, generic "Conversation" heading, close button, subtitle text. No author name, no channel name, no timestamp context. | `ThreadDrawer.tsx` lines 46-63 |
| **Avatar system** | None. No avatars anywhere. | — |
| **Auto-scroll** | `useRef` + `scrollIntoView({ behavior: 'smooth' })` on message/streaming changes. | `ThreadDrawer.tsx` lines 38-42 |
| **Data types** | `ThreadMessage { id, role, text, createdAt }`, `ThreadSummary { id, channelId, title, lastMessageAt, createdAt, updatedAt }`. No author name on messages. | `packages/web/src/api.ts` lines 69-74, 60-67 |
| **CSS** | `.thread-drawer`, `.thread-header`, `.thread-messages`, `.thread-message-role`, `.thread-message-streaming`, `.thread-subtitle` classes defined. | `packages/web/src/styles.css` lines 262-310 |
| **Tests** | Thread drawer tested indirectly through `App.test.tsx` — opens thread, sees message text, close button works. 10 tests total. | `packages/web/src/App.test.tsx` |

---

## Success Criteria

- [ ] Thread header shows "Thread" eyebrow, context line "Started by [Author] · #[channel] · [time]", and close button `✕`
- [ ] Message components display avatar + author name + timestamp on top row, markdown-rendered body below
- [ ] Human avatars show 2-letter initials with deterministic color from name hash, no ring
- [ ] Mind avatars show emoji/icon with 2px accent-colored ring
- [ ] Current user avatars have thin primary ring
- [ ] Markdown renderer handles: paragraphs, bold, italic, inline code, code blocks with copy button, ordered/unordered lists, links, blockquotes
- [ ] Streaming messages show dashed border, "typing..." indicator, blinking cursor `▊`
- [ ] Completed streaming messages transition to solid border with timestamp
- [ ] Reply composer shows mind mention chips (@Claude, @Reviewer) below the textarea
- [ ] Auto-scroll to bottom on new messages
- [ ] Visual distinction between human and mind messages is subtle (accent ring + name color, not different backgrounds)
- [ ] All existing tests continue to pass
- [ ] New tests cover each new behavior
- [ ] `pnpm typecheck` passes across all packages

---

## Recommended Sequencing

Execute these tasks in order. Each task is independently committable.

1. **Task 1: Timestamp formatting utility** — Relative time display function
2. **Task 2: Avatar color utility** — Deterministic color generation from name hash
3. **Task 3: Avatar component** — Renders human initials, mind emoji, or current user
4. **Task 4: Markdown renderer** — Minimal markdown-to-React renderer for AI message content
5. **Task 5: MessageCard component** — Composes avatar, name, timestamp, and markdown body
6. **Task 6: Thread header redesign** — Context line with author, channel, and timestamp
7. **Task 7: Streaming message treatment** — Dashed border, typing indicator, blinking cursor
8. **Task 8: Reply composer with mention chips** — Mind mention chips below textarea
9. **Task 9: Wire components into ThreadDrawer** — Replace existing message rendering with new components
10. **Task 10: Thread detail CSS** — Styles for all new components

---

## Task 1: Timestamp Formatting Utility

Create a utility function that formats timestamps according to the design doc rules: "Just now" (< 1 min), "5 min ago" (< 60 min), "2:30 PM" (today), "Yesterday, 2:30 PM", "Apr 23, 2:30 PM" (this year), "Apr 23, 2025" (older).

**Files:**

- Create: `packages/web/src/formatTimestamp.ts`
- Create: `packages/web/src/formatTimestamp.test.ts`

**TDD Step 1: Write failing tests**

Create `packages/web/src/formatTimestamp.test.ts`:

```ts
// ABOUTME: Tests for relative and absolute timestamp formatting
// ABOUTME: Validates all 6 time-range display rules from the design doc

import { describe, expect, it } from 'vitest';

import { formatTimestamp } from './formatTimestamp';

describe('formatTimestamp', () => {
  const now = new Date('2026-04-24T14:30:00.000Z');

  it('returns "Just now" for timestamps less than 1 minute old', () => {
    const thirtySecondsAgo = new Date(now.getTime() - 30_000).toISOString();
    expect(formatTimestamp(thirtySecondsAgo, now)).toBe('Just now');
  });

  it('returns relative minutes for timestamps less than 60 minutes old', () => {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(formatTimestamp(fiveMinutesAgo, now)).toBe('5 min ago');
  });

  it('returns "1 min ago" for exactly 1 minute', () => {
    const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
    expect(formatTimestamp(oneMinuteAgo, now)).toBe('1 min ago');
  });

  it('returns time only for timestamps from today (>= 60 min ago)', () => {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000).toISOString();
    const result = formatTimestamp(twoHoursAgo, now);
    // Should be a time like "12:30 PM" — exact format depends on locale
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
  });

  it('returns "Yesterday" + time for yesterday timestamps', () => {
    const yesterday = new Date('2026-04-23T10:15:00.000Z');
    const result = formatTimestamp(yesterday.toISOString(), now);
    expect(result).toMatch(/^Yesterday/);
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
  });

  it('returns month + day + time for same-year timestamps older than yesterday', () => {
    const lastWeek = new Date('2026-04-17T09:00:00.000Z');
    const result = formatTimestamp(lastWeek.toISOString(), now);
    expect(result).toMatch(/Apr\s+17/);
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
  });

  it('returns full date without time for timestamps from a different year', () => {
    const lastYear = new Date('2025-12-25T09:00:00.000Z');
    const result = formatTimestamp(lastYear.toISOString(), now);
    expect(result).toMatch(/Dec\s+25,\s+2025/);
  });

  it('handles edge case of exactly 59 minutes ago as relative', () => {
    const fiftyNineMinAgo = new Date(now.getTime() - 59 * 60_000).toISOString();
    expect(formatTimestamp(fiftyNineMinAgo, now)).toBe('59 min ago');
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/formatTimestamp.test.ts
```

Expected: fails because `formatTimestamp` module does not exist.

**TDD Step 3: Implement**

Create `packages/web/src/formatTimestamp.ts`:

```ts
// ABOUTME: Formats ISO timestamps into human-readable relative or absolute strings
// ABOUTME: Implements 6 display tiers: just now, minutes ago, today, yesterday, this year, older

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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

export function formatTimestamp(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < MINUTE_MS) {
    return 'Just now';
  }

  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    return `${minutes} min ago`;
  }

  if (isSameDay(date, now)) {
    return formatTime(date);
  }

  if (isYesterday(date, now)) {
    return `Yesterday, ${formatTime(date)}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) + ', ' + formatTime(date);
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/formatTimestamp.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/formatTimestamp.ts packages/web/src/formatTimestamp.test.ts
git commit -m "Add timestamp formatting utility with 6-tier relative/absolute display"
```

---

## Task 2: Avatar Color Utility

Create a deterministic color generator that produces consistent OKLCH hue values from a name string. This ensures the same person always gets the same avatar color across sessions.

**Files:**

- Create: `packages/web/src/avatarColor.ts`
- Create: `packages/web/src/avatarColor.test.ts`

**TDD Step 1: Write failing tests**

Create `packages/web/src/avatarColor.test.ts`:

```ts
// ABOUTME: Tests for deterministic avatar color generation from name strings
// ABOUTME: Validates consistency, distribution, and initial extraction

import { describe, expect, it } from 'vitest';

import { getAvatarColor, getInitials } from './avatarColor';

describe('getAvatarColor', () => {
  it('returns the same color for the same name', () => {
    const color1 = getAvatarColor('Alice Chen');
    const color2 = getAvatarColor('Alice Chen');
    expect(color1).toBe(color2);
  });

  it('returns different colors for different names', () => {
    const color1 = getAvatarColor('Alice Chen');
    const color2 = getAvatarColor('Bob Martinez');
    expect(color1).not.toBe(color2);
  });

  it('returns a valid OKLCH color string', () => {
    const color = getAvatarColor('Alice Chen');
    expect(color).toMatch(/^oklch\(\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?\)$/);
  });

  it('produces colors in the usable hue range (0-360)', () => {
    const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace'];
    for (const name of names) {
      const color = getAvatarColor(name);
      const hueMatch = color.match(/oklch\([\d.]+\s+[\d.]+\s+([\d.]+)\)/);
      expect(hueMatch).toBeTruthy();
      const hue = Number(hueMatch![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe('getInitials', () => {
  it('returns first letters of first and last name', () => {
    expect(getInitials('Alice Chen')).toBe('AC');
  });

  it('returns first two letters for a single name', () => {
    expect(getInitials('Alice')).toBe('AL');
  });

  it('handles three or more names by using first and last', () => {
    expect(getInitials('Alice B Chen')).toBe('AC');
  });

  it('uppercases the result', () => {
    expect(getInitials('alice chen')).toBe('AC');
  });

  it('handles empty string gracefully', () => {
    expect(getInitials('')).toBe('??');
  });

  it('handles null/undefined by returning fallback', () => {
    expect(getInitials(null as unknown as string)).toBe('??');
    expect(getInitials(undefined as unknown as string)).toBe('??');
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/avatarColor.test.ts
```

**TDD Step 3: Implement**

Create `packages/web/src/avatarColor.ts`:

```ts
// ABOUTME: Deterministic avatar color and initials from user display names
// ABOUTME: Produces consistent OKLCH colors via simple string hashing

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

export function getAvatarColor(name: string): string {
  const hue = hashString(name) % 360;
  return `oklch(0.65 0.15 ${hue})`;
}

export function getInitials(name: string): string {
  if (!name || typeof name !== 'string') {
    return '??';
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return '??';
  }

  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    return trimmed.slice(0, 2).toUpperCase();
  }

  const first = parts[0]![0]!;
  const last = parts[parts.length - 1]![0]!;

  return `${first}${last}`.toUpperCase();
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/avatarColor.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/avatarColor.ts packages/web/src/avatarColor.test.ts
git commit -m "Add deterministic avatar color and initials utilities"
```

---

## Task 3: Avatar Component

Create a React component that renders three avatar variants: human (initials + colored background), mind (emoji + accent ring), and current user (initials + primary ring).

**Files:**

- Create: `packages/web/src/Avatar.tsx`
- Create: `packages/web/src/Avatar.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/Avatar.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the Avatar component — human, mind, and current-user variants
// ABOUTME: Validates initials, colors, rings, and aria labels

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  afterEach(cleanup);

  describe('human variant', () => {
    it('renders initials from the display name', () => {
      render(<Avatar type="human" name="Alice Chen" />);
      expect(screen.getByText('AC')).toBeTruthy();
    });

    it('applies a deterministic background color', () => {
      const { container } = render(<Avatar type="human" name="Alice Chen" />);
      const avatar = container.querySelector('.avatar');
      expect(avatar).toBeTruthy();
      const style = avatar!.getAttribute('style');
      expect(style).toContain('oklch');
    });

    it('does not render a ring', () => {
      const { container } = render(<Avatar type="human" name="Alice Chen" />);
      const avatar = container.querySelector('.avatar');
      expect(avatar!.className).not.toContain('avatar-ring');
    });
  });

  describe('mind variant', () => {
    it('renders the emoji', () => {
      render(<Avatar type="mind" name="Claude" emoji="🤖" />);
      expect(screen.getByText('🤖')).toBeTruthy();
    });

    it('renders an accent ring', () => {
      const { container } = render(<Avatar type="mind" name="Claude" emoji="🤖" />);
      const avatar = container.querySelector('.avatar');
      expect(avatar!.className).toContain('avatar-ring-accent');
    });
  });

  describe('current-user variant', () => {
    it('renders initials with a primary ring', () => {
      const { container } = render(<Avatar type="current-user" name="Alice Chen" />);
      expect(screen.getByText('AC')).toBeTruthy();
      const avatar = container.querySelector('.avatar');
      expect(avatar!.className).toContain('avatar-ring-primary');
    });
  });

  it('has an accessible aria-label', () => {
    render(<Avatar type="human" name="Alice Chen" />);
    expect(screen.getByLabelText('Alice Chen')).toBeTruthy();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/Avatar.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/Avatar.tsx`:

```tsx
// ABOUTME: Avatar component for human initials, mind emoji, and current-user display
// ABOUTME: Uses deterministic color hashing for consistent appearance across sessions

import { cn } from '@mastra-mindspace/ui';

import { getAvatarColor, getInitials } from './avatarColor';

export type AvatarProps =
  | { type: 'human'; name: string; emoji?: never }
  | { type: 'mind'; name: string; emoji: string }
  | { type: 'current-user'; name: string; emoji?: never };

export function Avatar({ type, name, emoji }: AvatarProps) {
  const isMind = type === 'mind';
  const isCurrentUser = type === 'current-user';
  const content = isMind ? emoji : getInitials(name);
  const bgColor = isMind ? undefined : getAvatarColor(name);

  return (
    <span
      className={cn(
        'avatar',
        isMind && 'avatar-ring-accent',
        isCurrentUser && 'avatar-ring-primary',
      )}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
      aria-label={name}
      role="img"
    >
      {content}
    </span>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/Avatar.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/Avatar.tsx packages/web/src/Avatar.test.tsx
git commit -m "Add Avatar component with human, mind, and current-user variants"
```

---

## Task 4: Markdown Renderer

Build a minimal markdown-to-React renderer that handles the subset of markdown that AI messages produce: paragraphs, bold, italic, inline code, code blocks, ordered/unordered lists, links, and blockquotes. Code blocks include a copy button.

**Decision note:** We build this ourselves rather than pulling in `react-markdown` + `remark` + `rehype` because: (a) no markdown library exists in `package.json` yet, (b) the subset is small and predictable, (c) we avoid a ~50KB dependency for 8 rules. If rendering fidelity becomes insufficient, we can swap to `react-markdown` later without changing the component API.

**Files:**

- Create: `packages/web/src/MarkdownBody.tsx`
- Create: `packages/web/src/MarkdownBody.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/MarkdownBody.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the minimal markdown renderer — covers all supported elements
// ABOUTME: Validates paragraph, bold, italic, code, code blocks, lists, links, blockquotes

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownBody } from './MarkdownBody';

describe('MarkdownBody', () => {
  afterEach(cleanup);

  it('renders plain text as a paragraph', () => {
    render(<MarkdownBody text="Hello world" />);
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders multiple paragraphs from double newlines', () => {
    const { container } = render(<MarkdownBody text="First paragraph\n\nSecond paragraph" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders **bold** text', () => {
    const { container } = render(<MarkdownBody text="This is **bold** text" />);
    const strong = container.querySelector('strong');
    expect(strong).toBeTruthy();
    expect(strong!.textContent).toBe('bold');
  });

  it('renders *italic* text', () => {
    const { container } = render(<MarkdownBody text="This is *italic* text" />);
    const em = container.querySelector('em');
    expect(em).toBeTruthy();
    expect(em!.textContent).toBe('italic');
  });

  it('renders `inline code`', () => {
    const { container } = render(<MarkdownBody text="Use `const x = 1` here" />);
    const code = container.querySelector('code');
    expect(code).toBeTruthy();
    expect(code!.textContent).toBe('const x = 1');
  });

  it('renders fenced code blocks with a copy button', () => {
    const text = '```js\nconsole.log("hi")\n```';
    const { container } = render(<MarkdownBody text={text} />);
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toContain('console.log("hi")');
    const copyButton = container.querySelector('.code-block-copy');
    expect(copyButton).toBeTruthy();
  });

  it('renders unordered lists from lines starting with -', () => {
    const text = '- Item one\n- Item two\n- Item three';
    const { container } = render(<MarkdownBody text={text} />);
    const ul = container.querySelector('ul');
    expect(ul).toBeTruthy();
    const items = ul!.querySelectorAll('li');
    expect(items.length).toBe(3);
  });

  it('renders ordered lists from numbered lines', () => {
    const text = '1. First\n2. Second\n3. Third';
    const { container } = render(<MarkdownBody text={text} />);
    const ol = container.querySelector('ol');
    expect(ol).toBeTruthy();
    const items = ol!.querySelectorAll('li');
    expect(items.length).toBe(3);
  });

  it('renders [links](url) as anchor tags', () => {
    render(<MarkdownBody text="Visit [Google](https://google.com) today" />);
    const link = screen.getByRole('link', { name: 'Google' });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://google.com');
  });

  it('renders blockquotes from lines starting with >', () => {
    const { container } = render(<MarkdownBody text="> This is a quote" />);
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeTruthy();
    expect(blockquote!.textContent).toContain('This is a quote');
  });

  it('copies code block content to clipboard on copy button click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const text = '```\nhello world\n```';
    const { container } = render(<MarkdownBody text={text} />);
    const copyButton = container.querySelector('.code-block-copy') as HTMLButtonElement;
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith('hello world');
  });

  it('renders empty string without crashing', () => {
    const { container } = render(<MarkdownBody text="" />);
    expect(container).toBeTruthy();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/MarkdownBody.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/MarkdownBody.tsx`:

```tsx
// ABOUTME: Minimal markdown-to-React renderer for AI message content
// ABOUTME: Handles paragraphs, bold, italic, inline code, code blocks, lists, links, blockquotes

import { type ReactNode, useState } from 'react';

type MarkdownBodyProps = {
  text: string;
};

function parseInline(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Pattern matches: **bold**, *italic*, `code`, [text](url)
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[4]) {
      nodes.push(<em key={key++}>{match[4]}</em>);
    } else if (match[6]) {
      nodes.push(<code key={key++}>{match[6]}</code>);
    } else if (match[8] && match[9]) {
      nodes.push(
        <a key={key++} href={match[9]} target="_blank" rel="noopener noreferrer">
          {match[8]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="code-block-wrapper">
      <button
        className="code-block-copy"
        onClick={handleCopy}
        aria-label="Copy code"
        type="button"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code data-language={language || undefined}>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownBody({ text }: MarkdownBodyProps) {
  if (!text) {
    return null;
  }

  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      elements.push(<CodeBlock key={key++} code={codeLines.join('\n')} language={language} />);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('> ')) {
        quoteLines.push(lines[i]!.slice(2));
        i++;
      }
      elements.push(
        <blockquote key={key++}>
          {quoteLines.map((ql, qi) => (
            <p key={qi}>{parseInline(ql)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('- ')) {
        items.push(lines[i]!.slice(2));
        i++;
      }
      elements.push(
        <ul key={key++}>
          {items.map((item, li) => (
            <li key={li}>{parseInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={key++}>
          {items.map((item, li) => (
            <li key={li}>{parseInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Empty line (paragraph break)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(<p key={key++}>{parseInline(line)}</p>);
    i++;
  }

  return <div className="markdown-body">{elements}</div>;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/MarkdownBody.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/MarkdownBody.tsx packages/web/src/MarkdownBody.test.tsx
git commit -m "Add minimal markdown renderer for AI message content"
```

---

## Task 5: MessageCard Component

Compose the Avatar, author name, timestamp, and MarkdownBody into a single message card. Handles both human and mind messages with appropriate visual distinction.

**Files:**

- Create: `packages/web/src/MessageCard.tsx`
- Create: `packages/web/src/MessageCard.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/MessageCard.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the MessageCard component — layout, avatar, timestamp, and markdown body
// ABOUTME: Validates human vs mind visual distinction and streaming state

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MessageCard } from './MessageCard';

describe('MessageCard', () => {
  afterEach(cleanup);

  const humanMessage = {
    id: 'msg-1',
    role: 'user',
    text: 'Hello **world**',
    createdAt: '2026-04-24T14:30:00.000Z',
    authorName: 'Alice Chen',
  };

  const mindMessage = {
    id: 'msg-2',
    role: 'assistant',
    text: 'I can help with that.',
    createdAt: '2026-04-24T14:31:00.000Z',
    authorName: 'Claude',
    authorEmoji: '🤖',
  };

  it('renders the author name', () => {
    render(<MessageCard message={humanMessage} />);
    expect(screen.getByText('Alice Chen')).toBeTruthy();
  });

  it('renders the avatar with initials for human messages', () => {
    render(<MessageCard message={humanMessage} />);
    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('renders the avatar with emoji for mind messages', () => {
    render(<MessageCard message={mindMessage} />);
    expect(screen.getByText('🤖')).toBeTruthy();
  });

  it('renders the message body with markdown', () => {
    const { container } = render(<MessageCard message={humanMessage} />);
    const strong = container.querySelector('strong');
    expect(strong).toBeTruthy();
    expect(strong!.textContent).toBe('world');
  });

  it('renders a timestamp', () => {
    render(<MessageCard message={humanMessage} />);
    // The timestamp will render based on the formatTimestamp utility
    // We just check something time-related is present
    const card = screen.getByText('Alice Chen').closest('.message-card');
    expect(card).toBeTruthy();
    expect(card!.querySelector('.message-timestamp')).toBeTruthy();
  });

  it('applies mind-specific name styling for mind messages', () => {
    const { container } = render(<MessageCard message={mindMessage} />);
    const name = container.querySelector('.message-author-mind');
    expect(name).toBeTruthy();
  });

  it('does not apply mind styling to human messages', () => {
    const { container } = render(<MessageCard message={humanMessage} />);
    const name = container.querySelector('.message-author-mind');
    expect(name).toBeNull();
  });

  it('renders current-user avatar variant when isCurrentUser is true', () => {
    const { container } = render(
      <MessageCard message={humanMessage} isCurrentUser={true} />,
    );
    const avatar = container.querySelector('.avatar-ring-primary');
    expect(avatar).toBeTruthy();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/MessageCard.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/MessageCard.tsx`:

```tsx
// ABOUTME: Message card component composing avatar, author, timestamp, and markdown body
// ABOUTME: Handles visual distinction between human and mind messages

import { cn } from '@mastra-mindspace/ui';

import { Avatar } from './Avatar';
import { formatTimestamp } from './formatTimestamp';
import { MarkdownBody } from './MarkdownBody';

export type MessageCardMessage = {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  authorName: string;
  authorEmoji?: string;
};

type MessageCardProps = {
  message: MessageCardMessage;
  isCurrentUser?: boolean;
};

export function MessageCard({ message, isCurrentUser }: MessageCardProps) {
  const isMind = message.role === 'assistant';
  const avatarType = isCurrentUser ? 'current-user' : isMind ? 'mind' : 'human';

  return (
    <div className={cn('message-card', isMind && 'message-card-mind')}>
      <div className="message-header">
        <Avatar
          type={avatarType}
          name={message.authorName}
          {...(isMind && message.authorEmoji ? { emoji: message.authorEmoji } : {})}
        />
        <span
          className={cn(
            'message-author',
            isMind && 'message-author-mind',
          )}
        >
          {message.authorName}
        </span>
        <span className="message-timestamp">
          {formatTimestamp(message.createdAt)}
        </span>
      </div>
      <div className="message-body">
        <MarkdownBody text={message.text} />
      </div>
    </div>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/MessageCard.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/MessageCard.tsx packages/web/src/MessageCard.test.tsx
git commit -m "Add MessageCard component with avatar, timestamp, and markdown body"
```

---

## Task 6: Thread Header Redesign

Replace the current generic thread header with a contextual one showing "Thread" eyebrow, a context line ("Started by [Author] · #[channel] · [time]"), and the close button.

**Note:** The current `ThreadMessage` type from `api.ts` does not include `authorName`. The thread header needs the first message's author and the channel name. These will come from props — the parent passes `selectedChannel` and derives the author from the first thread message. For now, the root message's `role` is used as a fallback author name until the backend provides display names on messages.

**Files:**

- Create: `packages/web/src/ThreadHeader.tsx`
- Create: `packages/web/src/ThreadHeader.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/ThreadHeader.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the thread detail header — context line and close button
// ABOUTME: Validates "Started by" author, channel name, timestamp, and close action

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThreadHeader } from './ThreadHeader';

describe('ThreadHeader', () => {
  afterEach(cleanup);

  const defaultProps = {
    authorName: 'Alice Chen',
    channelName: 'engineering',
    createdAt: '2026-04-24T14:30:00.000Z',
    onClose: vi.fn(),
  };

  it('renders the "Thread" eyebrow label', () => {
    render(<ThreadHeader {...defaultProps} />);
    expect(screen.getByText('Thread')).toBeTruthy();
  });

  it('renders the context line with author name', () => {
    render(<ThreadHeader {...defaultProps} />);
    expect(screen.getByText(/Started by Alice Chen/)).toBeTruthy();
  });

  it('renders the channel name with # prefix', () => {
    render(<ThreadHeader {...defaultProps} />);
    expect(screen.getByText(/#engineering/)).toBeTruthy();
  });

  it('renders the close button', () => {
    render(<ThreadHeader {...defaultProps} />);
    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ThreadHeader {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render a close button when onClose is not provided', () => {
    render(
      <ThreadHeader
        authorName="Alice Chen"
        channelName="engineering"
        createdAt="2026-04-24T14:30:00.000Z"
      />,
    );
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ThreadHeader.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/ThreadHeader.tsx`:

```tsx
// ABOUTME: Thread detail header with context line showing author, channel, and timestamp
// ABOUTME: Provides orientation for the conversation and a close action

import { Button } from '@mastra-mindspace/ui';

import { formatTimestamp } from './formatTimestamp';

type ThreadHeaderProps = {
  authorName: string;
  channelName: string;
  createdAt: string;
  onClose?: () => void;
};

export function ThreadHeader({
  authorName,
  channelName,
  createdAt,
  onClose,
}: ThreadHeaderProps) {
  return (
    <header className="thread-header">
      <div className="thread-header-row">
        <p className="eyebrow">Thread</p>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close thread"
            onClick={onClose}
          >
            &times;
          </Button>
        ) : null}
      </div>
      <p className="thread-context">
        Started by {authorName} · #{channelName} · {formatTimestamp(createdAt)}
      </p>
    </header>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ThreadHeader.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/ThreadHeader.tsx packages/web/src/ThreadHeader.test.tsx
git commit -m "Add ThreadHeader component with author, channel, and timestamp context"
```

---

## Task 7: Streaming Message Treatment

Create a `StreamingMessageCard` component that renders the in-progress streaming state: dashed border, mind avatar, "typing..." indicator, message text with blinking cursor `▊`, and transition to solid border on completion.

**Files:**

- Create: `packages/web/src/StreamingMessageCard.tsx`
- Create: `packages/web/src/StreamingMessageCard.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/StreamingMessageCard.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the streaming message card — dashed border, typing indicator, cursor
// ABOUTME: Validates the visual phases of streaming AI responses

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StreamingMessageCard } from './StreamingMessageCard';

describe('StreamingMessageCard', () => {
  afterEach(cleanup);

  it('renders the mind avatar', () => {
    render(
      <StreamingMessageCard
        text=""
        mindName="Claude"
        mindEmoji="🤖"
      />,
    );
    expect(screen.getByText('🤖')).toBeTruthy();
  });

  it('shows "typing..." indicator when text is empty', () => {
    render(
      <StreamingMessageCard
        text=""
        mindName="Claude"
        mindEmoji="🤖"
      />,
    );
    expect(screen.getByText(/typing/i)).toBeTruthy();
  });

  it('renders streaming text with a blinking cursor', () => {
    const { container } = render(
      <StreamingMessageCard
        text="Working through"
        mindName="Claude"
        mindEmoji="🤖"
      />,
    );
    expect(screen.getByText(/Working through/)).toBeTruthy();
    const cursor = container.querySelector('.streaming-cursor');
    expect(cursor).toBeTruthy();
  });

  it('applies the dashed border class', () => {
    const { container } = render(
      <StreamingMessageCard
        text="hello"
        mindName="Claude"
        mindEmoji="🤖"
      />,
    );
    const card = container.querySelector('.message-card-streaming');
    expect(card).toBeTruthy();
  });

  it('shows the mind name', () => {
    render(
      <StreamingMessageCard
        text="hello"
        mindName="Claude"
        mindEmoji="🤖"
      />,
    );
    expect(screen.getByText('Claude')).toBeTruthy();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/StreamingMessageCard.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/StreamingMessageCard.tsx`:

```tsx
// ABOUTME: Streaming message card for in-progress AI responses
// ABOUTME: Shows dashed border, typing indicator, and blinking cursor during token streaming

import { Avatar } from './Avatar';

type StreamingMessageCardProps = {
  text: string;
  mindName: string;
  mindEmoji: string;
};

export function StreamingMessageCard({
  text,
  mindName,
  mindEmoji,
}: StreamingMessageCardProps) {
  return (
    <div className="message-card message-card-streaming">
      <div className="message-header">
        <Avatar type="mind" name={mindName} emoji={mindEmoji} />
        <span className="message-author message-author-mind">{mindName}</span>
        <span className="message-timestamp streaming-indicator">
          ● typing...
        </span>
      </div>
      <div className="message-body">
        {text ? (
          <p>
            {text}
            <span className="streaming-cursor" aria-hidden="true">
              ▊
            </span>
          </p>
        ) : (
          <p className="streaming-placeholder">
            <span className="streaming-cursor" aria-hidden="true">
              ▊
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/StreamingMessageCard.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/StreamingMessageCard.tsx packages/web/src/StreamingMessageCard.test.tsx
git commit -m "Add StreamingMessageCard with dashed border, typing indicator, and cursor"
```

---

## Task 8: Reply Composer with Mind Mention Chips

Create a `ReplyComposer` component that wraps the textarea with mind mention chip buttons below it. Clicking a chip inserts a `@MindName` mention into the reply text. The composer shows keyboard shortcut hint `Cmd+Enter`.

**Files:**

- Create: `packages/web/src/ReplyComposer.tsx`
- Create: `packages/web/src/ReplyComposer.test.tsx`

**TDD Step 1: Write failing tests**

Create `packages/web/src/ReplyComposer.test.tsx`:

```tsx
// @vitest-environment jsdom
// ABOUTME: Tests for the reply composer with mind mention chip buttons
// ABOUTME: Validates textarea, chips, keyboard shortcut hint, and disabled state

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReplyComposer } from './ReplyComposer';

describe('ReplyComposer', () => {
  afterEach(cleanup);

  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onKeyDown: vi.fn(),
    disabled: false,
    minds: [
      { name: 'Claude', emoji: '🤖' },
      { name: 'Reviewer', emoji: '🔍' },
    ],
  };

  it('renders a textarea with placeholder', () => {
    render(<ReplyComposer {...defaultProps} />);
    expect(screen.getByPlaceholderText(/reply to this thread/i)).toBeTruthy();
  });

  it('renders mind mention chips', () => {
    render(<ReplyComposer {...defaultProps} />);
    expect(screen.getByRole('button', { name: /@Claude/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /@Reviewer/i })).toBeTruthy();
  });

  it('appends @mention to the textarea value when a chip is clicked', () => {
    const onChange = vi.fn();
    render(<ReplyComposer {...defaultProps} value="Hello " onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /@Claude/i }));
    expect(onChange).toHaveBeenCalledWith('Hello @Claude ');
  });

  it('shows the keyboard shortcut hint', () => {
    const { container } = render(<ReplyComposer {...defaultProps} />);
    expect(container.textContent).toMatch(/⌘⏎|Cmd\+Enter|Ctrl\+Enter/i);
  });

  it('disables the textarea when disabled is true', () => {
    render(<ReplyComposer {...defaultProps} disabled={true} />);
    const textarea = screen.getByPlaceholderText(/reply to this thread/i);
    expect(textarea).toHaveProperty('disabled', true);
  });

  it('calls onKeyDown on keyboard events', () => {
    const onKeyDown = vi.fn();
    render(<ReplyComposer {...defaultProps} onKeyDown={onKeyDown} />);
    const textarea = screen.getByPlaceholderText(/reply to this thread/i);
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('renders no chips when minds array is empty', () => {
    render(<ReplyComposer {...defaultProps} minds={[]} />);
    expect(screen.queryByRole('button', { name: /@Claude/i })).toBeNull();
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ReplyComposer.test.tsx
```

**TDD Step 3: Implement**

Create `packages/web/src/ReplyComposer.tsx`:

```tsx
// ABOUTME: Thread reply composer with textarea and mind mention chip buttons
// ABOUTME: Chips append @MindName mentions into the reply text

import type { KeyboardEventHandler } from 'react';

import { Badge, Textarea } from '@mastra-mindspace/ui';

export type MindChip = {
  name: string;
  emoji: string;
};

type ReplyComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  disabled: boolean;
  minds: MindChip[];
};

export function ReplyComposer({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  disabled,
  minds,
}: ReplyComposerProps) {
  function handleChipClick(mindName: string) {
    onChange(`${value}@${mindName} `);
  }

  return (
    <div className="reply-composer">
      <div className="reply-composer-input">
        <Textarea
          placeholder="Reply to this thread..."
          aria-label="Reply to this thread"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          disabled={disabled}
        />
        <span className="reply-composer-hint">⌘⏎</span>
      </div>
      {minds.length > 0 ? (
        <div className="reply-composer-chips">
          {minds.map((mind) => (
            <button
              key={mind.name}
              type="button"
              className="mention-chip"
              onClick={() => handleChipClick(mind.name)}
              disabled={disabled}
              aria-label={`@${mind.name}`}
            >
              <span className="mention-chip-emoji">{mind.emoji}</span>
              @{mind.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/ReplyComposer.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/ReplyComposer.tsx packages/web/src/ReplyComposer.test.tsx
git commit -m "Add ReplyComposer with mind mention chips and keyboard shortcut hint"
```

---

## Task 9: Wire Components into ThreadDrawer

Rewrite `ThreadDrawer.tsx` to use the new sub-components: `ThreadHeader`, `MessageCard`, `StreamingMessageCard`, and `ReplyComposer`. This replaces the existing plain-text rendering with the full conversation view.

**Key changes:**
- Thread header uses `ThreadHeader` with author/channel context
- Messages use `MessageCard` with avatars and markdown
- Streaming uses `StreamingMessageCard` with dashed border and cursor
- Reply section uses `ReplyComposer` with mention chips
- Auto-scroll behavior is preserved

**Props changes:** `ThreadDrawerProps` will need additional data:
- `channelName: string` — for the thread header context line
- `minds: MindChip[]` — for the reply composer chips
- `currentUserName?: string` — to identify "you" messages for primary ring avatar

Since the backend's `ThreadMessage` type doesn't include `authorName`, we derive it from `role`: `"user"` maps to `currentUserName` (or "You"), `"assistant"` maps to the first mind's name (or "Assistant"). This is a pragmatic v1 approach — when the backend adds author names to messages, the mapping becomes direct.

**Files:**

- Modify: `packages/web/src/ThreadDrawer.tsx`
- Modify: `packages/web/src/App.tsx` — pass new props to ThreadDrawer
- No new test file — existing `App.test.tsx` tests validate thread drawer behavior end-to-end. We update assertions for the new structure.

**TDD Step 1: Update existing tests for new structure**

In `packages/web/src/App.test.tsx`, the following tests interact with the thread drawer and may need minor assertion updates:

1. `'renders the channel feed as root posts and opens a thread drawer for replies'` — currently checks for `'I can break that into milestones.'` text. This should still work since `MessageCard` renders the text via `MarkdownBody`.

2. `'closes the thread drawer when the close button is clicked'` — currently checks for `screen.getByRole('button', { name: /close thread/i })`. The new `ThreadHeader` uses the same `aria-label="Close thread"`, so this should work.

3. `'creates a new channel post, auto-streams the root response...'` — checks for `'Working through it.'` text and reply textarea `'Reply in thread'`. The new `ReplyComposer` uses `aria-label="Reply to this thread"`, so this label needs updating.

Run existing tests first to see what breaks:

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

If tests reference the old `aria-label="Reply in thread"` label, update the assertions to match the new `aria-label="Reply to this thread"` label. Specifically update:

- All occurrences of `screen.getByLabelText(/reply in thread/i)` to `screen.getByPlaceholderText(/reply to this thread/i)` or `screen.getByLabelText(/reply to this thread/i)`
- `screen.getByRole('button', { name: /reply in thread/i })` — the standalone Reply button is removed. Reply is now via `Cmd+Enter` or a submit action within the composer. This test assertion needs to change to use the keyboard shortcut.

**Update the test assertions in `App.test.tsx`:**

The `'creates a new channel post...'` test has:
```tsx
fireEvent.change(screen.getByLabelText(/reply in thread/i), { ... });
fireEvent.click(screen.getByRole('button', { name: /reply in thread/i }));
```

Change to:
```tsx
fireEvent.change(screen.getByLabelText(/reply to this thread/i), { ... });
fireEvent.keyDown(screen.getByLabelText(/reply to this thread/i), { key: 'Enter', metaKey: true });
```

The `'submits a thread reply on Ctrl+Enter'` test has:
```tsx
const replyBox = screen.getByLabelText(/reply in thread/i);
```

Change to:
```tsx
const replyBox = screen.getByLabelText(/reply to this thread/i);
```

The `'closes the thread drawer'` test should work as-is since the close button's aria-label is preserved.

Also update the test that checks `screen.getByText(/select a post/i)` — the new empty state text may differ. If the ThreadDrawer shows nothing when no thread is selected (since it's hidden via the layout), this assertion may need adjustment.

**TDD Step 2: Verify tests fail with the new component structure**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 3: Implement**

**3a. Update `ThreadDrawer.tsx`:**

```tsx
// ABOUTME: Thread detail panel with conversation messages, streaming, and reply composer
// ABOUTME: Slides in when a thread card is clicked, auto-scrolls on new messages

import { useEffect, useRef } from 'react';

import { Spinner } from '@mastra-mindspace/ui';

import type { ThreadMessage, ThreadSummary } from './api';
import { InlineError } from './InlineError';
import { MessageCard, type MessageCardMessage } from './MessageCard';
import { type MindChip, ReplyComposer } from './ReplyComposer';
import { StreamingMessageCard } from './StreamingMessageCard';
import { ThreadHeader } from './ThreadHeader';
import type { KeyboardEventHandler } from 'react';

export type ThreadDrawerProps = {
  selectedThread: ThreadSummary | null;
  threadMessages: ThreadMessage[];
  streamingReply: string;
  replyMessage: string;
  isThreadLoading: boolean;
  isReplying: boolean;
  threadError: string | undefined;
  channelName: string;
  currentUserName: string;
  minds: MindChip[];
  onClose: () => void;
  onChangeReplyMessage: (message: string) => void;
  onReply: () => void;
  onReplyKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
};

function toMessageCardMessage(
  message: ThreadMessage,
  currentUserName: string,
  defaultMindName: string,
  defaultMindEmoji: string,
): MessageCardMessage {
  const isUser = message.role === 'user';
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
    authorName: isUser ? currentUserName : defaultMindName,
    authorEmoji: isUser ? undefined : defaultMindEmoji,
  };
}

export function ThreadDrawer({
  selectedThread,
  threadMessages,
  streamingReply,
  replyMessage,
  isThreadLoading,
  isReplying,
  threadError,
  channelName,
  currentUserName,
  minds,
  onClose,
  onChangeReplyMessage,
  onReply,
  onReplyKeyDown,
}: ThreadDrawerProps) {
  const threadBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadBottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [threadMessages, streamingReply]);

  const defaultMind = minds[0] ?? { name: 'Assistant', emoji: '🤖' };
  const firstMessage = threadMessages[0];

  return (
    <aside className="thread-drawer">
      {selectedThread && firstMessage ? (
        <ThreadHeader
          authorName={
            firstMessage.role === 'user' ? currentUserName : defaultMind.name
          }
          channelName={channelName}
          createdAt={selectedThread.createdAt}
          onClose={onClose}
        />
      ) : (
        <header className="thread-header">
          <p className="eyebrow">Thread</p>
          <h2>Select a post</h2>
          <p className="thread-context">
            Choose a feed post to open its thread.
          </p>
        </header>
      )}

      <div className="thread-messages">
        {isThreadLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner size="lg" />
          </div>
        ) : threadMessages.length === 0 ? (
          <p className="empty-state">No thread selected.</p>
        ) : (
          threadMessages.map((entry) => (
            <MessageCard
              key={entry.id}
              message={toMessageCardMessage(
                entry,
                currentUserName,
                defaultMind.name,
                defaultMind.emoji,
              )}
              isCurrentUser={entry.role === 'user'}
            />
          ))
        )}
        {streamingReply || (selectedThread && isReplying && !streamingReply) ? (
          <StreamingMessageCard
            text={streamingReply}
            mindName={defaultMind.name}
            mindEmoji={defaultMind.emoji}
          />
        ) : null}
        <div ref={threadBottomRef} />
      </div>

      <InlineError message={threadError} />

      <ReplyComposer
        value={replyMessage}
        onChange={onChangeReplyMessage}
        onSubmit={onReply}
        onKeyDown={onReplyKeyDown}
        disabled={!selectedThread || isReplying}
        minds={minds}
      />
    </aside>
  );
}
```

**3b. Update `App.tsx` to pass new props to `ThreadDrawer`:**

Add the new props to the `<ThreadDrawer>` usage in App.tsx. The `channelName` comes from `selectedChannel?.name ?? ''`. The `currentUserName` comes from the authenticated user's display name (from `getMe` response or `user.email`). The `minds` array is a stub for now (same as the sidebar stubs from Phase 11b, or a simple hardcoded array).

In the `<ThreadDrawer>` invocation (around line 602 of App.tsx), add:

```tsx
channelName={selectedChannel?.name ?? ''}
currentUserName={user?.email?.split('@')[0] ?? 'You'}
minds={[
  { name: 'Claude', emoji: '🤖' },
  { name: 'Reviewer', emoji: '🔍' },
]}
```

**Note:** The hardcoded minds array is a v1 stub. When the backend provides mind configuration per mindspace, this will come from an API call. The stub is acceptable here because Phase 11b's sidebar stubs follow the same pattern.

**TDD Step 4: Verify all tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

If any tests fail due to changed labels or structure, update the test assertions to match the new component output. The key changes are:
- Reply textarea label: `"Reply in thread"` → `"Reply to this thread"`
- Reply button: removed in favor of keyboard shortcut — tests that click the Reply button should use `fireEvent.keyDown` with `metaKey: true` instead
- The `screen.getByText(/select a post/i)` assertion should still work

**TDD Step 5: Run full test suite and typecheck**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test && pnpm --filter @mastra-mindspace/web typecheck
```

**TDD Step 6: Commit**

```bash
git add packages/web/src/ThreadDrawer.tsx packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "Wire MessageCard, ThreadHeader, StreamingMessageCard, and ReplyComposer into ThreadDrawer"
```

---

## Task 10: Thread Detail CSS

Add all CSS rules for the new thread detail components: message cards, avatars, markdown body, streaming treatment, reply composer, and mention chips.

**Files:**

- Modify: `packages/web/src/styles.css`
- Create: `packages/web/src/threadDetail.test.ts` — CSS structure validation

**TDD Step 1: Write failing tests**

Create `packages/web/src/threadDetail.test.ts`:

```ts
// ABOUTME: Tests for thread detail CSS — message cards, avatars, markdown, streaming, reply composer
// ABOUTME: Validates that required CSS classes exist with expected properties

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('thread detail CSS', () => {
  const normalized = normalizeCss(styles);

  it('defines the message-card layout', () => {
    expect(normalized).toMatch(/\.message-card\s*\{/);
  });

  it('defines the avatar base styles', () => {
    expect(normalized).toMatch(/\.avatar\s*\{/);
  });

  it('defines the accent ring for mind avatars', () => {
    expect(normalized).toMatch(/\.avatar-ring-accent\s*\{/);
  });

  it('defines the primary ring for current-user avatars', () => {
    expect(normalized).toMatch(/\.avatar-ring-primary\s*\{/);
  });

  it('defines the streaming message dashed border', () => {
    expect(normalized).toMatch(/\.message-card-streaming\s*\{/);
    expect(normalized).toMatch(/message-card-streaming[^}]*border-style:\s*dashed/);
  });

  it('defines the blinking cursor animation', () => {
    expect(normalized).toMatch(/\.streaming-cursor/);
    expect(normalized).toMatch(/@keyframes\s+blink/);
  });

  it('defines the reply composer layout', () => {
    expect(normalized).toMatch(/\.reply-composer\s*\{/);
  });

  it('defines the mention chip styles', () => {
    expect(normalized).toMatch(/\.mention-chip\s*\{/);
  });

  it('defines markdown body styles', () => {
    expect(normalized).toMatch(/\.markdown-body\s*\{/);
  });

  it('defines code block wrapper with copy button', () => {
    expect(normalized).toMatch(/\.code-block-wrapper\s*\{/);
    expect(normalized).toMatch(/\.code-block-copy\s*\{/);
  });

  it('defines the thread header context line', () => {
    expect(normalized).toMatch(/\.thread-context\s*\{/);
  });

  it('defines the thread header row layout', () => {
    expect(normalized).toMatch(/\.thread-header-row\s*\{/);
  });

  it('defines mind-specific author name color', () => {
    expect(normalized).toMatch(/\.message-author-mind\s*\{/);
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/threadDetail.test.ts
```

**TDD Step 3: Implement**

Add the following CSS to `packages/web/src/styles.css`, replacing the existing thread-drawer-related rules (lines 262-310):

Keep the existing `.thread-drawer`, `.thread-header`, `.thread-messages`, `.empty-state` rules. Add new rules after them:

```css
/* ─── Thread header ─────────────────────────────────────────────────────── */
.thread-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.thread-context {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}

/* ─── Avatar ────────────────────────────────────────────────────────────── */
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: var(--font-heading);
  color: white;
  flex-shrink: 0;
}

.avatar-ring-accent {
  box-shadow: 0 0 0 2px var(--accent);
  background: var(--muted);
  font-size: 1rem;
}

.avatar-ring-primary {
  box-shadow: 0 0 0 1.5px var(--primary);
}

/* ─── Message card ──────────────────────────────────────────────────────── */
.message-card {
  display: grid;
  gap: 0.4rem;
  padding: 0.75rem 0;
}

.message-card + .message-card {
  border-top: 1px solid var(--border);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.message-author {
  font-weight: 600;
  font-size: 0.875rem;
  font-family: var(--font-heading);
}

.message-author-mind {
  color: var(--primary);
}

.message-timestamp {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--muted-foreground);
}

.message-body {
  padding-left: 2.5rem;
}

/* ─── Streaming message ─────────────────────────────────────────────────── */
.message-card-streaming {
  border: 1px solid oklch(from var(--primary) l c h / 0.3);
  border-style: dashed;
  border-radius: var(--radius-md);
  padding: 0.75rem;
  background: oklch(from var(--primary) l c h / 0.04);
}

.streaming-indicator {
  color: var(--primary);
  font-style: italic;
}

.streaming-cursor {
  display: inline-block;
  animation: blink 1s step-end infinite;
  color: var(--primary);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ─── Reply composer ────────────────────────────────────────────────────── */
.reply-composer {
  display: grid;
  gap: 0.5rem;
}

.reply-composer-input {
  position: relative;
}

.reply-composer-hint {
  position: absolute;
  top: 0.5rem;
  right: 0.65rem;
  font-size: 0.68rem;
  color: var(--muted-foreground);
  pointer-events: none;
}

.reply-composer-chips {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.mention-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--muted);
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.mention-chip:hover:not(:disabled) {
  background: oklch(from var(--primary) l c h / 0.12);
  border-color: var(--primary);
  color: var(--foreground);
}

.mention-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mention-chip-emoji {
  font-size: 0.85rem;
}

/* ─── Markdown body ─────────────────────────────────────────────────────── */
.markdown-body {
  font-size: 0.925rem;
  line-height: 1.55;
}

.markdown-body p {
  margin: 0 0 0.5rem;
}

.markdown-body p:last-child {
  margin-bottom: 0;
}

.markdown-body strong {
  font-weight: 700;
}

.markdown-body code {
  font-family: var(--font-mono);
  font-size: 0.84em;
  padding: 0.15em 0.35em;
  background: var(--muted);
  border-radius: var(--radius-sm);
}

.markdown-body a {
  color: var(--primary);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body blockquote {
  margin: 0.5rem 0;
  padding: 0.4rem 0.85rem;
  border-left: 3px solid var(--accent);
  background: oklch(from var(--muted) l c h / 0.5);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.markdown-body blockquote p {
  margin: 0;
}

.markdown-body ul,
.markdown-body ol {
  margin: 0.4rem 0;
  padding-left: 1.5rem;
}

.markdown-body li {
  margin-bottom: 0.2rem;
}

.code-block-wrapper {
  position: relative;
  margin: 0.5rem 0;
}

.code-block-copy {
  position: absolute;
  top: 0.4rem;
  right: 0.5rem;
  padding: 0.15rem 0.45rem;
  font-size: 0.68rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--muted);
  color: var(--muted-foreground);
  cursor: pointer;
  z-index: 1;
}

.code-block-copy:hover {
  background: var(--background);
  color: var(--foreground);
}

.code-block-wrapper pre {
  min-height: auto;
  margin: 0;
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/threadDetail.test.ts
```

**TDD Step 5: Run full suite**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 6: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/threadDetail.test.ts
git commit -m "Add thread detail CSS for message cards, avatars, markdown, streaming, and reply composer"
```

---

## Final Verification

After all tasks are complete, run the full verification:

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace

# All unit tests pass
pnpm test

# TypeScript compiles cleanly
pnpm --filter @mastra-mindspace/web typecheck

# Dev server starts without errors
pnpm dev:web
```

---

## File Summary

### New files created

| File | Purpose |
|------|---------|
| `packages/web/src/formatTimestamp.ts` | Timestamp formatting utility with 6-tier relative/absolute display |
| `packages/web/src/formatTimestamp.test.ts` | Tests for timestamp formatting |
| `packages/web/src/avatarColor.ts` | Deterministic avatar color and initials from display names |
| `packages/web/src/avatarColor.test.ts` | Tests for avatar color and initials |
| `packages/web/src/Avatar.tsx` | Avatar component for human, mind, and current-user variants |
| `packages/web/src/Avatar.test.tsx` | Tests for Avatar component |
| `packages/web/src/MarkdownBody.tsx` | Minimal markdown-to-React renderer for message content |
| `packages/web/src/MarkdownBody.test.tsx` | Tests for markdown rendering |
| `packages/web/src/MessageCard.tsx` | Message card composing avatar, name, timestamp, and markdown body |
| `packages/web/src/MessageCard.test.tsx` | Tests for MessageCard |
| `packages/web/src/ThreadHeader.tsx` | Thread detail header with author/channel/time context line |
| `packages/web/src/ThreadHeader.test.tsx` | Tests for ThreadHeader |
| `packages/web/src/StreamingMessageCard.tsx` | Streaming message card with dashed border, typing indicator, cursor |
| `packages/web/src/StreamingMessageCard.test.tsx` | Tests for StreamingMessageCard |
| `packages/web/src/ReplyComposer.tsx` | Reply textarea with mind mention chips |
| `packages/web/src/ReplyComposer.test.tsx` | Tests for ReplyComposer |
| `packages/web/src/threadDetail.test.ts` | CSS structure validation tests |

### Files modified

| File | Changes |
|------|---------|
| `packages/web/src/ThreadDrawer.tsx` | Full rewrite using new sub-components (ThreadHeader, MessageCard, StreamingMessageCard, ReplyComposer) |
| `packages/web/src/App.tsx` | Pass `channelName`, `currentUserName`, `minds` props to ThreadDrawer |
| `packages/web/src/App.test.tsx` | Update reply textarea label assertions, button → keyboard shortcut for reply submission |
| `packages/web/src/styles.css` | Add CSS for avatars, message cards, markdown body, streaming, reply composer, mention chips |

### Files NOT modified (left for future phases)

| File | Reason |
|------|--------|
| `packages/web/src/api.ts` | No API changes — author names on messages require backend work |
| `packages/web/src/ChannelFeed.tsx` | Thread index cards are Phase 11c |
| `packages/web/src/Sidebar.tsx` | Sidebar is Phase 11b |
| `packages/ui/src/index.ts` | No new UI primitives needed |
