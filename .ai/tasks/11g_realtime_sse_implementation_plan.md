# ABOUTME: Implementation plan for Phase 11g — Real-Time SSE Updates for channel-level events
# ABOUTME: Covers backend SSE endpoint, frontend EventSource hook, and integration with channel feed/thread state

# Phase 11g: Real-Time SSE Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-24
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: Phase 11a (Foundation) provides: working router, auth state, layout shell. Existing streaming infrastructure (`streamChannelReplyForPrincipal`, `createSseResponse`) in the worker. Channel and thread CRUD endpoints are fully operational.

**Goal:** Add a persistent SSE connection per active channel that pushes real-time events (new threads, new messages, thread metadata updates, mind streaming status) to connected clients. This eliminates the need for polling and enables multi-user awareness of channel activity.

**Architecture:** The backend exposes a `GET /api/projects/:projectId/channels/:channelId/events` endpoint that returns a `text/event-stream` response. The worker holds the SSE connection open and emits events as they occur. On the frontend, a React hook manages the `EventSource` lifecycle: opening a connection when a channel is selected, closing it on channel switch or unmount, and dispatching received events into existing React state (feed posts, thread messages). The browser's native `EventSource` API handles automatic reconnection.

**Tech Stack:** Hono + Cloudflare Workers (backend SSE), React 19 + Vite 8 (frontend), Vitest + @testing-library/react (tests), `@mastra-mindspace/ui` design system, native `EventSource` API.

---

## Current State Summary

The backend already streams SSE for agent responses via `POST .../messages/stream` (see `packages/worker/src/index.ts` lines 489-533 and `packages/platform/src/services/chat.ts` lines 515-621). The `createSseResponse` helper (worker `index.ts` lines 113-146) wraps an `AsyncIterable<StreamEvent>` into a proper SSE `Response`. The frontend consumes this POST-based stream via `fetch` + `ReadableStream` reader in `packages/web/src/api.ts` (`streamThreadReply`, lines 237-301).

Channel-level real-time updates do not exist yet. The feed and thread views are fetched once and only update when the user explicitly triggers an action (create post, reply, etc.).

### Key gaps between current and target

| Area | Current | Target |
|------|---------|--------|
| Channel event stream | No endpoint | `GET /api/projects/:projectId/channels/:channelId/events` SSE |
| Event types | Only agent streaming events (`ack`, `token`, `message_saved`, `thread_updated`, `done`) | Channel-level: `new_thread`, `new_message`, `thread_updated`, `mind_streaming` |
| Frontend SSE | Manual `fetch` + `ReadableStream` for POST streams | `EventSource` API for GET-based persistent connections |
| Multi-user updates | None — only the acting user sees changes | All connected clients receive events |
| Reconnection | None (POST streams are one-shot) | Automatic via `EventSource` built-in retry |
| Channel switch | N/A | Close old connection, open new one |

### Existing SSE infrastructure to reuse

- **`createSseResponse`** (`packages/worker/src/index.ts` line 113): Wraps `AsyncIterable<StreamEvent>` into an SSE Response with correct headers. Can be reused for the new endpoint.
- **`ChatStreamEvent` type** (`packages/platform/src/services/chat.ts` line 66): Defines the `{ event, data }` shape. The new channel events follow the same shape.
- **`parseEventBlock`** (`packages/web/src/api.ts` line 126): Parses SSE text blocks into `{ event, data }`. Not needed for `EventSource` (browser parses natively), but useful for understanding the format.
- **Auth middleware** (`packages/worker/src/index.ts` line 162): All `/api/*` routes already require Bearer token auth. The SSE endpoint will need to accept auth differently since `EventSource` does not support custom headers (see Open Questions).

---

## Success Criteria

- [ ] `GET /api/projects/:projectId/channels/:channelId/events` returns `text/event-stream` with a keep-alive heartbeat
- [ ] Backend emits `new_thread` event when a post is created in the channel
- [ ] Backend emits `new_message` event when a reply is added to a thread
- [ ] Backend emits `thread_updated` event when thread metadata changes (lastMessageAt, replyCount)
- [ ] Backend emits `mind_streaming` event with `status: "started"` and `status: "done"` during agent streaming
- [ ] Frontend opens one `EventSource` connection per active channel
- [ ] On channel switch, the old connection closes and a new one opens
- [ ] `new_thread` events prepend to the feed post list without a full refetch
- [ ] `new_message` events append to the thread message list when the thread is open
- [ ] `thread_updated` events update the feed post's `lastMessageAt` and `replyCount`
- [ ] `mind_streaming` events display a streaming indicator on the relevant thread
- [ ] Connection automatically reconnects on drop (via `EventSource` retry)
- [ ] Heartbeat events (`event: heartbeat`) are sent every 30 seconds to keep the connection alive
- [ ] Auth token is passed via query parameter since `EventSource` does not support custom headers
- [ ] All existing tests continue to pass
- [ ] New tests cover SSE hook lifecycle, event dispatching, and backend event emission
- [ ] `pnpm typecheck` passes across all packages

---

## Recommended Sequencing

Execute these tasks in order. Each task is independently committable.

1. **Task 1: Channel event types** — Shared types for channel SSE events
2. **Task 2: Channel event emitter service** — Backend service that yields channel events
3. **Task 3: SSE endpoint route** — Wire the Hono GET route with auth-via-query-param
4. **Task 4: Emit events from mutation endpoints** — Integrate event emission into post/reply/stream flows
5. **Task 5: Frontend EventSource hook** — `useChannelEvents` React hook managing SSE lifecycle
6. **Task 6: Wire hook into App state** — Connect SSE events to feed/thread state updates
7. **Task 7: Mind streaming indicator** — Visual indicator when a mind is actively streaming
8. **Task 8: Integration tests** — End-to-end SSE behavior tests

