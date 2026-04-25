# ABOUTME: Implementation plan for Phase 11e — Librarian Mind & Channel Seeding
# ABOUTME: Covers system mind provisioning, channel seed threads, bootstrap flow integration, and frontend auto-open

# Phase 11e: Librarian Mind & Channel Seeding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2–3 focused sessions
**Dependencies**: Phase 11a (foundation), Phase 11b (sidebar navigation). Existing agent registry and channel/thread infrastructure in place. Design doc `05_target_frontend_ui_architecture_design.md` section 11d approved.

**Goal:** Introduce the Librarian as a system mind — auto-provisioned with every mindspace. When a channel is created, a seed thread is automatically generated with a Librarian mention that triggers a streaming response. The mindspace bootstrap flow seeds `#general` with a welcome thread. The frontend auto-opens the seed thread so users see the Librarian streaming in real time.

**Architecture:** Bottom-up — Librarian agent definition first (no DB changes needed since agents are code-defined), then the seeding service layer that orchestrates thread creation + Librarian invocation, then wire into channel creation and bootstrap flows, then frontend auto-open behavior.

**Tech Stack:** Mastra Agent SDK (`@mastra/core/agent`), Hono API routes, PostgreSQL (existing `project_channels` and `channel_threads` tables), React 19 + Vite 8 frontend, SSE streaming. OpenRouter model resolution (existing `resolveOpenRouterModel`).

---

## Current State Summary

| Area | What exists | File |
|------|-------------|------|
| **Agent registry** | `createAgentRegistry()` returns `projectAgent`, `summarizer`, `mindspaceReviewer`, `mindspace-supervisor`. No Librarian. | `packages/platform/src/mastra/agents/registry.ts` |
| **Agent factory** | `buildMindspaceAgent()` creates agents with memory, workspace binding, and tool registration. | `packages/platform/src/mastra/agents/build-agent.ts` |
| **Model resolution** | `resolveOpenRouterModel()` resolves via config → env → default (`openai/gpt-4.1-mini`). | `packages/platform/src/mastra/agents/model.ts` |
| **Channel creation (backend)** | `createProjectChannelForPrincipal()` creates a channel record. No seed thread. | `packages/platform/src/services/chat.ts` lines 289–322 |
| **Channel creation (API)** | `POST /api/projects/:projectId/channels` calls `createProjectChannelForPrincipal`. Returns `{ channel }`. | `packages/app/src/server/factory.ts` lines 633–644 |
| **Post creation (backend)** | `createChannelPostForPrincipal()` creates thread + root message in Mastra memory. | `packages/platform/src/services/chat.ts` lines 324–382 |
| **Streaming reply** | `streamChannelReplyForPrincipal()` streams agent response via SSE. Uses `projectAgent`. | `packages/platform/src/services/chat.ts` lines 515–621 |
| **Bootstrap flow** | `bootstrapProjectForPrincipal()` creates org → user → project → mindspace → `#general` channel. No seed thread, no Librarian. | `packages/platform/src/services/dev-bootstrap.ts` |
| **Frontend channel creation** | `handleCreateChannel()` in `App.tsx` calls `createProjectChannel()`, selects channel, clears feed. | `packages/web/src/App.tsx` lines 360–383 |
| **Frontend post creation** | `handleCreatePost()` creates post then auto-opens thread + runs stream. | `packages/web/src/App.tsx` lines 421–459 |
| **Mastra instance** | `createMastra()` registers agents from `createAgentRegistry()`. | `packages/platform/src/mastra/create-mastra.ts` |
| **Execution context** | `buildExecutionContext()` builds RequestContext with project/channel/thread info. | `packages/platform/src/mastra/execution/build-execution-context.ts` |

---

## Success Criteria

- [ ] Librarian agent is registered in the agent registry with id `librarian`
- [ ] Librarian agent uses configurable model (default `anthropic/claude-sonnet-4-6` via OpenRouter)
- [ ] Librarian agent is not deletable (enforced by being code-defined, not stored)
- [ ] Librarian has instructions focused on channel guidance and knowledge navigation
- [ ] `createProjectChannelForPrincipal()` creates a seed thread after channel creation
- [ ] Seed thread root message is `@librarian Give me a thorough usage guide to the #<channel-name> channel.`
- [ ] Channel creation API returns `seedThread` with `{ threadId, channelId }` so frontend can auto-open
- [ ] `bootstrapProjectForPrincipal()` seeds `#general` with `@librarian Welcome! Give a brief orientation to this mindspace.`
- [ ] Bootstrap API returns `seedThread` info for `#general`
- [ ] Frontend auto-opens seed thread after channel creation and shows Librarian streaming
- [ ] Streaming uses the `librarian` agent (not `projectAgent`) for seed thread responses
- [ ] All existing tests continue to pass
- [ ] New tests cover Librarian registration, seed thread creation, and bootstrap seeding
- [ ] `pnpm typecheck` passes across all packages

---

## Open Questions

