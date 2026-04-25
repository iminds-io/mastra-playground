# ABOUTME: Implementation plan for Phase 11f — Full-text search over channel messages
# ABOUTME: Covers backend search endpoint (Postgres ILIKE), frontend search overlay, and result navigation

# Phase 11f: Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Assigned**: Claude + Remy
**Priority**: Medium
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: Phase 11a (Foundation) provides router and layout shell. Phase 11b (Sidebar) provides channel context. Messages exist in `mastra_messages` table via `@mastra/pg` PostgresStore. Existing channel feed and thread detail components are functional.

**Goal:** Add simple full-text search over channel messages. Users can search within the current channel or across all project channels. Results show author, thread title, message snippet with highlighted terms, channel name, and relative time. Clicking a result navigates to the thread and scrolls to the matching message.

**Architecture:** Backend-first. A new search repository queries `mastra_messages` via `ILIKE` on the JSON `content` column. A new search service function handles auth and scope resolution. A new Hono route exposes `GET /api/projects/:projectId/search`. The frontend adds a search overlay component triggered from the channel feed header, with debounced input and paginated results.

**Tech Stack:** Hono (Cloudflare Workers), Postgres via `getDatabasePool()` raw SQL, React 19, Vite 8, Tailwind CSS v4, Vitest + @testing-library/react, `@mastra-mindspace/ui` design system.

---

## Current State Summary

| Area | What exists | File |
|------|-------------|------|
| **Message storage** | Messages stored in `mastra_messages` table (managed by `@mastra/pg` PostgresStore). Columns: `id`, `content` (jsonb), `role`, `type`, `createdAt`, `thread_id`, `resourceId`. Content JSON shape: `{ format, content, parts: [{ type, text }] }`. | `@mastra/pg` PostgresStore DDL |
| **Thread metadata** | `channel_threads` table with `id`, `channel_id`, `owner_user_id`, `title`, `status`, `last_message_at`. | `packages/platform/src/db/migrations/002_channels_and_threads.sql` |
| **Channel metadata** | `project_channels` table with `id`, `project_id`, `name`, `slug`. | `packages/platform/src/db/migrations/002_channels_and_threads.sql` |
| **DB access pattern** | `getDatabasePool().query<T>(sql, params)` returning `{ rows, rowCount }`. Raw SQL, no ORM. | `packages/platform/src/db/context.ts`, all repositories in `packages/platform/src/db/repositories/` |
| **Route pattern** | Hono routes in `packages/worker/src/index.ts`. Auth middleware at `/api/*` sets `principal` variable. Service functions imported from `@mastra-mindspace/platform`. | `packages/worker/src/index.ts` lines 162-185 |
| **Frontend API pattern** | `apiFetch<T>(path, user, init)` in `packages/web/src/api.ts`. Returns typed response with `__meta`. | `packages/web/src/api.ts` lines 95-124 |
| **Channel feed header** | `ChannelFeed.tsx` renders `<header className="channel-feed-header">` with channel name and status text. No search icon. | `packages/web/src/ChannelFeed.tsx` lines 44-58 |
| **Search** | Nothing exists. No search endpoint, no search UI, no search-related code anywhere. | — |

---

## Open Questions

1. **`mastra_messages.content` column type**: The content is stored as jsonb. The actual text lives at `content->'content'` (string) and `content->'parts'->0->'text'` (string). We need to decide which path to query. The `content->'content'` path is the simpler scalar string and matches the `extractMessageText` fallback in `chat.ts`. We should query `content->>'content'` via `ILIKE` for v1 simplicity.

2. **User display names in results**: The `mastra_messages` table has `role` (user/assistant) but no author name. The `channel_threads` table has `owner_user_id` (UUID). The `users` table has `display_name`. For v1, we can show "User" / "Assistant" as author names since resolving display names requires a JOIN through `channel_threads.owner_user_id -> users.display_name`, and individual messages don't store their author user ID. **Decision needed from Remy**: (A) Show role as author name ("You" / "Assistant"), (B) Join through thread owner to show the thread creator's name for all messages in that thread, or (C) Accept the limitation and show role labels.

