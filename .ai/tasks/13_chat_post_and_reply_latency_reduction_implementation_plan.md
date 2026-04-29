# ABOUTME: Implementation plan for reducing new-post and AI-reply latency in Mastra Mindspace chat
# ABOUTME: Uses a combined strategy: measurement, immediate optimistic UX fixes, transport simplification, then staged TanStack Query adoption

# Phase 13: Chat Post And Reply Latency Reduction Implementation Plan

> **For Claude:** Execute this as a performance-and-architecture task. First measure, then remove the current synchronous UX stalls, then improve the transport contract, then migrate server-state management incrementally. Do not jump straight to TanStack Query without first fixing the structural latency path.

**Status**: Planning  
**Created**: 2026-04-25  
**Assigned**: Claude + coworker  
**Priority**: High  
**Estimated Effort**: 4-6 focused sessions  
**Dependencies**: Task 11 redesign shell, realtime SSE (`11g`), root bootstrap improvements from Phase 12, current worker/app chat routes

## Goal
Reduce the latency users feel when:

1. submitting a new channel post and waiting for the thread card to appear
2. waiting for the AI reply to begin streaming in that new thread

## Architecture
The current latency is not just “model slowness.” It comes from two back-to-back synchronous waits in the product flow:

```text
create post request
  -> thread card only appears after response
  -> open thread request
  -> stream request
  -> model first-token latency
```

This plan uses a combined strategy:

1. instrument the current path so latency is attributable
2. remove avoidable UI/transport waits with optimistic thread/feed updates
3. add a single create-and-stream transport for the long-term optimal new-post path
4. migrate the chat server state to TanStack Query incrementally so optimistic updates, cache invalidation, and SSE reconciliation become structurally easier

## Tech Stack
- React 19 + custom router in `packages/web`
- Hono app/worker surfaces in `packages/app` and `packages/worker`
- Platform chat service in `packages/platform`
- Neon Postgres
- Mastra memory/storage and workspace execution
- Server-sent events for realtime channel updates
- Vitest unit/integration/E2E/smoke suites
- Proposed new dependency: `@tanstack/react-query`

---

## Current-State Findings

### 1. New post visibility is blocked on the create request
In `packages/web/src/App.tsx`, `handleCreatePost()` does this:

```ts
const result = await createChannelPost(...)
setFeedPosts(...)
await handleOpenThread(result.thread.id)
await runThreadStream(...)
```

The feed card is not inserted until `createChannelPost()` returns. There is no optimistic feed-thread insertion yet.

### 2. New-thread AI streaming is blocked on opening the thread first
The app waits for `handleOpenThread()` before it even starts the AI stream. That adds an extra round trip between the user’s submit and the stream `ack`.

### 3. The stream path does meaningful setup work before first token
`streamChannelReplyForPrincipal()` currently performs:

- `loadProjectContext()`
- thread lookup
- `buildExecutionContext()`
- `resolveMindspaceForProject()`
- workspace creation via `mindspaceFactory`
- memory fetch for thread context
- `agent.stream(...)`

Only after that does the first token arrive.

### 4. SSE exists, but the UI is not using it to make the new-post path feel instant
The current channel event model already supports:

- `new_thread`
- `new_message`
- `thread_updated`
- `mind_streaming`

But `handleCreatePost()` still drives the post-creation UX synchronously instead of relying on optimistic state plus reconciliation.

### 5. The current `App.tsx` is carrying too much server-state orchestration
`App.tsx` is manually managing:

- bootstrap data
- projects
- channels
- feed posts
- thread details
- settings
- search
- loading maps
- error maps
- optimistic thread state
- SSE reconciliation

This is a strong signal that TanStack Query is a good long-term fit, but it is not by itself the fix for the structural latency path.

### 6. `packages/web` does not currently use TanStack Query
Current `packages/web/package.json` has no query/cache library. Any adoption here is a real architectural step, not just wiring an existing dependency.

## Executive Decisions

### Decision 1: Use a combined strategy, not a one-shot rewrite
Do not try to solve all perceived latency only by:

- optimistic UI, or
- TanStack Query, or
- backend transport redesign

Each helps a different layer. We need all three, in the right order.

### Decision 2: Measurement comes first
Add instrumentation before the larger fixes so the team can distinguish:

- create-thread latency
- thread-open latency
- stream startup latency
- model first-token latency
- end-to-end time-to-first-visible-UI and time-to-first-token

### Decision 3: Fix the current UX path before introducing TanStack Query
The fastest high-leverage change is:

- optimistic feed card insertion
- optimistic thread opening
- starting the stream without blocking on a separate thread-open request

That should land before a broader server-state migration.

### Decision 4: TanStack Query is recommended, but staged
Adopt TanStack Query as the long-term chat/server-state foundation, but do it after the immediate UX fixes have reduced the obvious synchronous stalls.

### Decision 5: Long-term optimal new-post path is a single create-and-stream endpoint
The best end state for new root posts is:

```text
POST /posts/stream
  -> creates thread + root message
  -> emits thread_created immediately
  -> streams assistant response in the same request
```

That is the optimal transport contract for the product experience.

## Success Criteria

- [ ] the app records useful timing metrics for new-post and reply flows
- [ ] a new thread card appears immediately on submit via optimistic UI
- [ ] the new thread opens immediately without waiting for a separate blocking fetch
- [ ] the assistant placeholder/spinner appears on `ack`, not only after first token
- [ ] optimistic thread/feed state reconciles correctly with real server responses and SSE events
- [ ] a single create-and-stream API exists for new root posts
- [ ] the frontend uses the new streaming creation path for root posts
- [ ] TanStack Query is introduced for core chat server state without regressing the UX
- [ ] SSE updates patch query caches or equivalent shared state coherently
- [ ] unit/integration/E2E coverage exists for optimistic and reconciliation behavior
- [ ] `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, and `pnpm test:smoke` pass

## Out Of Scope

- changing the underlying model/provider
- introducing WebSockets
- full global observability pipeline
- redesigning settings/search/admin surfaces as part of this task
- fully converting every existing web state slice to TanStack Query in one pass

## Recommended Sequencing

1. instrumentation
2. immediate optimistic UX improvements on the existing transport
3. new create-and-stream backend contract
4. frontend adoption of create-and-stream
5. TanStack Query foundation
6. migrate core chat state to Query
7. SSE/query reconciliation hardening
8. final verification

---

## Phase 1: Instrument The Current Latency Path

### Task 13.1: Add client-side chat timing instrumentation

**Files**
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/src/chatTimings.ts`
- Test: `packages/web/src/chatTimings.test.ts`

**Intent**
Measure the current end-to-end path without relying on guesswork.

**Metrics to capture**

For new root posts:
- `post_submit_clicked`
- `post_create_response_received`
- `post_thread_visible`
- `post_stream_ack_received`
- `post_first_token_received`
- `post_message_saved`
- `post_done`

For replies:
- `reply_submit_clicked`
- `reply_stream_ack_received`
- `reply_first_token_received`
- `reply_message_saved`
- `reply_done`

**Implementation notes**
- use a lightweight utility, not a global analytics dependency
- start with `performance.now()`-based marks plus console/dev logging behind a small helper
- do not couple this to UI rendering logic directly

**TDD steps**
1. Write unit tests for a timing helper that can:
   - start a flow
   - record marks
   - compute deltas
   - no-op safely when incomplete
2. Run the test and confirm failure.
3. Implement `chatTimings.ts`.
4. Wire timing marks into `handleCreatePost()`, `handleReplyInThread()`, and `runThreadStream()`.
5. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/chatTimings.test.ts
```

**Commit suggestion**
```bash
git commit -m "perf: add chat latency timing instrumentation"
```

### Task 13.2: Add backend timing spans for chat hot paths

**Files**
- Modify: `packages/platform/src/services/chat.ts`
- Test: `packages/platform/test/unit/chat-service.test.ts`

**Intent**
Measure where the backend time is going before changing contracts.

**Timing boundaries**
- `load_project_context`
- `get_channel_or_thread`
- `create_thread_and_root_message`
- `resolve_mindspace`
- `get_memory_store`
- `list_thread_messages_for_context`
- `agent_stream_start`
- `first_token_seen` if capturable
- `message_persisted`

**Implementation notes**
- start with structured logging or a small timing collector local to the service
- avoid invasive global tracing work in this phase

**TDD steps**
1. Extend an existing unit test or add a focused one proving the timing helper emits named phases in order.
2. Run failing test.
3. Implement minimal instrumentation.
4. Re-run the test.

**Run**
```bash
pnpm test:unit -- --run packages/platform/test/unit/chat-service.test.ts
```

**Commit suggestion**
```bash
git commit -m "perf: add backend chat timing spans"
```

---

## Phase 2: Remove The Current UI Waits On Existing Transport

### Task 13.3: Add optimistic feed-thread insertion for new root posts

**Files**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/ChannelFeed.tsx`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Make the new thread card appear immediately after submit, not after the create request returns.