1. **Librarian model default**: The design doc says `claude-sonnet-4-6` but the current model resolver goes through OpenRouter. The OpenRouter model ID would be `anthropic/claude-sonnet-4-6`. Confirm this is the correct model string, or whether a separate model resolver is needed for Anthropic direct.
2. **Seed thread ownership**: The seed thread's `ownerUserId` — should it be the user who created the channel, or `null` (system-generated)? Plan assumes `null` to signal it's a system thread.
3. **Librarian workspace access**: The Librarian uses `buildMindspaceAgent` which binds workspace tools. Should the Librarian have read-only access, or full workspace toolkit? Plan assumes full toolkit (same as projectAgent) since it needs to read project files to give contextual guidance.
4. **Fire-and-forget vs. synchronous seeding**: Should the seed thread Librarian response be triggered asynchronously (fire-and-forget) during channel creation, or should the API block until the seed message is saved? Plan assumes fire-and-forget — the frontend streams the response separately via the existing SSE endpoint.

---

## Recommended Sequencing

Execute these phases in order. Each phase is independently shippable.

1. **Phase 1: Librarian Agent** — Define the agent, register it. No behavioral changes.
2. **Phase 2: Channel Seeding Service** — Backend logic to create seed threads and trigger Librarian.
3. **Phase 3: Bootstrap Integration** — Wire seeding into the mindspace bootstrap flow.
4. **Phase 4: Frontend Auto-Open** — Auto-open seed thread and stream Librarian response.

---

## Phase 1: Librarian Agent

### Task 1.1: Create the Librarian agent definition

Define a Librarian agent using `buildMindspaceAgent()`. The Librarian's instructions are focused on channel guidance and knowledge navigation. It uses the same workspace toolkit as `projectAgent` so it can read project files for contextual answers.

**Files:**

- Create: `packages/platform/src/mastra/agents/librarian.ts`
- Create: `packages/platform/test/unit/librarian-agent.test.ts`

**TDD Step 1: Write failing test**

Create `packages/platform/test/unit/librarian-agent.test.ts`:

```ts
// ABOUTME: Tests for the Librarian system mind agent definition
// ABOUTME: Validates agent ID, name, and instructions contain channel guidance context

import { describe, expect, it } from 'vitest';

import { createLibrarianAgent } from '../../src/mastra/agents/librarian';

describe('createLibrarianAgent', () => {
  it('creates an agent with id "librarian"', () => {
    const agent = createLibrarianAgent();
    expect(agent.id).toBe('librarian');
  });

  it('creates an agent named "Librarian"', () => {
    const agent = createLibrarianAgent();
    expect(agent.name).toBe('Librarian');
  });

  it('has a description mentioning channel guidance', () => {
    const agent = createLibrarianAgent();
    expect(agent.description.toLowerCase()).toContain('channel');
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/platform/test/unit/librarian-agent.test.ts
```

Expected: fails because `createLibrarianAgent` module does not exist.

**TDD Step 3: Implement the agent**

Create `packages/platform/src/mastra/agents/librarian.ts`:

```ts
// ABOUTME: Librarian system mind — auto-provisioned channel guide and knowledge navigator.
// ABOUTME: Provides contextual guidance for channels using the workspace toolkit.

import { mindspaceToolkit } from '../tools/mindspace-tools';
import { buildMindspaceAgent } from './build-agent';
import type { AgentModelConfig } from './model';

export type LibrarianAgentConfig = AgentModelConfig;

const LIBRARIAN_DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

export function createLibrarianAgent(config: LibrarianAgentConfig = {}) {
  return buildMindspaceAgent({
    id: 'librarian' as const,
    name: 'Librarian',
    description: 'Channel guide and knowledge navigator for the mindspace.',
    instructions: ({ requestContext }) => [
      'You are the Librarian, a system mind for this mindspace.',
      'Your role is to help users understand channels, navigate project knowledge, and provide contextual guidance.',
      'When asked about a channel, explain its purpose, suggest what kinds of discussions belong there, and offer tips for getting the most out of it.',
      'When welcoming users to a mindspace, give a brief orientation covering the available channels and how to use the workspace effectively.',
      'Use the workspace tools (listDir, readFile) to inspect the project structure and provide grounded, specific guidance rather than generic advice.',
      'Keep responses helpful and concise. Use markdown formatting for readability.',
      `Current project ID: ${requestContext.get('projectId')}`,
      `Current organization ID: ${requestContext.get('organizationId')}`,
    ].join('\n'),
    toolkit: mindspaceToolkit,
    config: {
      ...config,
      openrouterModel: config.openrouterModel ?? LIBRARIAN_DEFAULT_MODEL,
    },
  });
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/platform/test/unit/librarian-agent.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/platform/src/mastra/agents/librarian.ts packages/platform/test/unit/librarian-agent.test.ts
git commit -m "Add Librarian system mind agent definition"
```

---

### Task 1.2: Register the Librarian in the agent registry

Add the Librarian to `createAgentRegistry()` so it's available via `mastra.getAgent('librarian')`.

**Files:**

- Modify: `packages/platform/src/mastra/agents/registry.ts`
- Modify: `packages/platform/test/unit/mastra-registry.test.ts` (if it tests agent keys)
- Modify: `packages/platform/src/index.ts` (export the new module)

**TDD Step 1: Write/update failing test**

Check existing registry tests and add a test for the librarian key:

```ts
it('includes the librarian agent in the registry', () => {
  const registry = createAgentRegistry({}, { workflows: mockWorkflows });
  expect(registry.librarian).toBeDefined();
  expect(registry.librarian.id).toBe('librarian');
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/platform/test/unit/mastra-registry.test.ts
```

**TDD Step 3: Implement**

In `packages/platform/src/mastra/agents/registry.ts`:

1. Add import: `import { createLibrarianAgent } from './librarian';`
2. Create the agent inside `createAgentRegistry()`: `const librarian = createLibrarianAgent(config);`
3. Add to the return object: `librarian,`