3. **Index strategy**: For small teams (2-5 people), `ILIKE` on `content->>'content'` without a GIN index is acceptable. A `to_tsvector` GIN index would be better for larger datasets but adds migration complexity. **Recommendation**: Start with `ILIKE`, add a GIN index migration later if performance warrants it.

---

## Success Criteria

- [ ] `GET /api/projects/:projectId/search?q=<query>` returns matching messages scoped to project
- [ ] `GET /api/projects/:projectId/search?q=<query>&channelId=<id>` scopes results to a single channel
- [ ] Results include: message ID, thread ID, channel ID, channel name, message text snippet, author role, relative timestamp
- [ ] Empty query returns empty results (not an error)
- [ ] Results are ordered by `createdAt` descending (most recent first)
- [ ] Results are paginated: 20 per page, `page` query param for pagination
- [ ] Search icon button appears in channel feed header
- [ ] Clicking search icon opens overlay that covers the feed list area
- [ ] Search input is auto-focused when overlay opens
- [ ] Typing triggers search with 300ms debounce
- [ ] "This channel" / "All channels" scope toggle works
- [ ] Result cards show: author role, thread title, snippet with bold search terms, channel name, relative time
- [ ] Clicking a result closes the overlay and opens the thread
- [ ] Escape key closes the overlay
- [ ] Backend search service has unit tests
- [ ] Frontend search overlay has rendering and interaction tests
- [ ] `pnpm typecheck` passes across all packages

---

## Recommended Sequencing

Execute these tasks in order. Each task is independently committable.

1. **Task 1: Search repository** — Raw SQL query function against `mastra_messages` + `channel_threads` + `project_channels`
2. **Task 2: Search service** — Auth-gated service function with scope resolution
3. **Task 3: Search route** — Hono GET endpoint wired into worker
4. **Task 4: Frontend API function** — `searchMessages()` in `api.ts`
5. **Task 5: SearchOverlay component** — Presentational overlay with input, scope toggle, results
6. **Task 6: Wire SearchOverlay into ChannelFeed** — Search icon in header, overlay state management
7. **Task 7: Search overlay CSS** — Styling for overlay, result cards, scope toggle

---

## Task 1: Search Repository

### Goal

Create a repository function that queries `mastra_messages` joined with `channel_threads` and `project_channels` to find messages matching a text query. Uses `ILIKE` on `content->>'content'` for v1 simplicity.

### TDD Steps

