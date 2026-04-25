# ABOUTME: Implementation plan for hardening the Mastra Mindspace frontend chat UI
# ABOUTME: Covers scroll containment, keyboard submit, loading states, feed interactivity, error handling, and component extraction

# Task 10: Frontend Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-24
**Updated**: 2026-04-24
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: Task 06 (design system) complete. Existing test suite passes.

**Goal:** Harden the Mastra Mindspace chat frontend so that the sidebar, feed, and thread panels scroll correctly, the app responds to keyboard input, loading/error states are visible, and the monolithic App component is broken into focused components.

**Architecture:** Work from the outside in — fix layout containment first (CSS-only, low risk), then add interactivity features (keyboard submit, scroll-to-bottom), then improve state management (loading/error), then extract components. Each phase builds on the last and can be shipped independently.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Vitest + @testing-library/react, `@mastra-mindspace/ui` design system (Button, Card, Badge, Input, Textarea, ScrollArea, cn()).

---

## Success Criteria

- [ ] Sidebar, feed list, and thread messages scroll independently within viewport height
- [ ] Feed composer and thread reply box always remain visible at viewport bottom
- [ ] Cmd+Enter (Mac) / Ctrl+Enter (Windows) submits post composer and thread reply
- [ ] Loading spinner/indicator visible during all async operations
- [ ] Feed post cards show hover state, focus ring, and active/selected state
- [ ] Errors display inline near the triggering action and auto-dismiss after 5 seconds
- [ ] Thread drawer has a close button
- [ ] New messages auto-scroll the thread to bottom
- [ ] All existing tests continue to pass
- [ ] New tests cover each new behavior
- [ ] `pnpm typecheck` passes across all packages

---

## Recommended Sequencing

Execute these phases in order. Each phase is independently shippable.

1. **Phase 1: Scroll Containment** — CSS fixes to constrain all three columns to viewport height.
2. **Phase 2: Feed Card Interactivity** — Hover, focus, and selected states for clickable posts.
3. **Phase 3: Keyboard Submit** — Cmd/Ctrl+Enter on composer and reply textareas.
4. **Phase 4: Loading Feedback** — Replace boolean `isLoading` mutex with a Set; show inline spinners.
5. **Phase 5: Error Handling** — Replace global sticky error with scoped, auto-dismissing error display.
6. **Phase 6: Thread Drawer Controls** — Close button and auto-scroll-to-bottom.
7. **Phase 7: Component Extraction** — Break App.tsx into Sidebar, ChannelFeed, ThreadDrawer, AdminConsole.

---

## Phase 1: Scroll Containment

### Task 1.1: Fix chat shell to constrain columns to viewport height

The root issue: `.mindspace-shell` uses `min-height: 100vh` instead of `height: 100vh`, and `.channel-feed` also uses `min-height: 100vh`. This allows children to grow beyond the viewport, pushing the composer and reply box off-screen.

**Files:**

- Modify: `packages/web/src/styles.css`

**Step 1: Write a failing test**

This is a CSS-only change. There is no unit test to write — verification is visual. Skip to step 3.

**Step 2: (skipped)**

**Step 3: Fix the layout containment**

In `packages/web/src/styles.css`, make these changes:

```css
/* .mindspace-shell: change min-height to height */
.mindspace-shell {
  display: grid;
  grid-template-columns: 20rem minmax(0, 1fr) 24rem;
  height: 100vh;           /* was: min-height: 100vh */
}

/* .sidebar: add overflow-y auto so projects/channels scroll */
.sidebar {
  background: var(--sidebar);
  border-right: 1px solid var(--sidebar-border);
  padding: 1.1rem;
  display: grid;
  gap: 1rem;
  align-content: start;
  overflow-y: auto;        /* ADD */
}

/* .channel-feed: change min-height to remove it, the grid row handles it */
.channel-feed {
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: 1.1rem 1.2rem;
  gap: 1rem;
  border-right: 1px solid var(--border);
  background: oklch(from var(--background) l c h / 0.88);
  backdrop-filter: blur(20px);
  overflow: hidden;        /* ADD: prevent blowout */
  /* REMOVE: min-height: 100vh */
}

/* .feed-list: already has overflow: auto, but needs min-height: 0 to work in grid */
/* (min-height: 0 is already there — verify it stays) */

/* .thread-drawer: add overflow to allow scrolling */
.thread-drawer {
  background: var(--sidebar);
  border-left: 1px solid var(--sidebar-border);
  padding: 1.1rem;
  display: grid;
  gap: 1rem;
  align-content: start;
  grid-template-rows: auto 1fr auto auto; /* ADD: constrain thread-messages row */
  overflow: hidden;                        /* ADD */
}

/* .thread-messages: needs min-height: 0 for grid scroll */
.thread-messages {
  display: grid;
  gap: 0.7rem;
  align-content: start;
  min-height: 0;
  overflow-y: auto;        /* change from overflow: auto */
}
```

**Step 4: Verify visually**

Run: `pnpm --filter @mastra-mindspace/web dev`

Navigate to `/chat/<projectId>`. Verify:
- Sidebar scrolls if many projects/channels exist
- Feed list scrolls and composer stays pinned at bottom
- Thread messages scroll and reply box stays pinned at bottom
- The page itself does not scroll (no body scrollbar)

**Step 5: Update responsive breakpoints**

The `@media (max-width: 768px)` rule references `min-height: auto` on `.channel-feed`. Update:

```css
@media (max-width: 768px) {
  .admin-shell,
  .mindspace-shell {
    grid-template-columns: 1fr;
    height: auto;           /* ADD: allow stacking to scroll naturally on mobile */
  }

  .sidebar,
  .channel-feed,
  .thread-drawer {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .channel-feed {
    min-height: 60vh;       /* ADD: give feed reasonable height on mobile */
  }

  .thread-drawer {
    min-height: 40vh;       /* ADD: give thread reasonable height on mobile */
  }
}
```