In `packages/platform/src/index.ts`, add:
```ts
export * from './mastra/agents/librarian';
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/platform/test/unit/mastra-registry.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/platform/src/mastra/agents/registry.ts packages/platform/src/index.ts packages/platform/test/unit/mastra-registry.test.ts
git commit -m "Register Librarian agent in the agent registry"
```

---

## Phase 2: Channel Seeding Service

### Task 2.1: Create the channel seeding function

A service function that creates a seed thread with a root message and triggers the Librarian to respond. This is a fire-and-forget operation — the thread and root message are created synchronously, but the Librarian response streams asynchronously.

**Key design decisions:**
- The seed thread is created with `ownerUserId: null` (system-generated).
- The root message role is `'user'` with the `@librarian` mention text.
- The function returns the thread ID so callers can tell the frontend which thread to auto-open.
- The Librarian invocation is intentionally **not** awaited — it runs in the background. The frontend will stream the response via the existing SSE endpoint.

**Files:**

- Create: `packages/platform/src/services/channel-seeding.ts`
- Create: `packages/platform/test/unit/channel-seeding.test.ts`

**TDD Step 1: Write failing test**

Create `packages/platform/test/unit/channel-seeding.test.ts`:

```ts
// ABOUTME: Tests for the channel seeding service
// ABOUTME: Validates seed thread creation and Librarian invocation setup

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateChannelThread = vi.fn(async () => ({
  id: 'seed-thread-1',
  channel_id: 'channel-1',
  owner_user_id: null,
  title: null,
  status: 'active',
  last_message_at: new Date('2026-04-23T00:00:00.000Z'),
  created_at: new Date('2026-04-23T00:00:00.000Z'),
  updated_at: new Date('2026-04-23T00:00:00.000Z'),
}));

const mockSaveThread = vi.fn();
const mockSaveMessages = vi.fn();

vi.mock('../../src/db/repositories/channel-threads', () => ({
  createChannelThread: (...args: unknown[]) => mockCreateChannelThread(...args),
  updateChannelThreadMetadata: vi.fn(async () => ({})),
}));

import { createSeedThread } from '../../src/services/channel-seeding';

describe('createSeedThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveThread.mockResolvedValue(undefined);
    mockSaveMessages.mockResolvedValue(undefined);
  });

  it('creates a channel thread with null ownerUserId', async () => {
    const memoryStore = {
      saveThread: mockSaveThread,
      saveMessages: mockSaveMessages,
      listMessages: vi.fn(),
    };

    await createSeedThread({
      channelId: 'channel-1',
      channelName: 'engineering',
      projectId: 'project-1',
      memoryStore: memoryStore as any,
    });

    expect(mockCreateChannelThread).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        ownerUserId: null,
      }),
    );
  });

  it('saves a root message with the @librarian mention for the channel name', async () => {
    const memoryStore = {
      saveThread: mockSaveThread,
      saveMessages: mockSaveMessages,
      listMessages: vi.fn(),
    };

    await createSeedThread({
      channelId: 'channel-1',
      channelName: 'engineering',
      projectId: 'project-1',
      memoryStore: memoryStore as any,
    });

    expect(mockSaveMessages).toHaveBeenCalledOnce();
    const savedMessages = mockSaveMessages.mock.calls[0][0].messages;
    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].role).toBe('user');

    const text = savedMessages[0].content.parts[0].text;
    expect(text).toContain('@librarian');
    expect(text).toContain('#engineering');
  });

  it('returns the seed thread ID', async () => {
    const memoryStore = {
      saveThread: mockSaveThread,
      saveMessages: mockSaveMessages,
      listMessages: vi.fn(),
    };

    const result = await createSeedThread({
      channelId: 'channel-1',
      channelName: 'engineering',
      projectId: 'project-1',
      memoryStore: memoryStore as any,
    });

    expect(result.threadId).toBe('seed-thread-1');
  });

  it('accepts a custom seed message', async () => {
    const memoryStore = {
      saveThread: mockSaveThread,
      saveMessages: mockSaveMessages,
      listMessages: vi.fn(),
    };

    await createSeedThread({
      channelId: 'channel-1',
      channelName: 'general',
      projectId: 'project-1',
      memoryStore: memoryStore as any,
      seedMessage: '@librarian Welcome! Give a brief orientation to this mindspace.',
    });

    const savedMessages = mockSaveMessages.mock.calls[0][0].messages;
    expect(savedMessages[0].content.parts[0].text).toBe(
      '@librarian Welcome! Give a brief orientation to this mindspace.',
    );
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/platform/test/unit/channel-seeding.test.ts
```

**TDD Step 3: Implement**

Create `packages/platform/src/services/channel-seeding.ts`:

```ts
// ABOUTME: Creates seed threads for channels with a Librarian mention as the root message.
// ABOUTME: Used during channel creation and mindspace bootstrap to populate channels with initial guidance.

import { randomUUID } from 'node:crypto';

import type { StorageThreadType } from '@mastra/core/memory';

import {
  createChannelThread,
  updateChannelThreadMetadata,
} from '../db/repositories/channel-threads';

type MemoryStore = {
  saveThread(input: { thread: StorageThreadType }): Promise<void>;
  saveMessages(input: { messages: Array<{
    id: string;
    role: string;
    threadId: string;
    resourceId: string;
    createdAt: Date;
    type: string;
    content: unknown;
  }> }): Promise<void>;
};

export type CreateSeedThreadInput = {
  channelId: string;
  channelName: string;
  projectId: string;
  memoryStore: MemoryStore;
  seedMessage?: string;
};

export type CreateSeedThreadResult = {
  threadId: string;
  channelId: string;
};

function deriveChannelResourceId(channelId: string) {
  return `channel:${channelId}`;
}

function defaultSeedMessage(channelName: string): string {
  return `@librarian Give me a thorough usage guide to the #${channelName} channel.`;
}