1. Write a test that calls the search function and asserts the returned shape
2. Run test — fails (function doesn't exist)
3. Implement the repository function
4. Run test — passes

### Files

**Create:** `packages/platform/src/db/repositories/search.ts`
**Create:** `packages/platform/test/unit/search-repository.test.ts`

### Test: `packages/platform/test/unit/search-repository.test.ts`

```typescript
// ABOUTME: Tests for the message search repository query function
// ABOUTME: Validates SQL construction, parameter handling, and result shape

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../src/db/context', () => ({
  getDatabasePool: () => ({ query: mockQuery }),
}));

import { searchMessages, type SearchResult } from '../../src/db/repositories/search';

describe('searchMessages', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns empty array for empty query', async () => {
    const results = await searchMessages({
      projectId: 'project-1',
      query: '',
      limit: 20,
      offset: 0,
    });

    expect(results).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only query', async () => {
    const results = await searchMessages({
      projectId: 'project-1',
      query: '   ',
      limit: 20,
      offset: 0,
    });

    expect(results).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('queries with ILIKE when query is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await searchMessages({
      projectId: 'project-1',
      query: 'deploy',
      limit: 20,
      offset: 0,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('ILIKE');
    expect(params).toContain('%deploy%');
  });

  it('scopes to channel when channelId is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await searchMessages({
      projectId: 'project-1',
      query: 'deploy',
      channelId: 'channel-1',
      limit: 20,
      offset: 0,
    });

    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('channel_id');
    expect(params).toContain('channel-1');
  });

  it('does not include channel filter when channelId is omitted', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await searchMessages({
      projectId: 'project-1',
      query: 'deploy',
      limit: 20,
      offset: 0,
    });

    const [_sql, params] = mockQuery.mock.calls[0]!;
    expect(params).not.toContain('channel-1');
  });

  it('maps rows to SearchResult shape', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        message_id: 'msg-1',
        thread_id: 'thread-1',
        channel_id: 'channel-1',
        channel_name: 'engineering',
        message_text: 'deploy the auth fix today',
        thread_title: 'Deploy auth fix',
        role: 'user',
        created_at: new Date('2026-04-20T14:00:00Z'),
      }],
      rowCount: 1,
    });

    const results = await searchMessages({
      projectId: 'project-1',
      query: 'deploy',
      limit: 20,
      offset: 0,
    });

    expect(results).toHaveLength(1);
    const result: SearchResult = results[0]!;
    expect(result.messageId).toBe('msg-1');
    expect(result.threadId).toBe('thread-1');
    expect(result.channelId).toBe('channel-1');
    expect(result.channelName).toBe('engineering');
    expect(result.messageText).toBe('deploy the auth fix today');
    expect(result.threadTitle).toBe('Deploy auth fix');
    expect(result.role).toBe('user');
    expect(result.createdAt).toBe('2026-04-20T14:00:00.000Z');
  });

  it('applies limit and offset', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await searchMessages({
      projectId: 'project-1',
      query: 'deploy',
      limit: 10,
      offset: 20,
    });

    const [_sql, params] = mockQuery.mock.calls[0]!;
    expect(params).toContain(10);
    expect(params).toContain(20);
  });

  it('escapes ILIKE wildcard characters in query', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await searchMessages({
      projectId: 'project-1',
      query: '100%_done',
      limit: 20,
      offset: 0,
    });

    const [_sql, params] = mockQuery.mock.calls[0]!;
    const likeParam = params.find((p: unknown) => typeof p === 'string' && p.startsWith('%'));
    expect(likeParam).toContain('100\\%\\_done');
  });
});
```

### Implementation: `packages/platform/src/db/repositories/search.ts`

```typescript
// ABOUTME: Searches channel messages by text content using ILIKE on the mastra_messages table
// ABOUTME: Joins channel_threads and project_channels to include thread/channel metadata in results

import { getDatabasePool } from '../context';

export type SearchResult = {
  messageId: string;
  threadId: string;
  channelId: string;
  channelName: string;
  messageText: string;
  threadTitle: string | null;
  role: string;
  createdAt: string;
};

type SearchResultRow = {
  message_id: string;
  thread_id: string;
  channel_id: string;
  channel_name: string;
  message_text: string;
  thread_title: string | null;
  role: string;
  created_at: Date;
};

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export async function searchMessages(input: {
  projectId: string;
  query: string;
  channelId?: string;
  limit: number;
  offset: number;
}): Promise<SearchResult[]> {
  const trimmed = input.query.trim();

  if (!trimmed) {
    return [];
  }

  const escapedQuery = `%${escapeIlike(trimmed)}%`;
  const params: unknown[] = [input.projectId, escapedQuery];
  let paramIndex = 3;

  let channelFilter = '';
  if (input.channelId) {
    channelFilter = `AND ct.channel_id = $${paramIndex}`;
    params.push(input.channelId);
    paramIndex++;
  }

  params.push(input.limit, input.offset);

  const sql = `
    SELECT
      m.id AS message_id,
      m.thread_id,
      ct.channel_id,
      pc.name AS channel_name,
      m.content->>'content' AS message_text,
      ct.title AS thread_title,
      m.role,
      m."createdAt" AS created_at
    FROM mastra_messages m
    JOIN channel_threads ct ON ct.id = m.thread_id
    JOIN project_channels pc ON pc.id = ct.channel_id
    WHERE pc.project_id = $1
      AND m.content->>'content' ILIKE $2
      ${channelFilter}
      AND ct.status = 'active'
    ORDER BY m."createdAt" DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const result = await getDatabasePool().query<SearchResultRow>(sql, params);

  return result.rows.map((row) => ({
    messageId: row.message_id,
    threadId: row.thread_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    messageText: row.message_text,
    threadTitle: row.thread_title,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  }));
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/platform/test/unit/search-repository.test.ts
```

---

## Task 2: Search Service

### Goal

Create an auth-gated service function `searchChannelMessagesForPrincipal` that validates the caller has access to the project and delegates to the search repository.

### TDD Steps

1. Write a test that calls the service function and asserts it delegates correctly
2. Run test — fails (function doesn't exist)
3. Implement the service function
4. Run test — passes

### Files

**Create:** `packages/platform/src/services/search.ts`
**Create:** `packages/platform/test/unit/search-service.test.ts`

### Test: `packages/platform/test/unit/search-service.test.ts`

```typescript
// ABOUTME: Tests for the search service auth gating and delegation
// ABOUTME: Validates that project access is checked before searching

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/project-context', () => ({
  loadProjectContext: vi.fn(async () => ({
    actorUserId: 'user-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    role: 'owner',
    resourceId: 'project:project-1',
  })),
}));