**Required behavior**
- on submit:
  - insert an optimistic feed card at the top
  - include the user’s root message text immediately
  - mark it as pending/optimistic
- on real create response:
  - reconcile the optimistic thread id/root message id with the real values
- on failure:
  - remove or visibly fail the optimistic card

**Important rule**
- the optimistic feed card must have a stable client-generated temp id so later reconciliation is precise

**TDD steps**
1. Add a failing frontend test:
   - submit a new post
   - assert the feed card appears before the `createChannelPost()` promise resolves
2. Add a failing test for reconciliation:
   - temp card replaced/updated by real response
3. Add a failing test for create failure:
   - optimistic card is removed or marked failed
4. Implement the minimal optimistic feed logic.
5. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: add optimistic feed insertion for new posts"
```

### Task 13.4: Open the new thread optimistically without blocking on `handleOpenThread()`

**Files**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/ThreadDrawer.tsx`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Avoid the extra blocking thread-open fetch before stream start.

**Required behavior**
- after the post is submitted, open the thread drawer immediately using:
  - optimistic thread id
  - the user’s root message as the initial thread message
- when the real create response arrives:
  - reconcile temp ids and metadata
- do not block on `getChannelThread()` before starting the stream

**TDD steps**
1. Add a failing test that proves:
   - the thread drawer opens immediately on submit
   - the user message is visible before `getChannelThread()` resolves
2. Add a failing test that `runThreadStream()` begins without waiting for `handleOpenThread()`.
3. Implement the optimistic thread-open flow.
4. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: open new threads optimistically before stream start"
```

### Task 13.5: Show assistant placeholder on `ack`

**Files**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/ThreadDrawer.tsx`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Reduce perceived idle time between submit and first token.

**Required behavior**
- on stream `ack` for a new root post or reply:
  - show an assistant placeholder row/spinner immediately
- as tokens arrive:
  - populate the placeholder text progressively
- on `message_saved`:
  - replace or reconcile placeholder with the canonical assistant message
- on stream interruption:
  - leave a failed/interrupted state consistent with existing error UI

**TDD steps**
1. Add a failing test that verifies assistant placeholder appears on `ack`.
2. Add a failing test that verifies `message_saved` replaces/reconciles the placeholder.
3. Implement the placeholder behavior.
4. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: show assistant placeholder at stream ack"
```

---

## Phase 3: Introduce A Single Create-And-Stream Contract

### Task 13.6: Add backend create-and-stream service for root posts

**Files**
- Modify: `packages/platform/src/services/chat.ts`
- Test: `packages/platform/test/integration/stream-channel-reply.integration.test.ts`
- Test: `packages/platform/test/unit/chat-service.test.ts`

**Intent**
Make the long-term optimal path available: create thread + root message + stream assistant reply in one operation.

**Recommended service**

```ts
export async function* createChannelPostAndStreamForPrincipal(...)
```

**Recommended event contract**
- `thread_created`
- `ack`
- `token`
- `message_saved`
- `thread_updated`
- `done`
- `error`

**Implementation notes**
- reuse existing `createChannelPostForPrincipal()` and `streamChannelReplyForPrincipal()` internals where sensible
- avoid duplicating business rules
- ensure `thread_created` is emitted before the AI stream starts
- keep the old endpoints during migration

**TDD steps**
1. Add a failing integration test that:
   - calls the new create-and-stream path
   - receives `thread_created` before `ack`
   - gets final persisted assistant message events
2. Add a unit test for emitted event ordering if helpful.
3. Implement minimal shared service logic.
4. Re-run tests.

**Run**
```bash
pnpm test:integration -- --run packages/platform/test/integration/stream-channel-reply.integration.test.ts
```

**Commit suggestion**
```bash
git commit -m "feat: add create-and-stream service for root posts"
```

### Task 13.7: Expose create-and-stream route from app and worker

**Files**
- Modify: `packages/app/src/server/factory.ts`
- Modify: `packages/worker/src/index.ts`
- Test: `packages/app/test/integration/authenticated-routes.integration.test.ts`
- Test: `packages/worker/test/live/channel-creation.e2e.test.ts`

**Route**

```text
POST /api/projects/:projectId/channels/:channelId/posts/stream
```

**Request body**

```json
{
  "message": "..."
}
```

**Response**
- SSE stream using the event contract above

**TDD steps**
1. Add failing app route test for authenticated shape.
2. Add failing worker E2E for the live event sequence.
3. Implement the route wiring.
4. Re-run tests.

**Run**
```bash
pnpm test:integration -- --run packages/app/test/integration/authenticated-routes.integration.test.ts
pnpm test:e2e -- --run packages/worker/test/live/channel-creation.e2e.test.ts
```

**Commit suggestion**
```bash
git commit -m "feat: add root post create-and-stream route"
```

### Task 13.8: Migrate root-post frontend flow to the new streaming route

**Files**
- Modify: `packages/web/src/api.ts`
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/api.test.ts`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Use the new transport for root posts so the product no longer does:

```text
create post -> open thread -> stream
```

**Required behavior**
- replace root-post path with:
  - `createChannelPostAndStream(...)`
- thread card/thread drawer should use `thread_created` event as the canonical server confirmation
- reply-in-thread path can continue using existing `messages/stream` for now

**TDD steps**
1. Add failing API test for the new SSE endpoint.
2. Add failing App test proving the old `createChannelPost + handleOpenThread + streamThreadReply` sequence is no longer used for root posts.
3. Implement the new API helper and root-post flow.
4. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/api.test.ts packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: switch root posts to create-and-stream flow"
```

---

## Phase 4: Introduce TanStack Query

### Task 13.9: Add TanStack Query foundation

**Files**
- Modify: `packages/web/package.json`
- Modify: `packages/web/src/main.tsx`
- Create: `packages/web/src/queryClient.ts`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Introduce the query cache foundation cleanly before migrating chat state.

**Required dependency**
- `@tanstack/react-query`

**Implementation notes**
- add a single `QueryClientProvider` at app root
- configure sane defaults:
  - avoid aggressive automatic refetching during mutation-heavy chat flows
  - keep retry conservative for chat mutations

**TDD steps**
1. Add a failing render test that requires Query context.
2. Add Query provider and client.
3. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "chore: add TanStack Query foundation to web app"
```

### Task 13.10: Migrate core chat reads to TanStack Query

**Files**
- Create: `packages/web/src/queries/chatQueries.ts`
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx`

**Scope**
- channels
- feed
- thread detail

**Intent**
Move the most latency-sensitive chat reads out of bespoke `useState + useEffect` orchestration.

**Implementation notes**
- keep query keys explicit, e.g.:
  - `['projects', projectId, 'channels']`
  - `['projects', projectId, 'channels', channelId, 'feed']`
  - `['projects', projectId, 'channels', channelId, 'threads', threadId]`
- do not migrate settings/search/admin in this task unless it becomes trivial

**TDD steps**
1. Add failing tests that still expect current visible behavior.
2. Swap the underlying data path to query hooks without changing UX.
3. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "refactor: move core chat reads to TanStack Query"
```

### Task 13.11: Move optimistic post/reply mutations onto Query cache

**Files**
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/src/mutations/chatMutations.ts`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Replace ad hoc optimistic state mutation with cache-driven optimistic updates.

**Required behavior**
- optimistic feed insert writes to the feed query cache
- optimistic thread open/message writes to the thread query cache
- rollback behavior on failure is centralized in mutation handlers

**TDD steps**
1. Add failing tests for optimistic cache-driven behavior.
2. Implement chat mutations with Query cache updates.
3. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: move optimistic chat mutations onto query cache"
```

---

## Phase 5: Reconcile SSE With Query Cache

### Task 13.12: Patch TanStack Query caches from channel SSE events