export async function createSeedThread(
  input: CreateSeedThreadInput,
): Promise<CreateSeedThreadResult> {
  const thread = await createChannelThread({
    channelId: input.channelId,
    ownerUserId: null,
  });

  const now = new Date();
  const resourceId = deriveChannelResourceId(input.channelId);
  const messageText = input.seedMessage ?? defaultSeedMessage(input.channelName);

  const storageThread: StorageThreadType = {
    id: thread.id,
    resourceId,
    title: thread.id,
    createdAt: now,
    updatedAt: now,
    metadata: {
      channelId: input.channelId,
      projectId: input.projectId,
      seed: true,
    },
  };

  const rootMessage = {
    id: randomUUID(),
    role: 'user',
    threadId: thread.id,
    resourceId,
    createdAt: now,
    type: 'text',
    content: {
      format: 2,
      content: messageText,
      parts: [
        {
          type: 'text',
          text: messageText,
        },
      ],
    },
  };

  await input.memoryStore.saveThread({ thread: storageThread });
  await input.memoryStore.saveMessages({ messages: [rootMessage] });
  await updateChannelThreadMetadata({
    threadId: thread.id,
    lastMessageAt: now,
  });

  return {
    threadId: thread.id,
    channelId: input.channelId,
  };
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/platform/test/unit/channel-seeding.test.ts
```

**TDD Step 5: Commit**

```bash
git add packages/platform/src/services/channel-seeding.ts packages/platform/test/unit/channel-seeding.test.ts
git commit -m "Add channel seeding service for seed thread creation"
```

---

### Task 2.2: Wire seeding into channel creation

Modify `createProjectChannelForPrincipal()` to create a seed thread after channel creation and return the seed thread info. The Librarian streaming is **not** triggered here — the frontend will trigger it by calling the existing stream endpoint with the seed thread ID.

**Files:**

- Modify: `packages/platform/src/services/chat.ts` — update `createProjectChannelForPrincipal()`
- Modify: `packages/platform/test/unit/chat-service.test.ts` — add test for seed thread creation
- Modify: `packages/platform/src/index.ts` — export `channel-seeding` module

**TDD Step 1: Write failing test**

Add to `packages/platform/test/unit/chat-service.test.ts` (or create a new test file `packages/platform/test/unit/channel-creation-seeding.test.ts`):

```ts
// ABOUTME: Tests that channel creation produces a seed thread
// ABOUTME: Validates the return shape includes seedThread info

// ... (mock setup similar to existing chat-service.test.ts)

describe('createProjectChannelForPrincipal with seeding', () => {
  it('returns a seedThread with threadId and channelId', async () => {
    const result = await createProjectChannelForPrincipal(
      {
        firebaseUid: 'firebase-user-1',
        projectId: 'project-1',
        name: 'engineering',
      },
      platformDeps,
    );

    expect(result.seedThread).toBeDefined();
    expect(result.seedThread.threadId).toBeDefined();
    expect(result.seedThread.channelId).toBe(result.channel.id);
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/platform/test/unit/channel-creation-seeding.test.ts
```

**TDD Step 3: Implement**

In `packages/platform/src/services/chat.ts`, update `createProjectChannelForPrincipal()`:

1. Add import: `import { createSeedThread } from './channel-seeding';`
2. After `createProjectChannel()`, call `createSeedThread()` with the channel info.
3. This requires the `memoryStore` — so the function signature needs `deps: ChatServiceDeps` added (matching other service functions in this file).
4. Update the return type to include `seedThread: { threadId: string; channelId: string }`.

```ts
export async function createProjectChannelForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  name: string;
  description?: string | null;
}, deps: ChatServiceDeps) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const name = input.name.trim();

  if (!name) {
    throw new AccessDeniedError('Channel name is required');
  }

  const slug = slugifyChannelName(name);

  if (!slug) {
    throw new AccessDeniedError('Channel name must contain letters or numbers');
  }

  const channel = await createProjectChannel({
    projectId: projectContext.projectId,
    name,
    slug,
    description: input.description ?? null,
    createdBy: projectContext.actorUserId,
  });

  const memoryStore = await getMemoryStore(deps.mastra);
  const seedThread = await createSeedThread({
    channelId: channel.id,
    channelName: name,
    projectId: projectContext.projectId,
    memoryStore,
  });

  return {
    channel: toChannelSummary(channel),
    seedThread,
  };
}
```

**Important:** This changes the function signature by adding `deps`. All callers must be updated:
- `packages/app/src/server/factory.ts` line 636 — the `POST /api/projects/:projectId/channels` route must pass `platformDeps`.

In `packages/app/src/server/factory.ts`, update the channel creation route:

```ts
app.post('/api/projects/:projectId/channels', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ name?: string; description?: string }>();
  const result = await (params.createProjectChannel ??
    ((input) => createProjectChannelForPrincipal(input, platformDeps)))({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    name: body.name ?? '',
    description: body.description ?? null,
  });

  return c.json(result);
});
```

Also update the `createProjectChannel` type in `AppFactoryParams` to include `seedThread` in the return type.

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 5: Commit**

```bash
git add packages/platform/src/services/chat.ts packages/platform/src/services/channel-seeding.ts packages/platform/src/index.ts packages/app/src/server/factory.ts packages/platform/test/unit/channel-creation-seeding.test.ts
git commit -m "Wire channel seeding into channel creation flow"
```

---

### Task 2.3: Add Librarian streaming trigger to channel creation API

The channel creation API needs to return the seed thread info so the frontend knows which thread to auto-open. The API response shape changes from `{ channel }` to `{ channel, seedThread }`.

This task also ensures the existing `streamChannelReplyForPrincipal` can use the `librarian` agent instead of `projectAgent` for seed threads. We add an optional `agentId` parameter to `streamChannelReplyForPrincipal`.

**Files:**

- Modify: `packages/platform/src/services/chat.ts` — add `agentId` option to `streamChannelReplyForPrincipal`
- Modify: `packages/web/src/api.ts` — update `createProjectChannel` return type to include `seedThread`
- Modify: `packages/app/src/server/factory.ts` — update route types

**TDD Step 1: Write failing test**

Add test to validate that `streamChannelReplyForPrincipal` can accept an `agentId`:

```ts
it('uses the specified agentId for streaming when provided', async () => {
  // Test that getAgent is called with 'librarian' when agentId is 'librarian'
  // ... (mock setup)
});
```

**TDD Step 2: Verify test fails**

**TDD Step 3: Implement**

In `packages/platform/src/services/chat.ts`, update `streamChannelReplyForPrincipal`:

```ts
export async function* streamChannelReplyForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
  threadId: string;
  message?: string;
  agentId?: string;
}, deps: ChatServiceDeps): AsyncGenerator<ChatStreamEvent> {
  // ... existing setup ...
  const agentId = input.agentId ?? 'projectAgent';
  const stream = await deps.mastra.getAgent(agentId).stream(messageInput, {
    // ...
  });
  // ... rest unchanged ...
}
```

In `packages/web/src/api.ts`, update the return type:

```ts
export async function createProjectChannel(
  user: AuthUser,
  projectId: string,
  name: string,
  description?: string,
) {
  return apiFetch<{
    channel: ChannelSummary;
    seedThread?: {
      threadId: string;
      channelId: string;
    };
  } & ResponseMeta>(`/api/projects/${projectId}/channels`, user, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}
```

Add a new function to stream with a specific agent:

```ts
export async function streamThreadReplyWithAgent(
  user: AuthUser,
  projectId: string,
  channelId: string,
  threadId: string,
  agentId: string,
  handlers: {
    onEvent(event: StreamEvent): void;
  },
) {
  // Same as streamThreadReply but passes agentId in the body
  const response = await fetch(
    `/api/projects/${projectId}/channels/${channelId}/threads/${threadId}/messages/stream`,
    {
      method: 'POST',
      headers: {
        ...(await buildHeaders(user)),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ agentId }),
    },
  );
  // ... same SSE handling as streamThreadReply ...
}
```

**NOTE:** Rather than duplicating `streamThreadReply`, consider adding the optional `agentId` parameter to the existing function signature and passing it in the body. This is simpler:

```ts
export async function streamThreadReply(
  user: AuthUser,
  projectId: string,
  channelId: string,
  threadId: string,
  message: string | undefined,
  handlers: {
    onEvent(event: StreamEvent): void;
  },
  agentId?: string,
) {
  const response = await fetch(
    `/api/projects/${projectId}/channels/${channelId}/threads/${threadId}/messages/stream`,
    {
      method: 'POST',
      headers: {
        ...(await buildHeaders(user)),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...(typeof message === 'string' ? { message } : {}),
        ...(agentId ? { agentId } : {}),
      }),
    },
  );
  // ... rest unchanged ...
}
```

In the Hono route (`factory.ts`), pass `agentId` through:

```ts
app.post('/api/projects/:projectId/channels/:channelId/threads/:threadId/messages/stream', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ message?: string; agentId?: string }>();
  const streamInput = {
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    threadId: c.req.param('threadId'),
    ...(typeof body.message === 'string' ? { message: body.message } : {}),
    ...(typeof body.agentId === 'string' ? { agentId: body.agentId } : {}),
  };
  // ... rest unchanged ...
});
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 5: Commit**