const mockSearchMessages = vi.fn();

vi.mock('../../src/db/repositories/search', () => ({
  searchMessages: (...args: unknown[]) => mockSearchMessages(...args),
}));

import { searchChannelMessagesForPrincipal } from '../../src/services/search';
import { loadProjectContext } from '../../src/services/project-context';

describe('searchChannelMessagesForPrincipal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchMessages.mockResolvedValue([]);
  });

  it('checks project access before searching', async () => {
    await searchChannelMessagesForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      query: 'deploy',
    });

    expect(loadProjectContext).toHaveBeenCalledWith({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
    });
  });

  it('delegates to searchMessages with correct params', async () => {
    await searchChannelMessagesForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      query: 'deploy',
      channelId: 'channel-1',
      page: 2,
    });

    expect(mockSearchMessages).toHaveBeenCalledWith({
      projectId: 'project-1',
      query: 'deploy',
      channelId: 'channel-1',
      limit: 20,
      offset: 40,
    });
  });

  it('defaults to page 0 when page is not provided', async () => {
    await searchChannelMessagesForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      query: 'deploy',
    });

    expect(mockSearchMessages).toHaveBeenCalledWith({
      projectId: 'project-1',
      query: 'deploy',
      channelId: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it('returns results from searchMessages', async () => {
    const mockResults = [
      {
        messageId: 'msg-1',
        threadId: 'thread-1',
        channelId: 'channel-1',
        channelName: 'engineering',
        messageText: 'deploy fix',
        threadTitle: 'Deploy auth fix',
        role: 'user',
        createdAt: '2026-04-20T14:00:00.000Z',
      },
    ];
    mockSearchMessages.mockResolvedValue(mockResults);

    const result = await searchChannelMessagesForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      query: 'deploy',
    });

    expect(result.results).toEqual(mockResults);
  });
});
```

### Implementation: `packages/platform/src/services/search.ts`

```typescript
// ABOUTME: Auth-gated search service for channel messages
// ABOUTME: Validates project access then delegates to the search repository

import { searchMessages, type SearchResult } from '../db/repositories/search';
import { loadProjectContext } from './project-context';

const PAGE_SIZE = 20;