---

## Task 1: Channel Event Types

### Goal
Define shared TypeScript types for channel SSE events used by both backend and frontend. These types define the event names and their payload shapes.

### TDD Steps

1. Write a test that imports the types and asserts the event name union
2. Run test — fails (file doesn't exist)
3. Create the types file
4. Run test — passes

### Files

**Create:** `packages/platform/src/services/channel-events.ts`
**Create:** `packages/web/src/channel-events.ts`

### Test: inline type assertion test in a temporary test file

Since these are pure types, the test validates that the type definitions exist and the event name literals are correct.

**Create:** `packages/platform/src/services/channel-events.test.ts`

```typescript
// ABOUTME: Tests that channel event types are correctly defined
// ABOUTME: Guards against accidental changes to the event contract

import { describe, expect, it } from 'vitest';

import type { ChannelEvent, ChannelEventType } from './channel-events';

describe('channel event types', () => {
  it('defines the expected event type names', () => {
    const validTypes: ChannelEventType[] = [
      'new_thread',
      'new_message',
      'thread_updated',
      'mind_streaming',
      'heartbeat',
    ];

    expect(validTypes).toHaveLength(5);
  });

  it('defines new_thread event with thread and rootMessage fields', () => {
    const event: ChannelEvent = {
      event: 'new_thread',
      data: {
        thread: {
          id: 'thread-1',
          channelId: 'ch-1',
          title: null,
          lastMessageAt: null,
          createdAt: '2026-04-23T00:00:00.000Z',
          updatedAt: '2026-04-23T00:00:00.000Z',
        },
        rootMessage: {
          id: 'msg-1',
          role: 'user',
          text: 'Hello world',
          createdAt: '2026-04-23T00:00:00.000Z',
        },
      },
    };

    expect(event.event).toBe('new_thread');
    expect(event.data.thread).toBeDefined();
    expect(event.data.rootMessage).toBeDefined();
  });

  it('defines new_message event with threadId and message fields', () => {
    const event: ChannelEvent = {
      event: 'new_message',
      data: {
        threadId: 'thread-1',
        message: {
          id: 'msg-2',
          role: 'assistant',
          text: 'Hi there',
          createdAt: '2026-04-23T00:00:00.000Z',
        },
      },
    };

    expect(event.event).toBe('new_message');
    expect(event.data.threadId).toBe('thread-1');
  });

  it('defines thread_updated event with metadata fields', () => {
    const event: ChannelEvent = {
      event: 'thread_updated',
      data: {
        threadId: 'thread-1',
        lastMessageAt: '2026-04-23T00:00:00.000Z',
        replyCount: 3,
      },
    };

    expect(event.event).toBe('thread_updated');
  });

  it('defines mind_streaming event with status field', () => {
    const started: ChannelEvent = {
      event: 'mind_streaming',
      data: {
        threadId: 'thread-1',
        mindName: 'Claude',
        status: 'started',
      },
    };

    const done: ChannelEvent = {
      event: 'mind_streaming',
      data: {
        threadId: 'thread-1',
        mindName: 'Claude',
        status: 'done',
      },
    };

    expect(started.data.status).toBe('started');
    expect(done.data.status).toBe('done');
  });

  it('defines heartbeat event with empty data', () => {
    const event: ChannelEvent = {
      event: 'heartbeat',
      data: {},
    };

    expect(event.event).toBe('heartbeat');
  });
});
```

### Implementation: `packages/platform/src/services/channel-events.ts`

```typescript
// ABOUTME: Shared types for channel-level Server-Sent Events
// ABOUTME: Defines the event contract between backend emitters and frontend consumers

import type { ChatThreadSummary, ChatMessageRecord } from './chat';

export type ChannelEventType =
  | 'new_thread'
  | 'new_message'
  | 'thread_updated'
  | 'mind_streaming'
  | 'heartbeat';

export type NewThreadEventData = {
  thread: ChatThreadSummary;
  rootMessage: ChatMessageRecord;
};

export type NewMessageEventData = {
  threadId: string;
  message: ChatMessageRecord;
};

export type ThreadUpdatedEventData = {
  threadId: string;
  lastMessageAt: string;
  replyCount: number;
};

export type MindStreamingEventData = {
  threadId: string;
  mindName: string;
  status: 'started' | 'done';
};

export type HeartbeatEventData = Record<string, never>;

export type ChannelEventMap = {
  new_thread: NewThreadEventData;
  new_message: NewMessageEventData;
  thread_updated: ThreadUpdatedEventData;
  mind_streaming: MindStreamingEventData;
  heartbeat: HeartbeatEventData;
};

export type ChannelEvent = {
  [K in ChannelEventType]: {
    event: K;
    data: ChannelEventMap[K];
  };
}[ChannelEventType];
```

### Frontend mirror: `packages/web/src/channel-events.ts`

```typescript
// ABOUTME: Frontend types for channel-level Server-Sent Events
// ABOUTME: Mirrors the backend contract for type-safe event handling

import type { ThreadSummary, ThreadMessage } from './api';

export type ChannelEventType =
  | 'new_thread'
  | 'new_message'
  | 'thread_updated'
  | 'mind_streaming'
  | 'heartbeat';

export type NewThreadEventData = {
  thread: ThreadSummary;
  rootMessage: ThreadMessage;
};

export type NewMessageEventData = {
  threadId: string;
  message: ThreadMessage;
};

export type ThreadUpdatedEventData = {
  threadId: string;
  lastMessageAt: string;
  replyCount: number;
};

export type MindStreamingEventData = {
  threadId: string;
  mindName: string;
  status: 'started' | 'done';
};

export type ChannelEventMap = {
  new_thread: NewThreadEventData;
  new_message: NewMessageEventData;
  thread_updated: ThreadUpdatedEventData;
  mind_streaming: MindStreamingEventData;
  heartbeat: Record<string, never>;
};

export type ChannelEvent = {
  [K in ChannelEventType]: {
    event: K;
    data: ChannelEventMap[K];
  };
}[ChannelEventType];
```

### Export from platform index

Add to `packages/platform/src/index.ts`:
```typescript
export * from './services/channel-events';
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/platform/src/services/channel-events.test.ts
```

---

## Task 2: Channel Event Emitter Service

### Goal
Create a backend service that manages per-channel event broadcast. The emitter holds a set of subscriber callbacks per channel. When a mutation occurs (post created, message sent, stream started), the caller pushes an event to the emitter, which fans it out to all connected subscribers for that channel.

### Design constraint — stateless workers
Cloudflare Workers are stateless: each request may land on a different isolate. An in-memory event emitter only broadcasts to subscribers connected to the same isolate. For v1, this means a user will only see real-time updates for actions that happen within their own isolate (i.e., their own actions and any concurrent requests hitting the same isolate). Cross-isolate broadcast requires Durable Objects or an external pub/sub (out of scope per design doc).

This is acceptable for v1 because:
- The primary use case is seeing your own actions reflected instantly (without refetch)
- Multi-user real-time across isolates is a future enhancement
- The heartbeat keeps the connection alive regardless

### TDD Steps

1. Write a test that subscribes to a channel, emits an event, and verifies the subscriber receives it
2. Run test — fails (service doesn't exist)
3. Implement the emitter
4. Run test — passes

### Files

**Create:** `packages/platform/src/services/channel-event-emitter.ts`
**Create:** `packages/platform/src/services/channel-event-emitter.test.ts`

### Test: `packages/platform/src/services/channel-event-emitter.test.ts`

```typescript
// ABOUTME: Tests for the channel event emitter service
// ABOUTME: Verifies subscribe/unsubscribe and event fan-out to listeners

import { describe, expect, it, vi } from 'vitest';

import type { ChannelEvent } from './channel-events';
import { ChannelEventEmitter } from './channel-event-emitter';

describe('ChannelEventEmitter', () => {
  it('delivers events to subscribers of a specific channel', () => {
    const emitter = new ChannelEventEmitter();
    const listener = vi.fn();

    emitter.subscribe('ch-1', listener);

    const event: ChannelEvent = {
      event: 'new_thread',
      data: {
        thread: {
          id: 'thread-1',
          channelId: 'ch-1',
          title: null,
          lastMessageAt: null,
          createdAt: '2026-04-23T00:00:00.000Z',
          updatedAt: '2026-04-23T00:00:00.000Z',
        },
        rootMessage: {
          id: 'msg-1',
          role: 'user',
          text: 'Hello',
          createdAt: '2026-04-23T00:00:00.000Z',
        },
      },
    };

    emitter.emit('ch-1', event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('does not deliver events to subscribers of a different channel', () => {
    const emitter = new ChannelEventEmitter();
    const listener = vi.fn();

    emitter.subscribe('ch-2', listener);

    emitter.emit('ch-1', {
      event: 'heartbeat',
      data: {},
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple subscribers per channel', () => {
    const emitter = new ChannelEventEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.subscribe('ch-1', listener1);
    emitter.subscribe('ch-1', listener2);

    const event: ChannelEvent = {
      event: 'heartbeat',
      data: {},
    };

    emitter.emit('ch-1', event);

    expect(listener1).toHaveBeenCalledWith(event);
    expect(listener2).toHaveBeenCalledWith(event);
  });

  it('stops delivering events after unsubscribe', () => {
    const emitter = new ChannelEventEmitter();
    const listener = vi.fn();

    const unsubscribe = emitter.subscribe('ch-1', listener);
    unsubscribe();

    emitter.emit('ch-1', {
      event: 'heartbeat',
      data: {},
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('removes the channel entry when the last subscriber unsubscribes', () => {
    const emitter = new ChannelEventEmitter();
    const listener = vi.fn();

    const unsubscribe = emitter.subscribe('ch-1', listener);
    unsubscribe();

    expect(emitter.subscriberCount('ch-1')).toBe(0);
  });

  it('returns the correct subscriber count', () => {
    const emitter = new ChannelEventEmitter();

    const unsub1 = emitter.subscribe('ch-1', vi.fn());
    emitter.subscribe('ch-1', vi.fn());

    expect(emitter.subscriberCount('ch-1')).toBe(2);

    unsub1();

    expect(emitter.subscriberCount('ch-1')).toBe(1);
  });
});
```

### Implementation: `packages/platform/src/services/channel-event-emitter.ts`

```typescript
// ABOUTME: In-memory event fan-out for channel-level SSE subscribers
// ABOUTME: Scoped to a single worker isolate — cross-isolate broadcast requires external pub/sub

import type { ChannelEvent } from './channel-events';

export type ChannelEventListener = (event: ChannelEvent) => void;

export class ChannelEventEmitter {
  private channels = new Map<string, Set<ChannelEventListener>>();

  subscribe(channelId: string, listener: ChannelEventListener): () => void {
    let listeners = this.channels.get(channelId);

    if (!listeners) {
      listeners = new Set();
      this.channels.set(channelId, listeners);
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.channels.delete(channelId);
      }
    };
  }

  emit(channelId: string, event: ChannelEvent): void {
    const listeners = this.channels.get(channelId);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  subscriberCount(channelId: string): number {
    return this.channels.get(channelId)?.size ?? 0;
  }
}
```

### Export from platform index

Add to `packages/platform/src/index.ts`:
```typescript
export * from './services/channel-event-emitter';
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/platform/src/services/channel-event-emitter.test.ts
```

---

## Task 3: SSE Endpoint Route

### Goal
Wire the `GET /api/projects/:projectId/channels/:channelId/events` Hono route. This route authenticates the caller (via query parameter token since `EventSource` cannot set headers), subscribes to the channel emitter, and streams events as SSE.

### Auth via query parameter
The browser `EventSource` API does not support custom headers. The standard workaround is to pass the auth token as a query parameter: `?token=<firebase-id-token>`. The endpoint validates this token the same way the auth middleware does. This is safe because:
- The token is short-lived (Firebase ID tokens expire in 1 hour)
- The connection is over HTTPS
- The token is not logged by the worker

### TDD Steps

1. Write an integration test that creates an SSE connection and receives a heartbeat
2. Run test — fails (route doesn't exist)
3. Add the route to the worker
4. Run test — passes

### Files

**Modify:** `packages/worker/src/index.ts` — add the GET events route
**Modify:** `packages/platform/src/platform-deps.ts` — add `channelEventEmitter` to deps (if not already a singleton)

### Implementation notes for the route in `packages/worker/src/index.ts`

The route should be added after the existing channel routes (around line 435) and before the thread routes:

```typescript
app.get('/api/projects/:projectId/channels/:channelId/events', async (c) => {
  // Auth via query param (EventSource cannot set headers)
  const token = c.req.query('token');

  if (!token) {
    return c.json({ error: 'Missing token query parameter' }, 401);
  }

  const tokenVerifier = createFirebaseTokenVerifier({
    projectId: c.env.FIREBASE_PROJECT_ID,
  });

  let principal: Principal;

  try {
    const decoded = await tokenVerifier.verifyIdToken(token);
    principal = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
    };
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const projectId = c.req.param('projectId');
  const channelId = c.req.param('channelId');
  const emitter = c.get('channelEventEmitter');

  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        // Send initial connection event
        controller.enqueue(
          encoder.encode(`event: connected\ndata: ${JSON.stringify({ channelId })}\n\n`),
        );

        // Subscribe to channel events
        const unsubscribe = emitter.subscribe(channelId, (event) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`),
            );
          } catch {
            // Controller closed, unsubscribe handled in cancel
          }
        });

        // Heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(
              encoder.encode(`event: heartbeat\ndata: {}\n\n`),
            );
          } catch {
            clearInterval(heartbeatInterval);
          }
        }, 30_000);

        // Store cleanup references on the controller for cancel
        (controller as any).__cleanup = () => {
          unsubscribe();
          clearInterval(heartbeatInterval);
        };
      },
      cancel(controller) {
        (controller as any).__cleanup?.();
      },
    }),
    {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    },
  );
});
```

### Worker boot changes

The `ChannelEventEmitter` needs to be instantiated per-request in the worker boot (or as a module-level singleton — see Open Questions). Since Cloudflare Workers reset state between requests for different isolates, a per-request instance only enables intra-request fan-out.

For v1, create the emitter in `bootRequest` and add it to the Hono context:

In `packages/worker/src/index.ts`, update the `HonoEnv` type:

```typescript
import { ChannelEventEmitter } from '@mastra-mindspace/platform';