```bash
git add packages/platform/src/services/chat.ts packages/web/src/api.ts packages/app/src/server/factory.ts
git commit -m "Add agentId parameter to stream endpoint for Librarian routing"
```

---

## Phase 3: Bootstrap Integration

### Task 3.1: Seed #general during mindspace bootstrap

Update `bootstrapProjectForPrincipal()` to create a seed thread in `#general` with the welcome message after channel creation.

**Files:**

- Modify: `packages/platform/src/services/dev-bootstrap.ts`
- Create: `packages/platform/test/unit/bootstrap-seeding.test.ts`

**TDD Step 1: Write failing test**

Create `packages/platform/test/unit/bootstrap-seeding.test.ts`:

```ts
// ABOUTME: Tests that mindspace bootstrap seeds #general with a Librarian welcome thread
// ABOUTME: Validates the bootstrap response includes seedThread info

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies...
vi.mock('../../src/env', () => ({
  parseEnv: vi.fn(() => ({
    firebaseProjectId: 'test-project',
    mindspaceRoot: '/tmp/mindspaces',
  })),
}));

vi.mock('../../src/db/repositories/organizations', () => ({
  getOrganizationByFirebaseProjectId: vi.fn(async () => ({
    id: 'org-1',
    name: 'Test Org',
  })),
  createOrganization: vi.fn(),
}));

vi.mock('../../src/db/repositories/users', () => ({
  upsertUser: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../src/db/repositories/memberships', () => ({
  addOrganizationMembership: vi.fn(),
}));

vi.mock('../../src/db/repositories/projects', () => ({
  createProject: vi.fn(async () => ({
    id: 'project-1',
    organization_id: 'org-1',
    name: 'Test Project',
    slug: 'test-project',
    status: 'active',
  })),
}));

vi.mock('../../src/mindspace/provisioning', () => ({
  provisionMindspaceForProject: vi.fn(async () => ({
    root: { root_path: '/tmp/mindspaces/test' },
    binding: {
      active_agent_ref: 'default',
      active_agent_version: 'v1',
    },
  })),
}));

vi.mock('../../src/db/repositories/project-channels', () => ({
  createProjectChannel: vi.fn(async () => ({
    id: 'channel-general',
    project_id: 'project-1',
    name: 'general',
    slug: 'general',
  })),
}));

const mockCreateSeedThread = vi.fn(async () => ({
  threadId: 'seed-thread-general',
  channelId: 'channel-general',
}));

vi.mock('../../src/services/channel-seeding', () => ({
  createSeedThread: (...args: unknown[]) => mockCreateSeedThread(...args),
}));

import { bootstrapProjectForPrincipal } from '../../src/services/dev-bootstrap';

describe('bootstrapProjectForPrincipal seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSeedThread.mockResolvedValue({
      threadId: 'seed-thread-general',
      channelId: 'channel-general',
    });
  });

  it('creates a seed thread in #general with the welcome message', async () => {
    const result = await bootstrapProjectForPrincipal({
      uid: 'firebase-uid-1',
      email: 'test@example.com',
      name: 'Test User',
    });

    expect(mockCreateSeedThread).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-general',
        channelName: 'general',
        seedMessage: expect.stringContaining('@librarian'),
      }),
    );
  });

  it('returns seedThread info in the bootstrap response', async () => {
    const result = await bootstrapProjectForPrincipal({
      uid: 'firebase-uid-1',
      email: 'test@example.com',
      name: 'Test User',
    });

    expect(result.seedThread).toEqual({
      threadId: 'seed-thread-general',
      channelId: 'channel-general',
    });
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/platform/test/unit/bootstrap-seeding.test.ts
```