export async function searchChannelMessagesForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  query: string;
  channelId?: string;
  page?: number;
}): Promise<{ results: SearchResult[] }> {
  await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });

  const page = input.page ?? 0;
  const results = await searchMessages({
    projectId: input.projectId,
    query: input.query,
    channelId: input.channelId,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  return { results };
}
```

### Export

Add to `packages/platform/src/index.ts`:

```typescript
export * from './services/search';
export * from './db/repositories/search';
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/platform/test/unit/search-service.test.ts
```

---

## Task 3: Search Route

### Goal

Add a Hono GET route `GET /api/projects/:projectId/search` that reads `q`, `channelId`, and `page` from query params and calls the search service.

### TDD Steps

1. Write a smoke/integration test for the route (or manually verify with curl)
2. Run test — fails (route doesn't exist)
3. Add the route to `packages/worker/src/index.ts`
4. Run test — passes

### Files

**Modify:** `packages/worker/src/index.ts` — add search route
**Modify:** `packages/worker/src/index.ts` — add `searchChannelMessagesForPrincipal` to imports

### Implementation: Route addition in `packages/worker/src/index.ts`

Add the import `searchChannelMessagesForPrincipal` to the existing import block from `@mastra-mindspace/platform` (line 10).

Add the route after the existing channel routes (after line ~445, after the `GET /api/projects/:projectId/channels/:channelId/threads` route):

```typescript
app.get('/api/projects/:projectId/search', async (c) => {
  const principal = c.get('principal');
  const query = c.req.query('q') ?? '';
  const channelId = c.req.query('channelId') ?? undefined;
  const page = parseInt(c.req.query('page') ?? '0', 10);
  const result = await searchChannelMessagesForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    query,
    channelId,
    page: Number.isNaN(page) ? 0 : page,
  });
  return c.json(result);
});
```

### Verification

After adding the route, verify with:
```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/worker typecheck
```

---

## Task 4: Frontend API Function

### Goal

Add a `searchMessages` function to `packages/web/src/api.ts` that calls the search endpoint.

### TDD Steps

1. Write a test that asserts the API function exists and constructs the correct URL
2. Run test — fails
3. Implement the function
4. Run test — passes

### Files

**Modify:** `packages/web/src/api.ts` — add search types and function

### Implementation: additions to `packages/web/src/api.ts`

Add the search result type after the existing type declarations:

```typescript
export type SearchResult = {
  messageId: string;
  threadId: string;
  channelId: string;
  channelName: string;
  messageText: string;
  threadTitle: string | null;
  role: string;
  createdAt: string;
};
```

Add the function after the existing API functions:

```typescript
export async function searchMessages(
  user: AuthUser,
  projectId: string,
  query: string,
  options?: { channelId?: string; page?: number },
) {
  const params = new URLSearchParams({ q: query });
  if (options?.channelId) {
    params.set('channelId', options.channelId);
  }
  if (options?.page !== undefined && options.page > 0) {
    params.set('page', String(options.page));
  }
  return apiFetch<{
    results: SearchResult[];
  } & ResponseMeta>(`/api/projects/${projectId}/search?${params}`, user, {
    method: 'GET',
  });
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm --filter @mastra-mindspace/web typecheck
```

---

## Task 5: SearchOverlay Component

### Goal

Create a `SearchOverlay` presentational component with:
- Text input for search query
- "This channel" / "All channels" scope toggle
- List of result cards
- Close button and Escape key handler

### TDD Steps

1. Write rendering and interaction tests
2. Run tests — fail (component doesn't exist)
3. Create the component
4. Run tests — pass

### Files

**Create:** `packages/web/src/SearchOverlay.tsx`
**Create:** `packages/web/src/SearchOverlay.test.tsx`

### Test: `packages/web/src/SearchOverlay.test.tsx`

```typescript
// ABOUTME: Tests for the SearchOverlay component rendering and interactions
// ABOUTME: Covers input, scope toggle, result cards, close behavior, and keyboard handling

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SearchOverlay } from './SearchOverlay';
import type { SearchResult } from './api';