**Files**
- Modify: `packages/web/src/useChannelEvents.ts`
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/src/channelEventReconciler.ts`
- Test: `packages/web/src/useChannelEvents.test.ts`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Make SSE events the reconciliation mechanism for canonical server state.

**Required behavior**
- `new_thread` patches feed cache
- `new_message` patches thread cache when relevant
- `thread_updated` updates feed/thread metadata
- `mind_streaming` patches the streaming-indicator state

**Implementation notes**
- keep local ephemeral UI state only for truly ephemeral concerns
- use a small reconciler helper rather than baking cache patch logic directly into `App.tsx`

**TDD steps**
1. Add failing tests for cache patching on each event type.
2. Implement the reconciler and hook wiring.
3. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/useChannelEvents.test.ts packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: reconcile chat query caches from SSE events"
```

---

## Phase 6: Verification

### Task 13.13: Focused verification

**Run**
```bash
pnpm exec vitest run \
  packages/web/src/chatTimings.test.ts \
  packages/web/src/api.test.ts \
  packages/web/src/lastProject.test.ts \
  packages/web/src/PostAuthRouter.test.tsx \
  packages/web/src/App.test.tsx \
  packages/web/src/useChannelEvents.test.ts

pnpm test:unit -- --run \
  packages/platform/test/unit/chat-service.test.ts \
  packages/platform/test/unit/session-bootstrap.test.ts

pnpm test:integration -- --run \
  packages/platform/test/integration/stream-channel-reply.integration.test.ts \
  packages/app/test/integration/authenticated-routes.integration.test.ts

pnpm test:e2e -- --run \
  packages/worker/test/live/auth.e2e.test.ts \
  packages/worker/test/live/channel-creation.e2e.test.ts
```

### Task 13.14: Full verification

**Run**
```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:smoke
git diff --check
```

### Task 13.15: Manual acceptance checks

Use the local frontend against the deployed or local worker and confirm:

1. new thread card appears immediately on submit
2. thread drawer opens immediately with user root message visible
3. assistant placeholder appears on `ack`
4. first token arrives without the old double-wait feeling
5. failed create and failed stream cases reconcile cleanly
6. switching channels/projects does not duplicate optimistic or reconciled entries

---

## Risks And Mitigations

### Risk: optimistic thread/feed state diverges from canonical backend state
Mitigation:
- use stable client temp ids
- reconcile on real create response / `thread_created`
- patch from SSE
- add rollback/failure tests

### Risk: TanStack Query migration creates a second state system
Mitigation:
- migrate core chat state in discrete slices
- do not keep long-term duplicated source-of-truth state in `App.tsx`
- move cache patching into helpers

### Risk: create-and-stream duplicates existing logic and drifts
Mitigation:
- share internals in `chat.ts`
- treat old endpoints as compatibility paths until migration completes

### Risk: first-token latency remains high after UI fixes
Mitigation:
- instrumentation lands first
- use measurements to decide whether deeper backend caching or context reuse is warranted

---

## Long-Term End State

The target experience is:

```text
submit root post
  -> optimistic feed card immediately
  -> optimistic thread drawer opens immediately
  -> server emits thread_created quickly
  -> assistant placeholder appears on ack
  -> tokens stream
  -> message_saved/thread_updated reconcile canonical state
```

Reply-in-thread should follow the same principle:

```text
submit reply
  -> optimistic user message immediately
  -> assistant placeholder on ack
  -> tokens stream
  -> final message reconciles cleanly
```

## Recommended Commit Sequence

1. `perf: add chat latency instrumentation`
2. `feat: add optimistic feed insertion for new posts`
3. `feat: open new threads optimistically before stream start`
4. `feat: show assistant placeholder at stream ack`
5. `feat: add create-and-stream service for root posts`
6. `feat: add root post create-and-stream route`
7. `feat: switch root posts to create-and-stream flow`
8. `chore: add TanStack Query foundation to web app`
9. `refactor: move core chat reads to TanStack Query`
10. `feat: move optimistic chat mutations onto query cache`
11. `feat: reconcile chat query caches from SSE events`

## Final Handoff Summary

This plan deliberately separates:

1. **measurement**
2. **perceived-latency UX fixes**
3. **transport optimization**
4. **state-management modernization**

That ordering matters. TanStack Query is recommended and included, but it is not treated as a magic fix for structural latency. The new create-and-stream transport plus optimistic UI is the core product-speed improvement; TanStack Query is the maintainability and correctness layer that makes that architecture durable.