**TDD Step 3: Implement**

In `packages/platform/src/services/dev-bootstrap.ts`:

1. Add import: `import { createSeedThread } from './channel-seeding';`
2. The function needs a `memoryStore` to pass to `createSeedThread`. This requires a Mastra instance. Add a `deps` parameter or access Mastra from the environment.

**Design decision:** The bootstrap function currently doesn't take deps. We need to add a `deps` parameter with `mastra` so we can get the memory store. Alternatively, we can pass just the `memoryStore`. The cleanest approach is to add an optional deps parameter:

```ts
export async function bootstrapProjectForPrincipal(
  input: {
    uid: string;
    email: string | null;
    name: string | null;
    projectName?: string;
  },
  deps?: {
    mastra?: { getStorage(): { getStore(name: string): Promise<any> } | null };
  },
) {
  // ... existing code ...

  const defaultChannel = await createProjectChannel({
    projectId: project.id,
    name: 'general',
    slug: 'general',
    description: 'Default mindspace chat channel',
    createdBy: user.id,
  });

  let seedThread: { threadId: string; channelId: string } | undefined;

  if (deps?.mastra) {
    const storage = deps.mastra.getStorage();
    const memoryStore = await storage?.getStore('memory');

    if (memoryStore) {
      seedThread = await createSeedThread({
        channelId: defaultChannel.id,
        channelName: 'general',
        projectId: project.id,
        memoryStore,
        seedMessage:
          '@librarian Welcome! Give a brief orientation to this mindspace.',
      });
    }
  }

  return {
    projectId: project.id,
    organizationId: organization.id,
    defaultChannelId: defaultChannel.id,
    mindspaceRootPath: provisioned.root.root_path,
    ...(seedThread ? { seedThread } : {}),
    // ... rest unchanged ...
  };
}
```

Update the Hono route in `factory.ts` to pass `mastra` into the bootstrap call:

```ts
app.post('/api/dev/bootstrap-project', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ name?: string }>();
  const result = await (params.bootstrapProjectForPrincipal ?? (
    (input) => bootstrapProjectForPrincipal(input, { mastra })
  ))({
    uid: principal.uid,
    email: principal.email,
    name: principal.name,
    ...(body.name ? { projectName: body.name } : {}),
  });

  return c.json(result);
});
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 5: Commit**

```bash
git add packages/platform/src/services/dev-bootstrap.ts packages/app/src/server/factory.ts packages/platform/test/unit/bootstrap-seeding.test.ts
git commit -m "Seed #general with Librarian welcome thread during mindspace bootstrap"
```

---

## Phase 4: Frontend Auto-Open

### Task 4.1: Auto-open seed thread after channel creation

When the frontend creates a channel and receives `seedThread` in the response, it should:
1. Select the new channel
2. Auto-open the seed thread (set it as the selected thread, load its messages)
3. Trigger the Librarian streaming response via the existing SSE endpoint with `agentId: 'librarian'`

**Files:**

- Modify: `packages/web/src/App.tsx` — update `handleCreateChannel()` to use seed thread
- Modify: `packages/web/src/App.test.tsx` — add test for auto-open behavior

**TDD Step 1: Write failing test**

Add to `packages/web/src/App.test.tsx`:

```tsx
it('auto-opens the seed thread after creating a channel', async () => {
  window.history.pushState({}, '', '/chat/project-123');

  // Mock createProjectChannel to return seedThread
  vi.mocked(api.createProjectChannel).mockResolvedValueOnce({
    channel: {
      id: 'new-channel-1',
      name: 'design',
      slug: 'design',
    },
    seedThread: {
      threadId: 'seed-thread-1',
      channelId: 'new-channel-1',
    },
    __meta: { status: 200, durationMs: 50 },
  });

  // Mock getChannelThread for the seed thread
  vi.mocked(api.getChannelThread).mockResolvedValueOnce({
    thread: {
      id: 'seed-thread-1',
      channelId: 'new-channel-1',
      title: null,
      lastMessageAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        text: '@librarian Give me a thorough usage guide to the #design channel.',
        createdAt: new Date().toISOString(),
      },
    ],
    __meta: { status: 200, durationMs: 30 },
  });

  render(<Router><App /></Router>);

  // Wait for channels to load, then trigger channel creation
  await waitFor(() => {
    expect(api.listProjectChannels).toHaveBeenCalled();
  });

  // ... trigger handleCreateChannel ...

  // Verify seed thread is opened
  await waitFor(() => {
    expect(api.getChannelThread).toHaveBeenCalledWith(
      expect.anything(),
      'project-123',
      'new-channel-1',
      'seed-thread-1',
    );
  });
});
```

**TDD Step 2: Verify test fails**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 3: Implement**

In `packages/web/src/App.tsx`, update `handleCreateChannel()`:

```ts
async function handleCreateChannel() {
  if (!user || route.name !== 'chat' || !route.projectId || !newChannelName.trim()) {
    return;
  }

  startLoading('create-channel');
  clearError('channels');
  try {
    const result = await createProjectChannel(user, route.projectId, newChannelName.trim());
    setChannels((current) =>
      [...current, result.channel].sort((left, right) => left.name.localeCompare(right.name)),
    );
    setSelectedChannelId(result.channel.id);
    setFeedPosts([]);
    setNewChannelName('');

    // Auto-open seed thread if present
    if (result.seedThread) {
      const threadResult = await getChannelThread(
        user,
        route.projectId,
        result.channel.id,
        result.seedThread.threadId,
      );
      setSelectedThread(threadResult.thread);
      setThreadMessages(threadResult.messages);
      setStreamingReply('');

      // Trigger Librarian streaming response
      await runThreadStream({
        threadId: result.seedThread.threadId,
        channelId: result.channel.id,
        agentId: 'librarian',
      });
    } else {
      setSelectedThread(null);
      setThreadMessages([]);
      setStreamingReply('');
    }
  } catch (error) {
    setError('channels', String(error));
  } finally {
    stopLoading('create-channel');
  }
}
```

Update `runThreadStream` to accept optional `agentId` and pass it through:

```ts
async function runThreadStream(input: {
  threadId: string;
  channelId: string;
  message?: string;
  agentId?: string;
}) {
  if (!user || route.name !== 'chat' || !route.projectId) {
    return;
  }

  try {
    await streamThreadReply(
      user,
      route.projectId,
      input.channelId,
      input.threadId,
      input.message,
      {
        onEvent: (event) => {
          // ... existing event handling unchanged ...
        },
      },
      input.agentId,
    );
  } catch (error) {
    setError('thread', String(error));
  }
}
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "Auto-open seed thread and stream Librarian response after channel creation"
```

---

### Task 4.2: Update bootstrap flow to auto-open seed thread

When the admin bootstraps a project and navigates to chat, the `#general` seed thread should auto-open. The bootstrap response already includes `seedThread` from Phase 3. We need to:
1. Store the seed thread info from the bootstrap response
2. When navigating to the chat view for the bootstrapped project, auto-open the seed thread

**Files:**

- Modify: `packages/web/src/App.tsx` — update `handleBootstrapProject()` to store seed thread info
- Modify: `packages/web/src/api.ts` — update `BootstrapProjectResponse` type to include `seedThread`

**TDD Step 1: Write failing test**

Add a test that verifies the bootstrap response's `seedThread` triggers auto-open when navigating to chat.

**TDD Step 2: Verify test fails**

**TDD Step 3: Implement**

In `packages/web/src/api.ts`, update `BootstrapProjectResponse`:

```ts
export type BootstrapProjectResponse = {
  projectId: string;
  organizationId: string;
  mindspaceRootPath: string;
  binding: {
    activeAgentRef: string;
    activeAgentVersion: string;
  };
  defaultChannelId: string;
  seedThread?: {
    threadId: string;
    channelId: string;
  };
  project?: AccessibleProjectSummary;
} & ResponseMeta;
```

In `packages/web/src/App.tsx`, add state to hold a pending seed thread:

```ts
const [pendingSeedThread, setPendingSeedThread] = useState<{
  threadId: string;
  channelId: string;
} | null>(null);
```