const sampleResults: SearchResult[] = [
  {
    messageId: 'msg-1',
    threadId: 'thread-1',
    channelId: 'channel-1',
    channelName: 'engineering',
    messageText: 'We need to deploy the auth fix before 5pm',
    threadTitle: 'Deploy auth fix',
    role: 'user',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    messageId: 'msg-2',
    threadId: 'thread-2',
    channelId: 'channel-1',
    channelName: 'engineering',
    messageText: 'No expiry check on the token refresh endpoint',
    threadTitle: 'Deploy auth fix',
    role: 'assistant',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

describe('SearchOverlay', () => {
  const defaultProps = {
    channelName: 'engineering',
    query: '',
    scope: 'channel' as const,
    results: [] as SearchResult[],
    isLoading: false,
    onQueryChange: vi.fn(),
    onScopeChange: vi.fn(),
    onSelectResult: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders search input with channel name placeholder', () => {
    render(<SearchOverlay {...defaultProps} />);
    const input = screen.getByRole('searchbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Search #engineering...');
  });

  it('renders scope toggle buttons', () => {
    render(<SearchOverlay {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'This channel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All channels' })).toBeInTheDocument();
  });

  it('highlights active scope', () => {
    render(<SearchOverlay {...defaultProps} scope="channel" />);
    const channelBtn = screen.getByRole('button', { name: 'This channel' });
    expect(channelBtn.className).toContain('active');
  });

  it('calls onScopeChange when scope button is clicked', () => {
    const onScopeChange = vi.fn();
    render(<SearchOverlay {...defaultProps} onScopeChange={onScopeChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'All channels' }));
    expect(onScopeChange).toHaveBeenCalledWith('all');
  });

  it('renders result cards', () => {
    render(<SearchOverlay {...defaultProps} results={sampleResults} />);
    expect(screen.getByText('Deploy auth fix')).toBeInTheDocument();
    expect(screen.getByText('#engineering')).toBeInTheDocument();
  });

  it('calls onSelectResult when result card is clicked', () => {
    const onSelectResult = vi.fn();
    render(<SearchOverlay {...defaultProps} results={sampleResults} onSelectResult={onSelectResult} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Open thread/ })[0]!);
    expect(onSelectResult).toHaveBeenCalledWith(sampleResults[0]);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<SearchOverlay {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<SearchOverlay {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onQueryChange when input value changes', () => {
    const onQueryChange = vi.fn();
    render(<SearchOverlay {...defaultProps} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'deploy' } });
    expect(onQueryChange).toHaveBeenCalledWith('deploy');
  });

  it('shows empty state when query exists but no results', () => {
    render(<SearchOverlay {...defaultProps} query="xyznotfound" results={[]} />);
    expect(screen.getByText(/No results/)).toBeInTheDocument();
  });

  it('shows loading spinner when isLoading is true', () => {
    render(<SearchOverlay {...defaultProps} query="deploy" isLoading={true} />);
    expect(screen.getByText('Searching...')).toBeInTheDocument();
  });
});
```

### Implementation: `packages/web/src/SearchOverlay.tsx`

```typescript
// ABOUTME: Search overlay for full-text search across channel messages
// ABOUTME: Renders search input, scope toggle, and paginated result cards

import { useEffect, useRef } from 'react';

import { Button, Card, Spinner, cn } from '@mastra-mindspace/ui';

import type { SearchResult } from './api';

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function highlightTerms(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];

  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? <strong key={i}>{part}</strong> : part,
  );
}

function snippetAround(text: string, query: string, maxLength = 120): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1 || text.length <= maxLength) return text;

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, start + maxLength);
  const snippet = text.slice(start, end);

  return (start > 0 ? '...' : '') + snippet + (end < text.length ? '...' : '');
}

export type SearchScope = 'channel' | 'all';

export type SearchOverlayProps = {
  channelName: string;
  query: string;
  scope: SearchScope;
  results: SearchResult[];
  isLoading: boolean;
  onQueryChange: (query: string) => void;
  onScopeChange: (scope: SearchScope) => void;
  onSelectResult: (result: SearchResult) => void;
  onClose: () => void;
};