type HonoEnv = {
  Bindings: Env;
  Variables: {
    principal: Principal;
    mastra: ReturnType<typeof createMastra>;
    mindspaceFactory: MindspaceFactory;
    channelEventEmitter: ChannelEventEmitter;
  };
};
```

Update `bootRequest` to return the emitter:

```typescript
function bootRequest(env: Env) {
  // ... existing code ...
  const channelEventEmitter = new ChannelEventEmitter();

  return { mastra, mindspaceFactory, channelEventEmitter };
}
```

Update the middleware to set it:

```typescript
app.use('*', async (c, next) => {
  const deps = bootRequest(c.env);
  c.set('mastra', deps.mastra);
  c.set('mindspaceFactory', deps.mindspaceFactory);
  c.set('channelEventEmitter', deps.channelEventEmitter);
  await next();
});
```

### Important: Module-level singleton consideration

A per-request `ChannelEventEmitter` means the SSE endpoint and the mutation endpoints must share the same emitter instance within a single request lifecycle. However, SSE connections are long-lived while mutation requests are separate HTTP requests. Within a single Cloudflare Workers isolate, the module scope persists across requests. Therefore, the emitter should be a **module-level singleton** instead of per-request:

```typescript
const globalEmitter = new ChannelEventEmitter();
```

Set it in the middleware without re-creating it:

```typescript
app.use('*', async (c, next) => {
  const deps = bootRequest(c.env);
  c.set('mastra', deps.mastra);
  c.set('mindspaceFactory', deps.mindspaceFactory);
  c.set('channelEventEmitter', globalEmitter);
  await next();
});
```

This is the correct pattern. The SSE GET request opens and subscribes. A subsequent POST request (creating a post) in the same isolate emits to the same singleton, which fans out to the SSE subscriber's `ReadableStream`.

### Test: `packages/worker/test/smoke/channel-events.smoke.test.ts`

```typescript
// ABOUTME: Smoke test for the channel SSE events endpoint
// ABOUTME: Verifies the endpoint returns text/event-stream and sends a connected event