In `handleBootstrapProject()`, store the seed thread:

```ts
async function handleBootstrapProject() {
  // ... existing code ...
  if (result.seedThread) {
    setPendingSeedThread(result.seedThread);
  }
  // ...
}
```

Add an effect that auto-opens the pending seed thread when the chat view loads:

```ts
useEffect(() => {
  if (!user || route.name !== 'chat' || !pendingSeedThread || !selectedChannelId) {
    return;
  }

  if (selectedChannelId === pendingSeedThread.channelId) {
    void handleOpenThread(pendingSeedThread.threadId).then(() => {
      void runThreadStream({
        threadId: pendingSeedThread.threadId,
        channelId: pendingSeedThread.channelId,
        agentId: 'librarian',
      });
      setPendingSeedThread(null);
    });
  }
}, [user, route, selectedChannelId, pendingSeedThread]);
```

**TDD Step 4: Verify tests pass**

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test
```

**TDD Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/api.ts
git commit -m "Auto-open Librarian seed thread after mindspace bootstrap navigation"
```

---

### Task 4.3: Update feed to show seed thread

Ensure the channel feed loads and displays the seed thread after channel creation. The seed thread should appear as the first (and only) post in the feed with the `@librarian` root message text.

This should work automatically since:
1. The seed thread is created in `channel_threads` via `createChannelThread`
2. The root message is saved to Mastra memory via `saveMessages`
3. `listChannelFeedForPrincipal` reads from both sources

**Verification:** Reload the feed for the new channel and confirm the seed thread appears.

No code changes needed unless the feed loading doesn't auto-trigger after channel selection. The existing `useEffect` on `selectedChannelId` already calls `handleLoadFeed()`.

**TDD Step 1: Write a test confirming feed loads after channel creation**

This may already be covered. Verify:

```bash
cd /Users/pureicis/dev/mastra-playground/mastra-mindspace && pnpm test -- --run packages/web/src/App.test.tsx
```

If not covered, add:

```tsx
it('loads the feed for the new channel after creation', async () => {
  // ... setup + trigger channel creation ...
  await waitFor(() => {
    expect(api.listChannelFeed).toHaveBeenCalledWith(
      expect.anything(),
      'project-123',
      'new-channel-1',
    );
  });
});
```

**Commit (if any changes):**

```bash
git add packages/web/src/App.test.tsx
git commit -m "Add test confirming feed loads after channel creation with seed thread"
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
pnpm dev
```

Manual verification checklist:
1. Bootstrap a new project → `#general` has a seed thread with `@librarian Welcome!` message
2. Navigate to chat → seed thread auto-opens → Librarian streams a welcome response
3. Create a new channel (e.g., `#engineering`) → seed thread created with `@librarian Give me a thorough usage guide to the #engineering channel.`
4. Seed thread auto-opens → Librarian streams channel guidance
5. Existing channels without seed threads still work normally

---

## File Summary

### New files created

| File | Purpose |
|------|---------|
| `packages/platform/src/mastra/agents/librarian.ts` | Librarian system mind agent definition |
| `packages/platform/src/services/channel-seeding.ts` | Service for creating seed threads with Librarian mentions |
| `packages/platform/test/unit/librarian-agent.test.ts` | Tests for Librarian agent definition |
| `packages/platform/test/unit/channel-seeding.test.ts` | Tests for channel seeding service |
| `packages/platform/test/unit/channel-creation-seeding.test.ts` | Tests for channel creation with seeding |
| `packages/platform/test/unit/bootstrap-seeding.test.ts` | Tests for bootstrap flow seeding |

### Files modified

| File | Changes |
|------|---------|
| `packages/platform/src/mastra/agents/registry.ts` | Add Librarian to agent registry |
| `packages/platform/src/mastra/create-mastra.ts` | No changes needed — agents come from registry |
| `packages/platform/src/services/chat.ts` | Add `deps` param to `createProjectChannelForPrincipal`, add `agentId` option to `streamChannelReplyForPrincipal`, import `createSeedThread` |
| `packages/platform/src/services/dev-bootstrap.ts` | Add `deps` param, call `createSeedThread` for `#general`, return `seedThread` |
| `packages/platform/src/index.ts` | Export `librarian` agent and `channel-seeding` service |
| `packages/app/src/server/factory.ts` | Pass `platformDeps`/`mastra` to channel creation and bootstrap routes, pass `agentId` in stream route |
| `packages/web/src/api.ts` | Update `createProjectChannel` return type with `seedThread`, update `BootstrapProjectResponse` with `seedThread`, add `agentId` param to `streamThreadReply` |
| `packages/web/src/App.tsx` | Update `handleCreateChannel` to auto-open seed thread, update `runThreadStream` for `agentId`, add `pendingSeedThread` state for bootstrap flow |
| `packages/web/src/App.test.tsx` | Add tests for seed thread auto-open after channel creation |
| `packages/platform/test/unit/mastra-registry.test.ts` | Add test for librarian in registry |

### Files NOT modified (left for future phases)

| File | Reason |
|------|--------|
| `packages/platform/src/db/migrations/` | No schema changes — Librarian is a code-defined agent, not a DB entity |
| `packages/web/src/Sidebar.tsx` | No sidebar changes needed for seeding |
| `packages/web/src/ChannelFeed.tsx` | Feed rendering works as-is with seed threads |
| `packages/web/src/ThreadDrawer.tsx` | Thread drawer renders Librarian messages like any other assistant messages |