export function SearchOverlay({
  channelName,
  query,
  scope,
  results,
  isLoading,
  onQueryChange,
  onScopeChange,
  onSelectResult,
  onClose,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="search-overlay">
      <div className="search-overlay-header">
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          className="search-overlay-input"
          placeholder={`Search #${channelName}...`}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        <button
          className="search-overlay-close"
          onClick={onClose}
          aria-label="Close search"
        >
          ✕
        </button>
      </div>

      <div className="search-scope-toggle">
        <button
          className={cn('search-scope-pill', scope === 'channel' && 'search-scope-pill-active')}
          onClick={() => onScopeChange('channel')}
        >
          This channel
        </button>
        <span className="search-scope-separator">·</span>
        <button
          className={cn('search-scope-pill', scope === 'all' && 'search-scope-pill-active')}
          onClick={() => onScopeChange('all')}
        >
          All channels
        </button>
      </div>

      <div className="search-results">
        {isLoading ? (
          <div className="search-loading">
            <Spinner size="sm" />
            <span>Searching...</span>
          </div>
        ) : query.trim() && results.length === 0 ? (
          <p className="search-empty">No results found.</p>
        ) : (
          results.map((result) => (
            <Card key={result.messageId} className="overflow-hidden">
              <button
                className="search-result-card"
                onClick={() => onSelectResult(result)}
                aria-label={`Open thread: ${result.threadTitle ?? result.messageText.slice(0, 40)}`}
              >
                <div className="search-result-header">
                  <span className="search-result-author">
                    {result.role === 'user' ? 'User' : 'Assistant'}
                  </span>
                  {result.threadTitle && (
                    <>
                      <span className="search-result-separator">·</span>
                      <span className="search-result-title">"{result.threadTitle}"</span>
                    </>
                  )}
                </div>
                <p className="search-result-snippet">
                  {highlightTerms(snippetAround(result.messageText, query), query)}
                </p>
                <div className="search-result-meta">
                  <span className="search-result-channel">#{result.channelName}</span>
                  <span className="search-result-time">
                    {formatRelativeTime(result.createdAt)}
                  </span>
                </div>
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/SearchOverlay.test.tsx
```

---

## Task 6: Wire SearchOverlay into ChannelFeed

### Goal

Add a search icon button to the channel feed header. When clicked, it opens the `SearchOverlay` component over the feed list area. Manage search state (query, scope, results, loading) and wire up the debounced API call.

### TDD Steps

1. Write tests that assert the search icon renders, overlay appears on click, and closes on Escape
2. Run tests — fail (search icon doesn't exist)
3. Modify `ChannelFeed.tsx` to include search icon and overlay
4. Run tests — pass

### Files

**Modify:** `packages/web/src/ChannelFeed.tsx` — add search icon and overlay rendering
**Modify:** `packages/web/src/App.tsx` — add search state management and pass props

### Implementation notes

The `ChannelFeed` component needs two new props:
- `isSearchOpen: boolean`
- `onToggleSearch: () => void`
- `searchOverlayProps: SearchOverlayProps | null` (when search is open)

In `App.tsx`, add state for:
- `isSearchOpen` (boolean)
- `searchQuery` (string)
- `searchScope` ('channel' | 'all')
- `searchResults` (SearchResult[])
- `isSearching` (boolean)

Add a `useEffect` with a 300ms debounce on `searchQuery` + `searchScope` that calls `searchMessages` from `api.ts`.

Add a search icon button to the channel feed header in `ChannelFeed.tsx`:

```tsx
<header className="channel-feed-header">
  <div className="channel-feed-header-row">
    <div>
      <p className="eyebrow">Channel</p>
      <h2>#{selectedChannel?.name ?? 'Select a channel'}</h2>
    </div>
    {selectedChannel && (
      <button
        className="search-trigger"
        onClick={onToggleSearch}
        aria-label="Search messages"
      >
        🔍
      </button>
    )}
  </div>
  {/* ... status text ... */}
</header>
```

When `isSearchOpen` is true, render `<SearchOverlay>` in place of the feed list:

```tsx
{isSearchOpen && searchOverlayProps ? (
  <SearchOverlay {...searchOverlayProps} />
) : (
  <div className="feed-list">
    {/* ... existing feed list content ... */}
  </div>
)}
```

The `onSelectResult` handler should:
1. Set `isSearchOpen` to false
2. Call `onOpenThread(result.threadId)` to navigate to the thread

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/ChannelFeed.test.tsx
```

---

## Task 7: Search Overlay CSS

### Goal

Add CSS styles for the search overlay, result cards, scope toggle, and search trigger button to `packages/web/src/styles.css`.

### Files

**Modify:** `packages/web/src/styles.css` — add search overlay styles after the channel feed section

### Implementation: CSS additions to `packages/web/src/styles.css`

Add after the `/* ─── Channel feed ─── */` section (around line 248):

```css
/* ─── Search overlay ────────────────────────────────────────────────────── */
.search-trigger {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  font-size: 1.1rem;
  color: var(--muted-foreground);
  transition: background 160ms ease, color 160ms ease;
}

.search-trigger:hover {
  background: oklch(from var(--primary) l c h / 0.12);
  color: var(--foreground);
}

.channel-feed-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.search-overlay {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 0.75rem;
  min-height: 0;
  overflow: hidden;
}

.search-overlay-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-overlay-input {
  flex: 1;
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.6rem 0.85rem;
  color: inherit;
  font-size: 0.9rem;
  font-family: inherit;
}

.search-overlay-input::placeholder {
  color: var(--muted-foreground);
}

.search-overlay-input:focus {
  outline: none;
  border-color: var(--ring);
  box-shadow: 0 0 0 2px oklch(from var(--ring) l c h / 0.25);
}

.search-overlay-close {
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.4rem;
  border-radius: var(--radius-md);
  transition: color 160ms ease;
}

.search-overlay-close:hover {
  color: var(--foreground);
}

.search-scope-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
}

.search-scope-pill {
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0.25rem 0;
  transition: color 160ms ease;
}

.search-scope-pill:hover {
  color: var(--foreground);
}

.search-scope-pill-active {
  color: var(--primary);
  font-weight: 600;
}

.search-scope-separator {
  color: var(--muted-foreground);
}

.search-results {
  display: grid;
  gap: 0.5rem;
  align-content: start;
  min-height: 0;
  overflow-y: auto;
}

.search-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--muted-foreground);
  font-size: 0.85rem;
}

.search-empty {
  color: var(--muted-foreground);
  font-size: 0.85rem;
  padding: 1rem 0;
}

.search-result-card {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: inherit;
  padding: 0.7rem 0.85rem;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background 160ms ease;
}

.search-result-card:hover {
  background: oklch(from var(--primary) l c h / 0.08);
}

.search-result-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  margin-bottom: 0.3rem;
}

.search-result-author {
  font-weight: 600;
  font-size: 0.82rem;
}

.search-result-separator {
  color: var(--muted-foreground);
}

.search-result-title {
  color: var(--muted-foreground);
  font-size: 0.82rem;
}

.search-result-snippet {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.search-result-snippet strong {
  color: var(--foreground);
  font-weight: 600;
}

.search-result-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.4rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.search-result-channel {
  color: var(--muted-foreground);
}

.search-result-time {
  color: var(--muted-foreground);
}

@media (max-width: 768px) {
  .search-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--background);
    padding: 1rem;
  }
}
```

### Test command

No automated test — verify visually and with `pnpm typecheck`.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/platform/src/db/repositories/search.ts` | Create | Search query function using ILIKE on mastra_messages |
| `packages/platform/test/unit/search-repository.test.ts` | Create | Unit tests for search repository |
| `packages/platform/src/services/search.ts` | Create | Auth-gated search service |
| `packages/platform/test/unit/search-service.test.ts` | Create | Unit tests for search service |
| `packages/platform/src/index.ts` | Modify | Export search service and repository |
| `packages/worker/src/index.ts` | Modify | Add GET search route + import |
| `packages/web/src/api.ts` | Modify | Add SearchResult type + searchMessages function |
| `packages/web/src/SearchOverlay.tsx` | Create | Search overlay component |
| `packages/web/src/SearchOverlay.test.tsx` | Create | Tests for SearchOverlay component |
| `packages/web/src/ChannelFeed.tsx` | Modify | Add search icon button, render overlay |
| `packages/web/src/App.tsx` | Modify | Add search state management, debounced API call |
| `packages/web/src/styles.css` | Modify | Add search overlay CSS rules |