import { describe, it, expect } from 'vitest';

import { ChannelEventEmitter } from '@mastra-mindspace/platform';

describe('ChannelEventEmitter integration', () => {
  it('emitter delivers events across subscribe and emit calls', () => {
    const emitter = new ChannelEventEmitter();
    const received: unknown[] = [];

    emitter.subscribe('ch-test', (event) => {
      received.push(event);
    });

    emitter.emit('ch-test', {
      event: 'heartbeat',
      data: {},
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ event: 'heartbeat', data: {} });
  });
});
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/worker/test/smoke/channel-events.smoke.test.ts
```

---

## Task 4: Emit Events from Mutation Endpoints

### Goal
When a post is created, a reply is sent, or a stream completes, emit the corresponding channel event via the `ChannelEventEmitter`. This is the bridge between mutation actions and real-time push.

### TDD Steps

1. Write tests verifying that creating a post emits a `new_thread` event
2. Write tests verifying that streaming a reply emits `mind_streaming` and `new_message` events
3. Run tests — fail
4. Add event emission to the relevant route handlers
5. Run tests — pass

### Files

**Modify:** `packages/worker/src/index.ts` — emit events in POST routes

### Implementation changes

#### After `createChannelPost` (around line 423-435)

```typescript
app.post('/api/projects/:projectId/channels/:channelId/posts', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const emitter = c.get('channelEventEmitter');
  const body = await c.req.json<{ message?: string }>();
  const channelId = c.req.param('channelId');
  const result = await createChannelPostForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId,
    message: body.message ?? '',
  }, { mastra, mindspaceFactory });

  emitter.emit(channelId, {
    event: 'new_thread',
    data: {
      thread: result.thread,
      rootMessage: result.rootMessage,
    },
  });

  return c.json(result);
});
```

#### In the streaming reply handler (around line 489-533)

Wrap the existing stream to inject `mind_streaming` events and a `new_message` event:

```typescript
app.post('/api/projects/:projectId/channels/:channelId/threads/:threadId/messages/stream', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const emitter = c.get('channelEventEmitter');
  const body = await c.req.json<{ message?: string }>();
  const channelId = c.req.param('channelId');
  const threadId = c.req.param('threadId');

  const stream = await streamChannelReplyForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId,
    threadId,
    ...(typeof body.message === 'string' ? { message: body.message } : {}),
  }, { mastra, mindspaceFactory });

  // Wrap the stream to emit channel events alongside SSE output
  async function* wrappedStream() {
    let emittedStart = false;

    for await (const chunk of stream) {
      // Emit mind_streaming started on first token
      if (chunk.event === 'token' && !emittedStart) {
        emittedStart = true;
        emitter.emit(channelId, {
          event: 'mind_streaming',
          data: { threadId, mindName: 'Mind', status: 'started' },
        });
      }

      // Emit new_message when the assistant message is saved
      if (chunk.event === 'message_saved') {
        emitter.emit(channelId, {
          event: 'new_message',
          data: {
            threadId,
            message: {
              id: String(chunk.data.id ?? ''),
              role: String(chunk.data.role ?? 'assistant'),
              text: String(chunk.data.text ?? ''),
              createdAt: String(chunk.data.createdAt ?? new Date().toISOString()),
            },
          },
        });
      }

      // Emit thread_updated and mind_streaming done
      if (chunk.event === 'thread_updated') {
        emitter.emit(channelId, {
          event: 'thread_updated',
          data: {
            threadId,
            lastMessageAt: String(chunk.data.lastMessageAt ?? ''),
            replyCount: typeof chunk.data.replyCount === 'number' ? chunk.data.replyCount : 0,
          },
        });
      }

      if (chunk.event === 'done' && emittedStart) {
        emitter.emit(channelId, {
          event: 'mind_streaming',
          data: { threadId, mindName: 'Mind', status: 'done' },
        });
      }

      yield chunk;
    }
  }

  return createSseResponse(wrappedStream());
});
```

### Note on `replyCount`

The existing `streamChannelReplyForPrincipal` `thread_updated` event does not include `replyCount`. To get the correct reply count, we have two options:

1. **Query the thread's message count** after the stream completes (adds a DB call)
2. **Omit `replyCount` from the SSE event** and let the frontend increment locally

For v1, option 2 is simpler and avoids an extra DB round-trip. The frontend can increment `replyCount` by 1 when it receives a `new_message` event. The `thread_updated` channel event can set `replyCount` to `-1` as a sentinel meaning "unknown, increment locally."

**Decision needed from Remy:** Should we add a DB query for the actual reply count, or use local increment?

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/worker/src/index.test.ts
```