**Step 6: Run existing tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All 3 existing tests pass (CSS changes don't affect jsdom tests).

**Step 7: Commit**

```bash
git add packages/web/src/styles.css
git commit -m "fix: constrain chat columns to viewport height for proper scroll containment"
```

---

## Phase 2: Feed Card Interactivity

### Task 2.1: Add hover, focus, and selected states for feed post cards

Currently `feed-card-button` has no CSS rules at all. Posts are clickable buttons with no visual feedback.

**Files:**

- Modify: `packages/web/src/styles.css` (add `.feed-card-button` styles)
- Modify: `packages/web/src/App.tsx` (add selected state class)
- Test: `packages/web/src/App.test.tsx`

**Step 1: Write a failing test**

Add to `packages/web/src/App.test.tsx`:

```tsx
it('marks the active feed post when its thread is open', async () => {
  window.history.pushState({}, '', '/chat/project-123');
  render(<App />);

  const postButton = await screen.findByRole('button', {
    name: /open thread for ship the mindspace shell this sprint\./i,
  });

  // Before clicking: no active class
  expect(postButton.className).not.toContain('feed-card-active');

  fireEvent.click(postButton);

  await waitFor(() => {
    expect(api.getChannelThread).toHaveBeenCalled();
  });

  // After clicking: active class applied
  expect(postButton.className).toContain('feed-card-active');
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @mastra-mindspace/web vitest run -- -t "marks the active feed post"
```

Expected: FAIL — `feed-card-active` class not found on the button.

**Step 3: Add selected state to feed card button in App.tsx**

In `packages/web/src/App.tsx`, find the feed card button JSX (around line 584-594) and add a conditional class:

```tsx
<button
  className={cn(
    'feed-card-button',
    selectedThread?.id === post.threadId && 'feed-card-active',
  )}
  onClick={() => void handleOpenThread(post.threadId)}
  aria-label={`Open thread for ${post.rootMessageText}`}
>
```

Note: `cn` is already imported from `@mastra-mindspace/ui`.

**Step 4: Run test to verify it passes**

```bash
pnpm --filter @mastra-mindspace/web vitest run -- -t "marks the active feed post"
```

Expected: PASS.

**Step 5: Add CSS for feed-card-button states**

In `packages/web/src/styles.css`, after the existing `.feed-card-meta` rules, add:

```css
.feed-card-button {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  color: inherit;
  border: none;
  padding: 0.85rem 1rem;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background 160ms ease;
}

.feed-card-button:hover {
  background: oklch(from var(--primary) l c h / 0.08);
}

.feed-card-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring);
}

.feed-card-active {
  background: oklch(from var(--primary) l c h / 0.14);
  border-left: 3px solid var(--primary);
}
```

**Step 6: Run all tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add packages/web/src/styles.css packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "feat: add hover, focus, and selected states to feed post cards"
```

---

## Phase 3: Keyboard Submit

### Task 3.1: Add Cmd/Ctrl+Enter to submit post composer and thread reply

**Files:**

- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx`

**Step 1: Write failing tests**

Add to `packages/web/src/App.test.tsx`:

```tsx
it('submits a new post on Cmd+Enter in the composer', async () => {
  window.history.pushState({}, '', '/chat/project-123');
  render(<App />);

  await screen.findByRole('button', {
    name: /open thread for ship the mindspace shell this sprint\./i,
  });

  const composer = screen.getByLabelText(/start a post/i);
  fireEvent.change(composer, { target: { value: 'Keyboard shortcut test.' } });
  fireEvent.keyDown(composer, { key: 'Enter', metaKey: true });

  await waitFor(() => {
    expect(api.createChannelPost).toHaveBeenCalledWith(
      authState.user,
      'project-123',
      'channel-general',
      'Keyboard shortcut test.',
    );
  });
});

it('submits a thread reply on Ctrl+Enter in the reply box', async () => {
  window.history.pushState({}, '', '/chat/project-123');
  render(<App />);

  const postButton = await screen.findByRole('button', {
    name: /open thread for ship the mindspace shell this sprint\./i,
  });
  fireEvent.click(postButton);

  await waitFor(() => {
    expect(api.getChannelThread).toHaveBeenCalled();
  });

  const replyBox = screen.getByLabelText(/reply in thread/i);
  fireEvent.change(replyBox, { target: { value: 'Ctrl+Enter reply.' } });
  fireEvent.keyDown(replyBox, { key: 'Enter', ctrlKey: true });

  await waitFor(() => {
    expect(api.streamThreadReply).toHaveBeenCalledWith(
      authState.user,
      'project-123',
      'channel-general',
      'thread-1',
      'Ctrl+Enter reply.',
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm --filter @mastra-mindspace/web vitest run -- -t "Cmd+Enter|Ctrl+Enter"
```

Expected: FAIL — keyDown events have no handler, so `createChannelPost` / `streamThreadReply` not called.

**Step 3: Add keyboard handler to composer textarea**

In `packages/web/src/App.tsx`, find the post composer `<Textarea>` (around line 603) and add an `onKeyDown`:

```tsx
<Textarea
  aria-label="Start a post"
  value={newPostMessage}
  onChange={(event) => setNewPostMessage(event.target.value)}
  onKeyDown={(event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleCreatePost();
    }
  }}
  rows={4}
  placeholder={`Share an update in #${selectedChannel?.name ?? 'channel'}`}
/>
```

**Step 4: Add keyboard handler to reply textarea**

In `packages/web/src/App.tsx`, find the reply `<Textarea>` (around line 659) and add:

```tsx
<Textarea
  aria-label="Reply in thread"
  value={replyMessage}
  onChange={(event) => setReplyMessage(event.target.value)}
  onKeyDown={(event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleReplyInThread();
    }
  }}
  rows={4}
  disabled={!selectedThread}