---

## Task 5: Frontend EventSource Hook

### Goal
Create a `useChannelEvents` React hook that opens an `EventSource` connection for the active channel, dispatches events to callback handlers, and cleans up on channel switch or unmount.

### Key behaviors
- Opens `EventSource` to `/api/projects/:projectId/channels/:channelId/events?token=<idToken>`
- Calls event-specific handlers when events arrive
- Closes the connection when `channelId` changes or the component unmounts
- Relies on `EventSource` built-in reconnection (the browser retries automatically)
- Refreshes the auth token before opening a connection (tokens expire in 1 hour)

### TDD Steps

1. Write tests using a mock `EventSource` (we're testing the hook logic, not the browser API)
2. Run tests — fail
3. Create the hook
4. Run tests — pass

### Files

**Create:** `packages/web/src/useChannelEvents.ts`
**Create:** `packages/web/src/useChannelEvents.test.ts`

### Test: `packages/web/src/useChannelEvents.test.ts`

```typescript
// ABOUTME: Tests for the useChannelEvents hook managing SSE lifecycle
// ABOUTME: Uses a mock EventSource to verify open/close/dispatch behavior

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useChannelEvents, type ChannelEventHandlers } from './useChannelEvents';

type MockEventSource = {
  url: string;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  readyState: number;
  listeners: Map<string, Set<(event: MessageEvent) => void>>;
  simulateEvent: (type: string, data: unknown) => void;
};

function createMockEventSourceClass() {
  const instances: MockEventSource[] = [];

  class FakeEventSource {
    url: string;
    close = vi.fn();
    readyState = 1; // OPEN
    listeners = new Map<string, Set<(event: MessageEvent) => void>>();

    constructor(url: string) {
      this.url = url;
      instances.push(this as unknown as MockEventSource);
    }

    addEventListener(type: string, handler: (event: MessageEvent) => void) {
      let set = this.listeners.get(type);
      if (!set) {
        set = new Set();
        this.listeners.set(type, set);
      }
      set.add(handler);
    }

    removeEventListener(type: string, handler: (event: MessageEvent) => void) {
      this.listeners.get(type)?.delete(handler);
    }

    simulateEvent(type: string, data: unknown) {
      const handlers = this.listeners.get(type);
      if (handlers) {
        const event = new MessageEvent(type, { data: JSON.stringify(data) });
        for (const handler of handlers) {
          handler(event);
        }
      }
    }
  }

  return { FakeEventSource, instances };
}

describe('useChannelEvents', () => {
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    cleanup();
  });

  it('opens an EventSource with the correct URL including token', async () => {
    const { FakeEventSource, instances } = createMockEventSourceClass();
    globalThis.EventSource = FakeEventSource as any;

    const user = { getIdToken: vi.fn().mockResolvedValue('test-token') };
    const handlers: ChannelEventHandlers = {};

    renderHook(() =>
      useChannelEvents({
        user,
        projectId: 'proj-1',
        channelId: 'ch-1',
        handlers,
      }),
    );

    // Wait for the async token fetch
    await act(async () => {});

    expect(instances).toHaveLength(1);
    expect(instances[0]!.url).toBe(
      '/api/projects/proj-1/channels/ch-1/events?token=test-token',
    );
  });

  it('closes the connection when channelId changes', async () => {
    const { FakeEventSource, instances } = createMockEventSourceClass();
    globalThis.EventSource = FakeEventSource as any;

    const user = { getIdToken: vi.fn().mockResolvedValue('test-token') };
    const handlers: ChannelEventHandlers = {};

    const { rerender } = renderHook(
      ({ channelId }) =>
        useChannelEvents({
          user,
          projectId: 'proj-1',
          channelId,
          handlers,
        }),
      { initialProps: { channelId: 'ch-1' } },
    );

    await act(async () => {});

    expect(instances).toHaveLength(1);
    const firstInstance = instances[0]!;

    rerender({ channelId: 'ch-2' });
    await act(async () => {});

    expect(firstInstance.close).toHaveBeenCalled();
    expect(instances).toHaveLength(2);
    expect(instances[1]!.url).toContain('ch-2');
  });

  it('closes the connection on unmount', async () => {
    const { FakeEventSource, instances } = createMockEventSourceClass();
    globalThis.EventSource = FakeEventSource as any;

    const user = { getIdToken: vi.fn().mockResolvedValue('test-token') };
    const handlers: ChannelEventHandlers = {};

    const { unmount } = renderHook(() =>
      useChannelEvents({
        user,
        projectId: 'proj-1',
        channelId: 'ch-1',
        handlers,
      }),
    );

    await act(async () => {});

    unmount();

    expect(instances[0]!.close).toHaveBeenCalled();
  });

  it('dispatches new_thread events to the onNewThread handler', async () => {
    const { FakeEventSource, instances } = createMockEventSourceClass();
    globalThis.EventSource = FakeEventSource as any;

    const user = { getIdToken: vi.fn().mockResolvedValue('test-token') };
    const onNewThread = vi.fn();
    const handlers: ChannelEventHandlers = { onNewThread };

    renderHook(() =>
      useChannelEvents({
        user,
        projectId: 'proj-1',
        channelId: 'ch-1',
        handlers,
      }),
    );

    await act(async () => {});

    const threadData = {
      thread: {
        id: 'thread-1',
        channelId: 'ch-1',
        title: null,
        lastMessageAt: null,
        createdAt: '2026-04-23T00:00:00.000Z',
        updatedAt: '2026-04-23T00:00:00.000Z',
      },
      rootMessage: {
        id: 'msg-1',
        role: 'user',
        text: 'Hello',
        createdAt: '2026-04-23T00:00:00.000Z',
      },
    };

    act(() => {
      instances[0]!.simulateEvent('new_thread', threadData);
    });

    expect(onNewThread).toHaveBeenCalledWith(threadData);
  });

  it('does not open a connection when channelId is empty', async () => {
    const { FakeEventSource, instances } = createMockEventSourceClass();
    globalThis.EventSource = FakeEventSource as any;

    const user = { getIdToken: vi.fn().mockResolvedValue('test-token') };
    const handlers: ChannelEventHandlers = {};

    renderHook(() =>
      useChannelEvents({
        user,
        projectId: 'proj-1',
        channelId: '',
        handlers,
      }),
    );

    await act(async () => {});

    expect(instances).toHaveLength(0);
  });

  it('does not open a connection when user is null', async () => {
    const { FakeEventSource, instances } = createMockEventSourceClass();
    globalThis.EventSource = FakeEventSource as any;

    const handlers: ChannelEventHandlers = {};

    renderHook(() =>
      useChannelEvents({
        user: null,
        projectId: 'proj-1',
        channelId: 'ch-1',
        handlers,
      }),
    );

    await act(async () => {});

    expect(instances).toHaveLength(0);
  });
});
```

### Implementation: `packages/web/src/useChannelEvents.ts`

```typescript
// ABOUTME: React hook managing an EventSource connection for channel-level SSE
// ABOUTME: Opens on channel select, closes on switch/unmount, dispatches to typed handlers

import { useEffect, useRef } from 'react';

import type {
  NewThreadEventData,
  NewMessageEventData,
  ThreadUpdatedEventData,
  MindStreamingEventData,
} from './channel-events';

type AuthUser = {
  getIdToken(): Promise<string>;
};

export type ChannelEventHandlers = {
  onNewThread?: (data: NewThreadEventData) => void;
  onNewMessage?: (data: NewMessageEventData) => void;
  onThreadUpdated?: (data: ThreadUpdatedEventData) => void;
  onMindStreaming?: (data: MindStreamingEventData) => void;
};

export type UseChannelEventsInput = {
  user: AuthUser | null;
  projectId: string;
  channelId: string;
  handlers: ChannelEventHandlers;
};

export function useChannelEvents({
  user,
  projectId,
  channelId,
  handlers,
}: UseChannelEventsInput): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!user || !channelId || !projectId) {
      return;
    }

    let eventSource: EventSource | null = null;
    let cancelled = false;

    async function connect() {
      const token = await user!.getIdToken();

      if (cancelled) {
        return;
      }

      const url = `/api/projects/${projectId}/channels/${channelId}/events?token=${token}`;
      eventSource = new EventSource(url);

      eventSource.addEventListener('new_thread', (event: MessageEvent) => {
        const data = JSON.parse(event.data) as NewThreadEventData;
        handlersRef.current.onNewThread?.(data);
      });

      eventSource.addEventListener('new_message', (event: MessageEvent) => {
        const data = JSON.parse(event.data) as NewMessageEventData;
        handlersRef.current.onNewMessage?.(data);
      });

      eventSource.addEventListener('thread_updated', (event: MessageEvent) => {
        const data = JSON.parse(event.data) as ThreadUpdatedEventData;
        handlersRef.current.onThreadUpdated?.(data);
      });

      eventSource.addEventListener('mind_streaming', (event: MessageEvent) => {
        const data = JSON.parse(event.data) as MindStreamingEventData;
        handlersRef.current.onMindStreaming?.(data);
      });
    }

    void connect();

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, [user, projectId, channelId]);
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/useChannelEvents.test.ts
```

---

## Task 6: Wire Hook into App State

### Goal
Connect the `useChannelEvents` hook in `App.tsx` so that SSE events update the feed posts list, thread messages, and thread metadata in real time.

### TDD Steps

1. Write tests in `App.test.tsx` verifying that SSE events update feed and thread state
2. Run tests — fail
3. Wire `useChannelEvents` into `App.tsx`
4. Run tests — pass

### Files

**Modify:** `packages/web/src/App.tsx`
**Modify:** `packages/web/src/App.test.tsx`

### Implementation changes in `App.tsx`

Add the hook call inside the `App` component, after the existing state declarations:

```typescript
import { useChannelEvents } from './useChannelEvents';

// Inside App component, after state declarations:

useChannelEvents({
  user,
  projectId: route.name === 'chat' ? route.projectId : '',
  channelId: selectedChannelId,
  handlers: {
    onNewThread(data) {
      setFeedPosts((current) => [
        {
          threadId: data.thread.id,
          rootMessageId: data.rootMessage.id,
          rootMessageText: data.rootMessage.text,
          rootMessageRole: data.rootMessage.role,
          replyCount: 0,
          lastMessageAt: data.thread.lastMessageAt,
          createdAt: data.rootMessage.createdAt,
        },
        ...current.filter((post) => post.threadId !== data.thread.id),
      ]);
    },

    onNewMessage(data) {
      // Append to thread messages if the thread is currently open
      if (selectedThread?.id === data.threadId) {
        setThreadMessages((current) => {
          // Deduplicate — the acting user may have already added this optimistically
          if (current.some((msg) => msg.id === data.message.id)) {
            return current;
          }

          return [...current, data.message];
        });
      }

      // Increment reply count in feed
      setFeedPosts((current) =>
        current.map((post) =>
          post.threadId === data.threadId
            ? { ...post, replyCount: post.replyCount + 1 }
            : post,
        ),
      );
    },

    onThreadUpdated(data) {
      setFeedPosts((current) =>
        current.map((post) =>
          post.threadId === data.threadId
            ? {
                ...post,
                lastMessageAt: data.lastMessageAt,
                ...(data.replyCount >= 0 ? { replyCount: data.replyCount } : {}),
              }
            : post,
        ),
      );

      setSelectedThread((current) =>
        current && current.id === data.threadId
          ? {
              ...current,
              lastMessageAt: data.lastMessageAt,
              updatedAt: data.lastMessageAt,
            }
          : current,
      );
    },

    onMindStreaming(data) {
      // Track streaming state per thread (see Task 7)
      setStreamingMinds((current) => {
        const next = new Map(current);

        if (data.status === 'started') {
          next.set(data.threadId, data.mindName);
        } else {
          next.delete(data.threadId);
        }

        return next;
      });
    },
  },
});
```

### New state for streaming minds

Add to `App.tsx` state declarations:

```typescript
const [streamingMinds, setStreamingMinds] = useState<Map<string, string>>(() => new Map());
```

### Deduplication strategy

The acting user triggers both the optimistic update (from their own POST response) and the SSE event. The `onNewThread` handler deduplicates by filtering out existing `threadId` before prepending. The `onNewMessage` handler deduplicates by checking `message.id` before appending.

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/App.test.tsx
```

---

## Task 7: Mind Streaming Indicator

### Goal
Show a visual indicator on feed posts and in the thread drawer when a mind is actively streaming a response.

### TDD Steps

1. Write a test that the `ChannelFeed` renders a streaming indicator when `streamingMinds` includes the thread
2. Run test — fail
3. Add the indicator
4. Run test — pass

### Files

**Modify:** `packages/web/src/ChannelFeed.tsx` — add streaming indicator to feed posts
**Modify:** `packages/web/src/App.tsx` — pass `streamingMinds` to `ChannelFeed`

### Implementation

Add a `streamingMinds` prop to `ChannelFeed`:

```typescript
export type ChannelFeedProps = {
  // ... existing props ...
  streamingMinds?: Map<string, string>;
};
```

In the feed post rendering, show an indicator when the thread is streaming:

```tsx
{streamingMinds?.has(post.threadId) ? (
  <span className="feed-post-streaming" aria-label="Mind is responding">
    {streamingMinds.get(post.threadId)} is typing...
  </span>
) : null}
```

### CSS addition

```css
.feed-post-streaming {
  font-size: 0.75rem;
  color: var(--primary);
  font-style: italic;
  animation: pulse-opacity 1.5s ease-in-out infinite;
}

@keyframes pulse-opacity {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Test command

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run packages/web/src/ChannelFeed.test.tsx
```

---

## Task 8: Integration Tests

### Goal
Add integration tests that verify the full SSE pipeline: hook lifecycle, event dispatching, state updates, and deduplication.

### TDD Steps

1. Write tests covering the full flow in `App.test.tsx`
2. Run tests — pass (implementation already done in previous tasks)

### Files

**Modify:** `packages/web/src/App.test.tsx`

### Tests to add

```typescript
describe('SSE channel events', () => {
  it('prepends a new thread to the feed when new_thread event arrives', () => {
    // Render the app with a mock EventSource
    // Simulate a new_thread event
    // Assert the feed posts list includes the new thread at the top
  });

  it('deduplicates when the acting user creates a post that also arrives via SSE', () => {
    // Create a post (which adds to feed optimistically)
    // Simulate the same thread arriving via SSE
    // Assert only one entry in the feed for that threadId
  });

  it('appends a message to the open thread when new_message event arrives', () => {
    // Open a thread
    // Simulate a new_message event for that thread
    // Assert the message appears in the thread messages
  });

  it('ignores new_message events for threads that are not open', () => {
    // Open thread A
    // Simulate a new_message event for thread B
    // Assert thread A messages are unchanged
  });

  it('updates feed post metadata on thread_updated event', () => {
    // Render feed with a post
    // Simulate a thread_updated event
    // Assert lastMessageAt is updated
  });

  it('shows streaming indicator on mind_streaming started event', () => {
    // Simulate mind_streaming started
    // Assert the indicator is visible on the relevant post
  });

  it('hides streaming indicator on mind_streaming done event', () => {
    // Simulate mind_streaming started, then done
    // Assert the indicator is removed
  });
});
```

### Full test suite verification

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && npx vitest run
```

---

## File Summary

### New files

| File | Purpose |
|------|---------|
| `packages/platform/src/services/channel-events.ts` | Shared types for channel SSE event contract |
| `packages/platform/src/services/channel-events.test.ts` | Type validation tests |
| `packages/platform/src/services/channel-event-emitter.ts` | In-memory per-isolate event fan-out |
| `packages/platform/src/services/channel-event-emitter.test.ts` | Emitter subscribe/emit/unsubscribe tests |
| `packages/web/src/channel-events.ts` | Frontend mirror of channel event types |
| `packages/web/src/useChannelEvents.ts` | React hook for EventSource lifecycle |
| `packages/web/src/useChannelEvents.test.ts` | Hook lifecycle and dispatch tests |
| `packages/worker/test/smoke/channel-events.smoke.test.ts` | Smoke test for emitter integration |

### Modified files

| File | Changes |
|------|---------|
| `packages/platform/src/index.ts` | Export channel-events and channel-event-emitter modules |
| `packages/worker/src/index.ts` | Add `GET .../events` route, module-level emitter singleton, emit events from POST routes, update HonoEnv type |
| `packages/web/src/App.tsx` | Wire `useChannelEvents` hook, add `streamingMinds` state, pass to ChannelFeed |
| `packages/web/src/ChannelFeed.tsx` | Add `streamingMinds` prop, render streaming indicator |
| `packages/web/src/styles.css` | Add `.feed-post-streaming` CSS with pulse animation |
| `packages/web/src/App.test.tsx` | Add SSE integration tests |

---

## Open Questions for Remy

1. **Auth token in query parameter:** `EventSource` does not support custom headers, so we pass the Firebase ID token as `?token=<idToken>`. This is the standard workaround, and the token is short-lived (1 hour) over HTTPS. However, it means the token appears in server logs and URL bars. Is this acceptable, or do we want to explore an alternative (e.g., a short-lived session cookie issued by a separate endpoint)?

2. **Cross-isolate broadcast:** The in-memory `ChannelEventEmitter` only broadcasts within a single Cloudflare Workers isolate. In production with multiple isolates, User A's post creation may hit isolate X while User B's SSE connection is on isolate Y — User B would not see the real-time event. For v1 this is acceptable (users see their own actions instantly, and can refresh for others'). For multi-user real-time, we'd need either Durable Objects or an external pub/sub (Redis, Kafka). Should we document this as a known limitation, or do you want to explore Durable Objects now?

3. **Reply count in `thread_updated`:** The existing `streamChannelReplyForPrincipal` does not return a reply count. Options: (A) add a DB query for the message count after each stream, (B) let the frontend increment locally. This plan assumes (B). Confirm?

4. **Token refresh for long-lived connections:** Firebase ID tokens expire after 1 hour. `EventSource` will automatically reconnect on connection drop, but the reconnection uses the same URL with the original (now-expired) token. We need to either: (A) let the reconnection fail and open a new `EventSource` with a fresh token (requires `onerror` handling), or (B) use a different auth mechanism. This plan implements (A) — the `useChannelEvents` hook re-runs when the effect deps change, but a token expiring mid-connection would cause a reconnection failure followed by the effect cleanup/re-run cycle. Is this acceptable behavior?

5. **Mind name in `mind_streaming` event:** The current agent streaming code doesn't expose which "mind" (agent persona) is responding. For v1, we emit a generic `mindName: 'Mind'`. Should we derive the mind name from the agent ID, or is the generic label sufficient?

6. **Heartbeat interval:** The plan uses 30-second heartbeats. Cloudflare Workers have a maximum request duration of 30 seconds on the free plan, 15 minutes on Workers Paid. If we're on the free plan, SSE connections will be killed every 30 seconds and must rely on `EventSource` auto-reconnect. Confirm which plan we're on and whether the heartbeat interval needs adjustment.