/>
```

**Step 5: Run tests to verify they pass**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass including the two new keyboard tests.

**Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "feat: add Cmd/Ctrl+Enter keyboard shortcut for post and reply submission"
```

---

## Phase 4: Loading Feedback

### Task 4.1: Replace isLoading string mutex with a Set for concurrent operations

The current `isLoading` is a `string | null` — only one operation can be "loading" at a time. This causes bugs when multiple async operations overlap (e.g., loading channels while loading projects).

**Files:**

- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx`

**Step 1: Write a failing test**

Add to `packages/web/src/App.test.tsx`:

```tsx
it('shows loading text while the channel feed is loading', async () => {
  // Make listChannelFeed hang so we can observe the loading state
  let resolveFeed: (value: unknown) => void;
  api.listChannelFeed.mockImplementationOnce(() => new Promise((resolve) => {
    resolveFeed = resolve;
  }));

  window.history.pushState({}, '', '/chat/project-123');
  render(<App />);

  // Wait for channels to load (listProjectChannels resolves immediately)
  await waitFor(() => {
    expect(api.listProjectChannels).toHaveBeenCalled();
  });

  // Feed is still loading — look for the loading indicator
  expect(screen.getByText(/loading feed/i)).toBeTruthy();

  // Resolve the feed
  resolveFeed!({
    channel: { id: 'channel-general', name: 'general', slug: 'general' },
    posts: [],
  });

  await waitFor(() => {
    expect(screen.queryByText(/loading feed/i)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @mastra-mindspace/web vitest run -- -t "shows loading text while the channel feed is loading"
```

Expected: FAIL — the text "loading feed" does not appear anywhere in the rendered output.

**Step 3: Replace isLoading state with a Set**

In `packages/web/src/App.tsx`, replace:

```tsx
const [isLoading, setIsLoading] = useState<string | null>(null);
```

with:

```tsx
const [loadingOps, setLoadingOps] = useState<Set<string>>(() => new Set());

function startLoading(op: string) {
  setLoadingOps((current) => new Set(current).add(op));
}

function stopLoading(op: string) {
  setLoadingOps((current) => {
    const next = new Set(current);
    next.delete(op);
    return next;
  });
}

function isLoading(op: string) {
  return loadingOps.has(op);
}
```

Then find-and-replace through all handler functions:

- `setIsLoading('feed')` becomes `startLoading('feed')`
- `setIsLoading(null)` in finally blocks becomes `stopLoading('feed')` (use the matching operation name)
- `isLoading === 'feed'` becomes `isLoading('feed')`
- Repeat for every operation: `me`, `projects`, `bootstrap`, `admin-test`, `channels`, `create-channel`, `feed`, `thread`, `create-post`, `reply`, `test-sign-in`

**Step 4: Add loading text to channel-status**

In `packages/web/src/App.tsx`, update the channel status paragraph (around line 574):

```tsx
<p className="channel-status">
  {isLoading('feed') ? 'Loading feed...' : 'Thread roots appear here.'}
</p>
```

**Step 5: Run tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "fix: replace single-op loading mutex with concurrent loading Set"
```

### Task 4.2: Add a loading spinner component to the UI package

**Files:**

- Create: `packages/ui/src/components/ui/spinner.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Write the spinner component**

Create `packages/ui/src/components/ui/spinner.tsx`:

```tsx
// ABOUTME: Animated loading spinner using CSS keyframes
// ABOUTME: Sizes match the button size scale for inline use

import * as React from 'react';
import { cn } from '../../lib/utils';

export type SpinnerProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'h-4 w-4 border-[1.5px]',
  md: 'h-5 w-5 border-2',
  lg: 'h-6 w-6 border-2',
} as const;

export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      aria-label="Loading"
      className={cn(
        'animate-spin rounded-full border-muted-foreground/30 border-t-primary',
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Spinner.displayName = 'Spinner';
```

**Step 2: Export from index.ts**

In `packages/ui/src/index.ts`, add:

```ts
export { Spinner } from './components/ui/spinner';
export type { SpinnerProps } from './components/ui/spinner';
```

**Step 3: Run typecheck**

```bash
pnpm --filter @mastra-mindspace/ui tsc --noEmit
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/ui/src/components/ui/spinner.tsx packages/ui/src/index.ts
git commit -m "feat: add Spinner loading indicator component to design system"
```

### Task 4.3: Use Spinner in the chat view for loading states

**Files:**

- Modify: `packages/web/src/App.tsx`

**Step 1: Import Spinner**

In `packages/web/src/App.tsx`, update the import from `@mastra-mindspace/ui`:

```tsx
import { Badge, Button, Card, Input, Spinner, cn, Textarea } from '@mastra-mindspace/ui';
```

**Step 2: Add spinners to key loading points**

In the channel feed header (around line 574), replace the text-only loading:

```tsx
<p className="channel-status">
  {isLoading('feed') ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <Spinner size="sm" /> Loading feed...
    </span>
  ) : (
    'Thread roots appear here.'
  )}
</p>
```

In the feed list empty state (around line 579):

```tsx
{isLoading('feed') ? (
  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
    <Spinner size="lg" />
  </div>
) : feedPosts.length === 0 ? (
  <p className="empty-state">No channel posts yet.</p>
) : (
  feedPosts.map((post) => (/* existing */))
)}
```

In the thread messages area (around line 633):

```tsx
{isLoading('thread') ? (
  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
    <Spinner size="lg" />
  </div>
) : threadMessages.length === 0 ? (
  <p className="empty-state">No thread selected.</p>
) : (
  threadMessages.map((entry) => (/* existing */))
)}
```

**Step 3: Run all tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat: show loading spinners during feed and thread loading"
```

---

## Phase 5: Error Handling

### Task 5.1: Replace global sticky error with scoped, auto-dismissing errors

The current `lastError` is a single global string that persists until a new operation clears it. An error from one action bleeds into unrelated views.

**Files:**

- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx`

**Step 1: Write a failing test**

```tsx
it('shows an error near the feed when post creation fails and auto-clears it', async () => {
  api.createChannelPost.mockRejectedValueOnce(new Error('Network failure'));

  window.history.pushState({}, '', '/chat/project-123');
  render(<App />);

  await screen.findByRole('button', {
    name: /open thread for ship the mindspace shell this sprint\./i,
  });

  fireEvent.change(screen.getByLabelText(/start a post/i), {
    target: { value: 'This will fail.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /send to general/i }));

  // Error appears near the composer
  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/network failure/i)).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @mastra-mindspace/web vitest run -- -t "shows an error near the feed"
```

Expected: FAIL — no element with `role="alert"` exists.

**Step 3: Add scoped error state**

In `packages/web/src/App.tsx`, replace the single `lastError` with scoped errors:

```tsx
const [errors, setErrors] = useState<Map<string, string>>(() => new Map());

function setError(scope: string, message: string) {
  setErrors((current) => new Map(current).set(scope, message));

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    setErrors((current) => {
      const next = new Map(current);
      next.delete(scope);
      return next;
    });
  }, 5000);
}

function clearError(scope: string) {
  setErrors((current) => {
    const next = new Map(current);
    next.delete(scope);
    return next;
  });
}
```

Then update all `catch` blocks to use scoped errors:
- `handleLoadFeed` catch: `setError('feed', String(error))`
- `handleCreatePost` catch: `setError('feed', String(error))`
- `handleOpenThread` catch: `setError('thread', String(error))`
- `handleReplyInThread` / `runThreadStream` catch: `setError('thread', String(error))`
- `handleLoadChannels` catch: `setError('channels', String(error))`
- `handleCreateChannel` catch: `setError('channels', String(error))`
- `handleBootstrapProject` catch: `setError('admin', String(error))`
- `handleRunAdminTest` catch: `setError('admin', String(error))`
- `handleGetMe` catch: `setError('admin', String(error))`
- `handleTestSignIn` catch: `setError('admin', String(error))`

Remove `setLastError('')` from the beginning of each handler. Replace with `clearError(scope)` if you want errors to clear on retry.

**Step 4: Add inline error display**

Create a small inline error renderer (inside App.tsx, above the App function):

```tsx
function InlineError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" style={{
      margin: 0,
      padding: '0.5rem 0.75rem',
      fontSize: '0.82rem',
      color: 'oklch(0.85 0.15 25)',
      background: 'oklch(0.55 0.22 25 / 0.12)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid oklch(0.55 0.22 25 / 0.25)',
    }}>
      {message}
    </p>
  );
}
```

Place `<InlineError message={errors.get('feed')} />` in the composer-panel area, and `<InlineError message={errors.get('thread')} />` above the reply button, and `<InlineError message={errors.get('channels')} />` in the sidebar channels area.

**Step 5: Update the thread-debug section**

Replace the old status section in the thread drawer:

```tsx
{/* Remove the thread-debug div entirely, or keep it minimal */}
```

The `lastError` variable and `thread-debug` div can be removed. The admin console can continue using `errors.get('admin')` in its existing `<pre>` block.

**Step 6: Run all tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass. Some existing tests may reference `lastError` text — update those assertions if needed.

**Step 7: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "fix: replace global sticky error with scoped auto-dismissing error display"
```

---

## Phase 6: Thread Drawer Controls

### Task 6.1: Add close button to thread drawer

**Files:**

- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx`

**Step 1: Write a failing test**

```tsx
it('closes the thread drawer when the close button is clicked', async () => {
  window.history.pushState({}, '', '/chat/project-123');
  render(<App />);

  const postButton = await screen.findByRole('button', {
    name: /open thread for ship the mindspace shell this sprint\./i,
  });
  fireEvent.click(postButton);

  await waitFor(() => {
    expect(screen.getByText('I can break that into milestones.')).toBeTruthy();
  });

  fireEvent.click(screen.getByRole('button', { name: /close thread/i }));

  await waitFor(() => {
    expect(screen.queryByText('I can break that into milestones.')).toBeNull();
  });

  expect(screen.getByText(/select a post/i)).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @mastra-mindspace/web vitest run -- -t "closes the thread drawer"
```

Expected: FAIL — no button with name "close thread" exists.

**Step 3: Add close button to thread drawer header**

In `packages/web/src/App.tsx`, update the thread-header (around line 622):

```tsx
<header className="thread-header">
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
    <div>
      <p className="eyebrow">Thread</p>
      <h2>{selectedThread ? 'Conversation' : 'Select a post'}</h2>
    </div>
    {selectedThread && (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close thread"
        onClick={() => {
          setSelectedThread(null);
          setThreadMessages([]);
          setStreamingReply('');
        }}
      >
        &times;
      </Button>
    )}
  </div>
  <p className="thread-subtitle">
    {selectedThread
      ? 'Replies stream here while the channel feed stays stable.'
      : 'Choose a feed post to open its thread.'}
  </p>
</header>
```

**Step 4: Run tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "feat: add close button to thread drawer"
```

### Task 6.2: Auto-scroll thread messages to bottom on new messages

**Files:**

- Modify: `packages/web/src/App.tsx`

**Step 1: Add a ref and scroll effect**

In `packages/web/src/App.tsx`, add near the top of the `App` function:

```tsx
const threadBottomRef = React.useRef<HTMLDivElement>(null);
```

Add an effect to scroll when messages change:

```tsx
useEffect(() => {
  threadBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [threadMessages, streamingReply]);
```

**Step 2: Add the scroll anchor element**

In the thread-messages div, after the streaming reply card and before the closing `</div>`:

```tsx
<div ref={threadBottomRef} />
```

**Step 3: Run all tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass. (jsdom doesn't actually scroll, but `scrollIntoView` won't error — it's a no-op.)

**Step 4: Verify visually**

Open a thread with multiple messages. Send a reply. Confirm the thread auto-scrolls to the new message.

**Step 5: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat: auto-scroll thread messages to bottom on new messages"
```

---

## Phase 7: Component Extraction

### Task 7.1: Extract Sidebar component

The goal is to move the sidebar JSX and its related state into a dedicated component. This is the first extraction — keep the others for subsequent tasks.

**Files:**

- Create: `packages/web/src/Sidebar.tsx`
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx` (existing tests must still pass)

**Step 1: Run existing tests to establish baseline**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass.

**Step 2: Create Sidebar component**

Create `packages/web/src/Sidebar.tsx`:

```tsx
// ABOUTME: Sidebar navigation showing projects, channels, and actions
// ABOUTME: Extracted from App.tsx for maintainability

import { Button, Input } from '@mastra-mindspace/ui';
import type { AccessibleProjectSummary, ChannelSummary } from './api';

export type SidebarProps = {
  projects: AccessibleProjectSummary[];
  activeProjectId: string;
  channels: ChannelSummary[];
  selectedChannelId: string;
  newChannelName: string;
  isCreatingChannel: boolean;
  hasUser: boolean;
  onNavigateProject: (projectId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onChangeNewChannelName: (name: string) => void;
  onCreateChannel: () => void;
  onNavigateAdmin: () => void;
  onSignOut: () => void;
};

export function Sidebar({
  projects,
  activeProjectId,
  channels,
  selectedChannelId,
  newChannelName,
  isCreatingChannel,
  hasUser,
  onNavigateProject,
  onSelectChannel,
  onChangeNewChannelName,
  onCreateChannel,
  onNavigateAdmin,
  onSignOut,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <p className="eyebrow">Mastra Mindspace</p>
        <h1>Mindspaces</h1>
      </div>

      <nav className="mindspace-list" aria-label="Projects">
        {projects.map((project) => (
          <div key={project.id}>
            <button
              className={
                project.id === activeProjectId
                  ? 'mindspace-button mindspace-button-active'
                  : 'mindspace-button'
              }
              onClick={() => onNavigateProject(project.id)}
            >
              <span className="mindspace-button-name">{project.name}</span>
              <span className="mindspace-button-slug">{project.slug}</span>
            </button>

            {project.id === activeProjectId && (
              <div className="mindspace-channels">
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

                <div className="mindspace-channels-actions">
                  <Input
                    value={newChannelName}
                    onChange={(event) => onChangeNewChannelName(event.target.value)}
                    placeholder="new channel"
                    aria-label="New channel name"
                  />
                  <Button
                    onClick={onCreateChannel}
                    disabled={!hasUser || !activeProjectId || isCreatingChannel}
                    size="sm"
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-actions">
        <Button variant="outline" size="sm" onClick={onNavigateAdmin}>
          Admin Console
        </Button>
        <Button variant="outline" size="sm" onClick={onSignOut} disabled={!hasUser}>
          Sign out
        </Button>
      </div>
    </aside>
  );
}
```

**Step 3: Replace sidebar JSX in App.tsx**

In `packages/web/src/App.tsx`, import the new component and replace the `<aside className="sidebar">...</aside>` block with:

```tsx
<Sidebar
  projects={projects}
  activeProjectId={route.projectId}
  channels={channels}
  selectedChannelId={selectedChannelId}
  newChannelName={newChannelName}
  isCreatingChannel={isLoading('create-channel')}
  hasUser={Boolean(user)}
  onNavigateProject={(id) => navigate(`/chat/${id}`)}
  onSelectChannel={setSelectedChannelId}
  onChangeNewChannelName={setNewChannelName}
  onCreateChannel={() => void handleCreateChannel()}
  onNavigateAdmin={() => navigate('/admin/test')}
  onSignOut={() => void signOutUser()}
/>
```

**Step 4: Run all tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All existing tests still pass — the extraction is purely structural.

**Step 5: Typecheck**

```bash
pnpm --filter @mastra-mindspace/web tsc --noEmit
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/web/src/Sidebar.tsx packages/web/src/App.tsx
git commit -m "refactor: extract Sidebar component from App.tsx"
```

### Task 7.2: Extract ChannelFeed component

Follow the same pattern as Task 7.1.

**Files:**

- Create: `packages/web/src/ChannelFeed.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Run existing tests (baseline)**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

**Step 2: Create ChannelFeed component**

Create `packages/web/src/ChannelFeed.tsx` — extract the `<section className="channel-feed">` block. Props should include:

- `selectedChannel: ChannelSummary | null`
- `feedPosts: ChannelFeedPost[]`
- `selectedThreadId: string | null` (for active card state)
- `newPostMessage: string`
- `isFeedLoading: boolean`
- `isCreatingPost: boolean`
- `feedError: string | undefined`
- `onOpenThread: (threadId: string) => void`
- `onChangeNewPostMessage: (message: string) => void`
- `onCreatePost: () => void`

Include the keyboard `onKeyDown` handler and the `InlineError` component (or import it).

**Step 3: Replace in App.tsx**

Replace the `<section className="channel-feed">` block with `<ChannelFeed ... />`.

**Step 4: Run all tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/web/src/ChannelFeed.tsx packages/web/src/App.tsx
git commit -m "refactor: extract ChannelFeed component from App.tsx"
```

### Task 7.3: Extract ThreadDrawer component

Follow the same pattern.

**Files:**

- Create: `packages/web/src/ThreadDrawer.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Run existing tests (baseline)**

**Step 2: Create ThreadDrawer component**

Extract the `<aside className="thread-drawer">` block. Props should include:

- `selectedThread: ThreadSummary | null`
- `threadMessages: ThreadMessage[]`
- `streamingReply: string`
- `replyMessage: string`
- `isThreadLoading: boolean`
- `isReplying: boolean`
- `threadError: string | undefined`
- `onClose: () => void`
- `onChangeReplyMessage: (message: string) => void`
- `onReply: () => void`

Include the `threadBottomRef` and auto-scroll effect inside this component.

**Step 3: Replace in App.tsx**

**Step 4: Run all tests**

```bash
pnpm --filter @mastra-mindspace/web vitest run
```

**Step 5: Commit**

```bash
git add packages/web/src/ThreadDrawer.tsx packages/web/src/App.tsx
git commit -m "refactor: extract ThreadDrawer component from App.tsx"
```

---

## Final Verification

After all phases are complete, run the full verification:

```bash
# All web tests
pnpm --filter @mastra-mindspace/web vitest run

# Typecheck across all packages
pnpm typecheck

# Visual verification
pnpm --filter @mastra-mindspace/web dev
```

Verify visually:
- [ ] Sidebar, feed, thread all scroll independently
- [ ] Composer and reply box stay pinned at bottom
- [ ] Feed cards highlight on hover and show selected state
- [ ] Cmd/Ctrl+Enter submits in both textareas
- [ ] Spinners appear during loading
- [ ] Errors appear inline near the action that caused them and auto-dismiss
- [ ] Thread drawer close button works
- [ ] New messages auto-scroll the thread
- [ ] Mobile responsive layout still works at 768px breakpoint

---

## What This Plan Does NOT Cover

These items were identified during the UI review but are out of scope for this hardening pass:

- **Markdown rendering in messages** — requires adding a markdown parser dependency
- **Message timestamps** — small feature, but needs design input on format
- **Collapsing reply box when no thread is selected** — minor UX polish
- **Admin console improvements** — the admin view is dev tooling, not user-facing
- **Optimistic post creation** — adds complexity; current round-trip is acceptable for now
