# Native Mastra Multi-Agent — Implementation Plan

> **For Claude/coworkers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the architecture in [`04_native_mastra_multi_agent_design.md`](./04_native_mastra_multi_agent_design.md). Add a Mastra-native generic surface, scaffold a second agent end-to-end, refactor shared execution-context glue, and prepare the codebase for adding workflows + Mastra Editor in later phases.

**Architecture summary:** Three tiers of HTTP surface — `MastraServer` mounted at `/api/mastra/*` (auto-exposes every agent/workflow), domain-shaped routes at `/api/projects/:p/...` (existing pattern, extended for new agents), Mastra Studio external (deferred). One per-request `Mastra` instance, multiple agents inside, all sharing the project workspace via `RequestContext`.

**Tech stack:** Mastra 1.24 (`@mastra/core`, `@mastra/memory`, `@mastra/pg`, `@mastra/hono`), `@neondatabase/serverless`, Hono 4.12, Vitest, wrangler 4.

**Critical references:**
- [`.ai/tasks/04_native_mastra_multi_agent_design.md`](./04_native_mastra_multi_agent_design.md) — the design (read first)
- [`.ai/knowledges/01_technical_architecture.md`](../knowledges/01_technical_architecture.md) — current architecture
- [`packages/platform/src/services/chat.ts`](../../packages/platform/src/services/chat.ts) — reference pattern for Tier B services
- [`packages/platform/src/mastra/agents/project-agent.ts`](../../packages/platform/src/mastra/agents/project-agent.ts) — reference pattern for new agents
- [`packages/worker/test/README.md`](../../packages/worker/test/README.md) — testing operational guide
- [`packages/worker/scripts/run-e2e.mjs`](../../packages/worker/scripts/run-e2e.mjs) — E2E orchestrator (will need Mastra schema re-init after this work)

**Critical constraints (do not violate):**
- Every agent's `Memory` must use `observationalMemory: false` (CF Workers I/O lifetime).
- `PostgresStore` must keep `disableInit: true`. Schema additions go through `initMastraSchema()` out-of-band.
- Per-request `Mastra` instance pattern stays (`bootRequest()` in worker).
- Resource ID convention: `project:<id>` for project-scoped memory, `channel:<id>` for chat, `harness:<surface>:project:<id>` for per-surface scratch.
- New agents are ADDED to `createMastra()`. Do not refactor `projectAgent` away — it's load-bearing.

---

## Phase 0 — Pre-work

### Task 0.1: Confirm `@mastra/hono`'s `MastraServer` mount works on the per-request Mastra instance

**Goal:** Spike A from the design doc. Verify mount latency and auth interaction.

**Files:**
- Create: `packages/worker/scripts/spike-mastra-server.mjs` (will be deleted after the spike)

**Step 1 — Write the spike**

```js
// packages/worker/scripts/spike-mastra-server.mjs
// Throwaway: measures time to construct + init MastraServer per request.
import { Hono } from 'hono';
import { MastraServer } from '@mastra/hono';
import { createMastra } from '@hono-workspace/platform';

const NUM_ITERATIONS = 5;
const sample = [];

for (let i = 0; i < NUM_ITERATIONS; i++) {
  const t0 = performance.now();
  const app = new Hono();
  const mastra = createMastra(process.env.DATABASE_URL, { openrouterApiKey: 'spike' });
  const server = new MastraServer({ app, mastra, prefix: '' });
  await server.init();
  sample.push(performance.now() - t0);
}

console.log('per-request mount times (ms):', sample);
console.log('p50:', median(sample).toFixed(2), 'p95:', percentile(sample, 0.95).toFixed(2));
```

**Step 2 — Run against a fresh Neon branch**

```bash
cd /Users/pureicis/dev/mastra-playground/hono-workspace/packages/worker
node --import tsx -e "
  import { config } from 'dotenv';
  import { createTestBranch } from './test/helpers/test-db';
  config({ path: '../../.env' });
  const b = await createTestBranch({ prefix: 'spike-a' });
  await b.runMigrations();
  console.log(b.connectionString);
"
# Use the printed URL:
DATABASE_URL='<branch-url>' node --import tsx scripts/spike-mastra-server.mjs
```

**Step 3 — Decide based on results**

- If p95 < 100 ms: Tier A path is "construct per-request, accept it". Move to Task 1.1 with the design's mount strategy.
- If p95 100-500 ms: introduce module-scoped memoization keyed on the Mastra instance. Document the approach in the implementation as a note.
- If p95 > 500 ms: bigger redesign — bring back to design doc. STOP and discuss with Remy before continuing.

**Step 4 — Delete the spike, capture findings in commit message**

```bash
rm packages/worker/scripts/spike-mastra-server.mjs
git commit -m "chore: spike A — measured MastraServer mount latency

p50: <X>ms, p95: <Y>ms. Decision: <chosen path>.

Co-Authored-By: <author>"
```

### Task 0.2: Verify `MastraServer` SSE shape & auth interaction (Spike B)

**Goal:** Make sure Mastra's native `/api/agents/:id/stream` works under our existing `/api/*` Hono auth middleware, and capture its SSE event shape so we know what clients will see.

**Files:**
- Create: `packages/worker/scripts/spike-mastra-stream.mjs` (throwaway)

**Step 1 — Spawn a temporary Hono app that mounts MastraServer**

```js
// packages/worker/scripts/spike-mastra-stream.mjs
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { MastraServer } from '@mastra/hono';
import { createMastra } from '@hono-workspace/platform';

const app = new Hono();
const mastra = createMastra(process.env.DATABASE_URL, {
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
});
const server = new MastraServer({ app, mastra, prefix: '/api/mastra' });
await server.init();

const handle = serve({ fetch: app.fetch, port: 3299 }, ({ port }) => {
  console.log(`spike server listening on ${port}`);
});

// Optionally hit it from another process:
//   curl -N -X POST http://localhost:3299/api/mastra/agents/projectAgent/stream \
//        -H 'content-type: application/json' \
//        -d '{"messages":[{"role":"user","content":"say ok"}]}'
```

**Step 2 — Send a request, capture event types**

Run the spike, then fire a streaming request from another terminal. Record the event names (`text-delta`, `tool-call`, `finish`, etc.) — these become the documented contract for Tier A clients.

**Step 3 — Verify our auth middleware composes**

Add the existing Firebase auth middleware before the MastraServer mount. Send a request without a token → expect 401. Send with a token → expect 200.

**Step 4 — Capture findings in `04_native_mastra_multi_agent_design.md` §11 (open questions)**

Append a new entry under "Resolved during Phase 0":

```markdown
### Spike B resolution (YYYY-MM-DD)
- Mastra SSE event names observed: <list>
- Auth interaction: <our middleware runs first; Mastra's auth disabled via X / not present>
- Hono v4.12 satisfies HonoApp interface: <yes/no, any type-cast needed>
```

Commit the design doc update along with the spike removal.

---

## Phase 1 — Tier A: mount `MastraServer` + add a second agent

### Task 1.1: Refactor execution-context builder out of `chat.ts`

**Goal:** Extract the `RequestContext` building logic so new agent services don't duplicate it. Pure refactor — no behavior change.

**Files:**
- Create: `packages/platform/src/mastra/execution/build-execution-context.ts`
- Modify: `packages/platform/src/services/chat.ts` (use the new helper)
- Modify: `packages/platform/src/mastra/execution/execute-agent.ts` (use the new helper)
- Modify: `packages/platform/src/index.ts` (add export)

**Step 1 — Write the helper**

```typescript
// packages/platform/src/mastra/execution/build-execution-context.ts
// ABOUTME: Builds a Mastra RequestContext seeded with project, principal, and workspace info.
// ABOUTME: Shared by every agent service so memory/workspace conventions stay consistent.

import { RequestContext } from '@mastra/core/request-context';
import type { Workspace } from '@mastra/core/workspace';
import type { ProjectContext } from '../../services/project-context';
import type { ProjectAgentRequestContext } from './request-context';

export type ExecutionContextInput = {
  projectContext: ProjectContext;
  workspaceRootPath: string;
  workspace: Workspace;
  resourceId: string;        // memory scope, e.g. `channel:<id>`, `project:<id>`, `harness:<name>:project:<id>`
  threadId: string;          // memory thread within the resource
  channelId?: string;        // optional, only set for chat surfaces
  currentThreadId?: string;  // optional alias for the channel-thread context
};

export type ExecutionContext = {
  requestContext: RequestContext<ProjectAgentRequestContext>;
  resourceId: string;
  threadId: string;
  workspaceRootPath: string;
};

export function buildExecutionContext(input: ExecutionContextInput): ExecutionContext {
  const requestContext = new RequestContext<ProjectAgentRequestContext>();

  requestContext.set('resourceId', input.projectContext.resourceId);
  requestContext.set('actorUserId', input.projectContext.actorUserId);
  requestContext.set('organizationId', input.projectContext.organizationId);
  requestContext.set('projectId', input.projectContext.projectId);
  requestContext.set('role', input.projectContext.role);
  requestContext.set('workspace', input.workspace);
  if (input.channelId) requestContext.set('channelId', input.channelId);
  if (input.currentThreadId) requestContext.set('currentThreadId', input.currentThreadId);
  requestContext.set('mastra__resourceId', input.resourceId);
  requestContext.set('mastra__threadId', input.threadId);

  return {
    requestContext,
    resourceId: input.resourceId,
    threadId: input.threadId,
    workspaceRootPath: input.workspaceRootPath,
  };
}
```

**Step 2 — Use it in chat.ts**

Replace the existing inline `RequestContext` construction in `buildExecutionContext()` (currently in `chat.ts`) with a call to the new shared helper. Keep the function name and signature the same — chat-specific defaults (channel-derived resourceId) live in the call site.

```typescript
// packages/platform/src/services/chat.ts (replace lines ~210-237)
import { buildExecutionContext as buildSharedExecutionContext } from '../mastra/execution/build-execution-context';

async function buildExecutionContext(input: {
  projectId: string;
  projectContext: Awaited<ReturnType<typeof loadProjectContext>>;
  channelId: string;
  threadId: string;
}) {
  const resolvedWorkspace = await resolveWorkspaceForProject(input.projectId);
  const runtimeWorkspace = await getWorkspaceFactory()(resolvedWorkspace.root.root_path);
  return buildSharedExecutionContext({
    projectContext: input.projectContext,
    workspaceRootPath: resolvedWorkspace.root.root_path,
    workspace: runtimeWorkspace,
    resourceId: deriveChannelResourceId(input.channelId),
    threadId: input.threadId,
    channelId: input.channelId,
    currentThreadId: input.threadId,
  });
}
```

**Step 3 — Use it in execute-agent.ts**

Replace the inline `RequestContext` setup in `executeProjectAgent` similarly:

```typescript
// packages/platform/src/mastra/execution/execute-agent.ts
import { buildExecutionContext } from './build-execution-context';

// ...inside executeProjectAgent:
const projectContext = await loadProjectContext({
  firebaseUid: input.firebaseUid,
  projectId: input.projectId,
});
const resolvedWorkspace = await resolveWorkspaceForProject(input.projectId);
const runtimeWorkspace = await (deps.createRuntimeWorkspace ?? getWorkspaceFactory())(
  resolvedWorkspace.root.root_path,
);
const threadId = projectContext.projectId;
const execution = buildExecutionContext({
  projectContext,
  workspaceRootPath: resolvedWorkspace.root.root_path,
  workspace: runtimeWorkspace,
  resourceId: projectContext.resourceId,
  threadId,
});

const agent = deps.mastra?.getAgent('projectAgent') ?? createProjectAgent();
const output = await agent.generate(input.message, {
  requestContext: execution.requestContext,
  resourceId: projectContext.resourceId,
  threadId,
});
```

**Step 4 — Export from platform index**

```typescript
// packages/platform/src/index.ts
export * from './mastra/execution/build-execution-context';
```

**Step 5 — Run all four test layers**

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:smoke
```

Expected: 68/68 still pass (this is a pure refactor).

**Step 6 — Commit**

```bash
git add packages/platform/src/mastra/execution/build-execution-context.ts \
        packages/platform/src/services/chat.ts \
        packages/platform/src/mastra/execution/execute-agent.ts \
        packages/platform/src/index.ts
git commit -m "refactor: extract shared execution-context builder

Pure refactor. New agent services will reuse buildExecutionContext()
instead of duplicating the RequestContext setup.

Co-Authored-By: <author>"
```

### Task 1.2: Add the `summarizer` agent

**Goal:** Land a second agent end-to-end so the pattern is concrete and testable.

**Files:**
- Create: `packages/platform/src/mastra/agents/summarizer.ts`
- Modify: `packages/platform/src/mastra/create-mastra.ts`
- Modify: `packages/platform/src/index.ts`

**Step 1 — Write the agent**

```typescript
// packages/platform/src/mastra/agents/summarizer.ts
// ABOUTME: Mastra agent that summarizes a set of workspace documents.
// ABOUTME: Memory configured for CF Workers compatibility (observationalMemory: false).

import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ProjectAgentRequestContext } from '../execution/request-context';
import type { ProjectAgentConfig } from './project-agent';

const DEFAULT_MODEL = 'openai/gpt-4.1-mini';

function resolveModel(config: ProjectAgentConfig) {
  const apiKey = config.openrouterApiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required to execute the summarizer agent.');
  const provider = createOpenRouter({ apiKey });
  return provider.chat(config.openrouterModel ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL);
}

export function createSummarizerAgent(config: ProjectAgentConfig = {}) {
  return new Agent<'summarizer', never, undefined, ProjectAgentRequestContext>({
    id: 'summarizer',
    name: 'Summarizer',
    description: 'Summarizes a set of workspace documents into a concise paragraph.',
    instructions: ({ requestContext }) => [
      'You produce a concise summary of the provided documents.',
      'Cite document paths inline when referring to specific content (e.g. "(see docs/spec.md)").',
      'If no documents are provided, return a one-line response asking which paths to summarize.',
      `Project: ${requestContext.get('projectId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    model: () => resolveModel(config),
    memory: new Memory({ options: { observationalMemory: false } }),
    workspace: ({ requestContext }) => requestContext.get('workspace'),
  });
}
```

**Step 2 — Register in create-mastra.ts**

```typescript
// packages/platform/src/mastra/create-mastra.ts
import { createSummarizerAgent } from './agents/summarizer';

export function createMastra(connectionString: string, agentConfig?: ProjectAgentConfig) {
  return new Mastra({
    agents: {
      projectAgent: createProjectAgent(agentConfig),
      summarizer: createSummarizerAgent(agentConfig),  // <-- new
    },
    storage: createMastraStorage(connectionString),
  });
}
```

**Step 3 — Export**

```typescript
// packages/platform/src/index.ts
export * from './mastra/agents/summarizer';
```

**Step 4 — Re-init Mastra schema on the production DB if Mastra introduces new tables**

Check `mastra_*` table count in the production DB before and after registering the agent. If unchanged (most likely — adding an agent registers a row in `mastra_agents`, not new tables), no schema work needed. If changed, run:

```bash
DATABASE_URL='postgresql://cl-admin-01:<pw>@<host>/mindcloud-test-01?sslmode=require&channel_binding=require' \
  node --import tsx -e "
  import { initMastraSchema } from '@hono-workspace/platform';
  await initMastraSchema(process.env.DATABASE_URL);
"
```

(Cl-admin-01 password retrieval flow per `packages/worker/test/README.md`.)

**Step 5 — Verify unit + integration**

```bash
pnpm test:unit
pnpm test:integration  # creates a Neon branch with full schema; summarizer should be registered without errors
```

Expected: PASS.

**Step 6 — Commit**

```bash
git add packages/platform/src/mastra/agents/summarizer.ts \
        packages/platform/src/mastra/create-mastra.ts \
        packages/platform/src/index.ts
git commit -m "feat: register summarizer agent

Second Mastra agent. Demonstrates the recipe in
.ai/tasks/04 §6: define agent + register in createMastra().
No new tables; mastra_agents row added by Mastra at first use.

Co-Authored-By: <author>"
```

### Task 1.3: Mount `MastraServer` at `/api/mastra/*`

**Goal:** Land Tier A. Every registered agent (and later workflow) becomes callable at native Mastra paths.

**Files:**
- Modify: `packages/worker/src/index.ts`
- Modify: `packages/app/src/server/factory.ts`

**Strategy depends on Spike A outcome:**
- If per-request mount is fast enough → mount inline in `/api/mastra/*` middleware.
- If memoization needed → cache `MastraServer` keyed on the Mastra instance.

**Step 1 — Worker mount (assuming inline per-request is fast enough)**

```typescript
// packages/worker/src/index.ts (additions)
import { MastraServer } from '@mastra/hono';

// ...existing imports + middleware

// Tier A: native Mastra surface
app.use('/api/mastra/*', async (c) => {
  const mastra = c.get('mastra');
  const subApp = new Hono<HonoEnv>();
  const server = new MastraServer({
    app: subApp,
    mastra,
    prefix: '',
    // customRouteAuthConfig: <see Spike B; disable Mastra's auth if it conflicts with ours>
  });
  await server.init();

  // Strip the /api/mastra prefix before forwarding
  const url = new URL(c.req.raw.url);
  url.pathname = url.pathname.replace(/^\/api\/mastra/, '') || '/';
  const forwarded = new Request(url.toString(), c.req.raw);

  return subApp.fetch(forwarded, c.env, c.executionCtx);
});
```

(If the spike chose memoization, replace `new MastraServer(...)` with a `getMemoizedMastraServer(mastra)` call defined in a helper module.)

**Step 2 — App mount (Node.js)**

Same pattern in `packages/app/src/server/factory.ts`. The Mastra instance lives in the closure created by `createApp()`; reuse it for the MastraServer mount.

**Step 3 — Run unit tests**

```bash
pnpm test:unit
```

Expected: PASS (no new unit tests yet).

**Step 4 — Run E2E to validate the mount**

```bash
pnpm test:e2e
```

Expected: existing 9 E2E tests still pass. Mastra mount is exercised in the next task.

**Step 5 — Commit**

```bash
git add packages/worker/src/index.ts packages/app/src/server/factory.ts
git commit -m "feat: mount MastraServer at /api/mastra/*

Per-request mount on the per-request Mastra instance. Exposes every
registered agent and workflow over the standard Mastra HTTP surface
(/api/agents, /api/workflows, /stored/* once the editor is added).

Co-Authored-By: <author>"
```

### Task 1.4: E2E test for Tier A — `POST /api/mastra/agents/summarizer/stream`

**Goal:** Prove the mount works end-to-end.

**Files:**
- Create: `packages/worker/test/live/mastra-native.e2e.test.ts`

**Step 1 — Write the test**

```typescript
// packages/worker/test/live/mastra-native.e2e.test.ts
// ABOUTME: E2E test for Tier A — Mastra-native HTTP surface mounted at /api/mastra/*.

import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];
afterAll(async () => {
  for (const u of createdUsers) await u.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('Mastra native surface (Tier A)', { timeout: 120_000 }, () => {
  it('GET /api/mastra/agents lists registered agents', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const res = await fetch(`${baseUrl}/api/mastra/agents`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    // Mastra's response shape: { projectAgent: {...}, summarizer: {...} }
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['projectAgent', 'summarizer']));
  });

  it('POST /api/mastra/agents/summarizer/generate returns a model reply', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const res = await fetch(`${baseUrl}/api/mastra/agents/summarizer/generate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${user.idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Summarize: nothing yet — return one sentence.' }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { text?: string };
    expect(typeof body.text).toBe('string');
    expect(body.text!.length).toBeGreaterThan(0);
  });

  it('POST /api/mastra/agents/summarizer/stream returns SSE', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const res = await fetch(`${baseUrl}/api/mastra/agents/summarizer/stream`, {
      method: 'POST',
      headers: { authorization: `Bearer ${user.idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Drain the stream; expect at least one event
    const reader = res.body!.getReader();
    let chunks = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks += new TextDecoder().decode(value);
    }
    expect(chunks.length).toBeGreaterThan(0);
    // The exact event name will be observed in Spike B; assert presence of "data:" lines for now.
    expect(chunks).toContain('data:');
  });
});
```

**Note:** the exact body shapes and event names depend on `MastraServer`'s contract, which is captured by Spike B. Adjust the assertions to match what the spike documented. If `MastraServer` returns 401 because of its own auth config, set `customRouteAuthConfig` in Task 1.3 to disable for the agent endpoints we want our auth to gate.

**Step 2 — Run E2E**

```bash
pnpm test:e2e
```

Expected: 3 new tests pass; total 12 E2E tests.

**Step 3 — Commit**

```bash
git add packages/worker/test/live/mastra-native.e2e.test.ts
git commit -m "test: E2E for Tier A — list agents, generate, stream

Validates that MastraServer mount works end-to-end against a spawned
wrangler dev. Uses the summarizer agent to keep test cost minimal.

Co-Authored-By: <author>"
```

---

## Phase 2 — Tier B: domain route for the summarizer

### Task 2.1: Service function — `summarizeProjectDocsForPrincipal`

**Files:**
- Create: `packages/platform/src/services/summarization.ts`
- Modify: `packages/platform/src/index.ts`

**Step 1 — Write the service**

```typescript
// packages/platform/src/services/summarization.ts
// ABOUTME: Project-scoped summarization surface — wraps the summarizer agent with
// ABOUTME: project authorization, workspace resolution, and a stable response shape.

import type { Mastra } from '@mastra/core';
import { loadProjectContext } from './project-context';
import { resolveWorkspaceForProject } from '../workspace/resolver';
import { buildExecutionContext } from '../mastra/execution/build-execution-context';
import { AccessDeniedError } from './access-control';

export type SummarizeInput = {
  firebaseUid: string;
  projectId: string;
  paths: string[];
  question?: string;
};

export type SummarizeResult = {
  projectId: string;
  paths: string[];
  text: string;
  runId?: string;
  modelId?: string;
};

function deriveResourceId(projectId: string) {
  return `harness:summarizer:project:${projectId}`;
}

function deriveThreadId() {
  // Single-shot summarizations get an ephemeral thread keyed by call time.
  // Use a project-scoped thread if you want conversation history (Phase 6).
  return `summarize:${Date.now()}`;
}

function renderPrompt(input: SummarizeInput): string {
  const lines = [
    'Summarize the following workspace documents:',
    ...input.paths.map((p) => `- ${p}`),
  ];
  if (input.question) {
    lines.push('', `Question to answer in the summary: ${input.question}`);
  }
  return lines.join('\n');
}

export async function summarizeProjectDocsForPrincipal(
  input: SummarizeInput,
  deps: { mastra: Mastra },
): Promise<SummarizeResult> {
  if (input.paths.length === 0) {
    throw new AccessDeniedError('At least one path is required');
  }

  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolved = await resolveWorkspaceForProject(input.projectId);

  const execution = buildExecutionContext({
    projectContext,
    workspaceRootPath: resolved.root.root_path,
    workspace: resolved.workspace,
    resourceId: deriveResourceId(input.projectId),
    threadId: deriveThreadId(),
  });

  const output = await deps.mastra.getAgent('summarizer').generate(renderPrompt(input), {
    requestContext: execution.requestContext,
    memory: { thread: execution.threadId, resource: execution.resourceId },
  });

  return {
    projectId: input.projectId,
    paths: input.paths,
    text: output.text,
    ...(output.runId ? { runId: output.runId } : {}),
    ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
  };
}
```

**Step 2 — Export**

```typescript
// packages/platform/src/index.ts
export * from './services/summarization';
```

**Step 3 — Integration test**

```typescript
// packages/platform/test/integration/summarization.integration.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client';

describe('summarizeProjectDocsForPrincipal', () => {
  beforeEach(async () => {
    await pool.query(`
      truncate table
        channel_threads, project_channels, workspace_provisioning_jobs,
        workspace_events, workspace_locks, workspace_bindings, workspace_roots,
        organization_memberships, projects, users, organizations
      restart identity cascade
    `);
  });

  it.skipIf(!process.env.OPENROUTER_API_KEY)(
    'returns a model reply for project-scoped paths',
    { timeout: 60_000 },
    async () => {
      const { createMastra } = await import('../../src/mastra/create-mastra');
      const { seedProjectFixture } = await import('../helpers/fixtures');
      const { summarizeProjectDocsForPrincipal } = await import('../../src/services/summarization');

      const fixture = await seedProjectFixture();
      const mastra = createMastra(process.env.DATABASE_URL!, {
        openrouterApiKey: process.env.OPENROUTER_API_KEY!,
        openrouterModel: process.env.OPENROUTER_MODEL,
      });

      const result = await summarizeProjectDocsForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
        paths: ['docs/example.md', 'README.md'],
        question: 'Reply with the single word "ok".',
      }, { mastra });

      expect(result.projectId).toBe(fixture.project.id);
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
    },
  );

  it('rejects empty paths', async () => {
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const { summarizeProjectDocsForPrincipal } = await import('../../src/services/summarization');
    const fixture = await seedProjectFixture();
    const mastra = {} as any; // Not reached.

    await expect(
      summarizeProjectDocsForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
        paths: [],
      }, { mastra }),
    ).rejects.toThrow('At least one path is required');
  });
});
```

**Step 4 — Run**

```bash
pnpm test:integration
```

Expected: 25 tests total (was 23, +2 new).

**Step 5 — Commit**

```bash
git add packages/platform/src/services/summarization.ts \
        packages/platform/src/index.ts \
        packages/platform/test/integration/summarization.integration.test.ts
git commit -m "feat: summarization service — Tier B for the summarizer agent

Service function with authorization + execution context + Mastra call.
Pattern mirrors sendChannelMessageForPrincipal for consistency.

Co-Authored-By: <author>"
```

### Task 2.2: Domain route — `POST /api/projects/:projectId/summarize`

**Files:**
- Modify: `packages/worker/src/index.ts`
- Modify: `packages/app/src/server/factory.ts`

**Step 1 — Worker route**

```typescript
// packages/worker/src/index.ts
import { summarizeProjectDocsForPrincipal } from '@hono-workspace/platform';

app.post('/api/projects/:projectId/summarize', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ paths?: string[]; question?: string }>();
  const result = await summarizeProjectDocsForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    paths: body.paths ?? [],
    ...(body.question ? { question: body.question } : {}),
  }, { mastra });
  return c.json(result);
});
```

**Step 2 — App route (mirror in `factory.ts`)**

Same shape; `mastra` resolved from the closure instead of `c.get('mastra')`.

**Step 3 — E2E test**

```typescript
// packages/worker/test/live/summarize.e2e.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];
afterAll(async () => {
  for (const u of createdUsers) await u.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('POST /api/projects/:p/summarize', { timeout: 120_000 }, () => {
  it('summarizes after bootstrap', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    const bs = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `sum-${user.uid}` }),
    });
    const { projectId } = await bs.json() as { projectId: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/summarize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ paths: ['docs/spec.md'], question: 'Reply with "ok"' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { text: string; projectId: string };
    expect(body.projectId).toBe(projectId);
    expect(body.text.length).toBeGreaterThan(0);
  });
});
```

**Step 4 — Run E2E**

```bash
pnpm test:e2e
```

Expected: 13 tests (was 12, +1 new).

**Step 5 — Commit**

```bash
git add packages/worker/src/index.ts packages/app/src/server/factory.ts \
        packages/worker/test/live/summarize.e2e.test.ts
git commit -m "feat: domain route POST /api/projects/:p/summarize

Tier B surface for the summarizer agent. Same pattern as the chat routes.

Co-Authored-By: <author>"
```

---

## Phase 3 — First workflow

### Task 3.1: Add a tool registry for shared workspace operations

**Goal:** Workflows often need workspace primitives (read file, list dir). Centralize them so workflows and agents both use them.

**Files:**
- Create: `packages/platform/src/mastra/tools/workspace-tools.ts`
- Modify: `packages/platform/src/index.ts`

**Step 1 — Write the tools**

```typescript
// packages/platform/src/mastra/tools/workspace-tools.ts
// ABOUTME: Shared Mastra Tool definitions for workspace operations.
// ABOUTME: Both agents and workflow steps consume these.

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { ProjectAgentRequestContext } from '../execution/request-context';

export const readFileTool = createTool({
  id: 'workspace.readFile',
  description: 'Read the contents of a workspace file.',
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ content: z.string() }),
  execute: async ({ context, input }) => {
    const ctx = context as { requestContext: { get: <K extends keyof ProjectAgentRequestContext>(k: K) => ProjectAgentRequestContext[K] } };
    const workspace = ctx.requestContext.get('workspace');
    const content = await workspace.filesystem.readFile(input.path);
    return { content: typeof content === 'string' ? content : new TextDecoder().decode(content) };
  },
});

export const listDirTool = createTool({
  id: 'workspace.listDir',
  description: 'List files in a workspace directory.',
  inputSchema: z.object({ path: z.string(), recursive: z.boolean().optional() }),
  outputSchema: z.object({ entries: z.array(z.string()) }),
  execute: async ({ context, input }) => {
    const ctx = context as { requestContext: { get: <K extends keyof ProjectAgentRequestContext>(k: K) => ProjectAgentRequestContext[K] } };
    const workspace = ctx.requestContext.get('workspace');
    const entries = await workspace.filesystem.readdir(input.path, { recursive: input.recursive });
    return { entries };
  },
});
```

(Verify Mastra `createTool` signature against `@mastra/core/tools` types during implementation. The execute context shape may need a small adapter.)

**Step 2 — Export**

```typescript
// packages/platform/src/index.ts
export * from './mastra/tools/workspace-tools';
```

**Step 3 — Commit (no tests yet — covered by workflow integration test in Task 3.3)**

```bash
git add packages/platform/src/mastra/tools/workspace-tools.ts \
        packages/platform/src/index.ts
git commit -m "feat: shared workspace Mastra tools

readFile + listDir tools that read workspace from RequestContext.
Reused by workflow steps and any future agents that want explicit
workspace access via tool calls.

Co-Authored-By: <author>"
```

### Task 3.2: Define `ingestPipeline` workflow

**Files:**
- Create: `packages/platform/src/mastra/workflows/ingest-pipeline.ts`
- Modify: `packages/platform/src/mastra/create-mastra.ts`
- Modify: `packages/platform/src/index.ts`

**Step 1 — Workflow**

```typescript
// packages/platform/src/mastra/workflows/ingest-pipeline.ts
// ABOUTME: Multi-step workflow that lists a workspace subtree and summarizes it.
// ABOUTME: Demonstrates workflow + agent composition; CF Workers compatible.

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

const collectStep = createStep({
  id: 'collect',
  inputSchema: z.object({ rootPath: z.string() }),
  outputSchema: z.object({ files: z.array(z.string()) }),
  execute: async ({ inputData, requestContext }) => {
    const workspace = requestContext.get('workspace');
    const entries = await workspace.filesystem.readdir(inputData.rootPath, { recursive: true });
    return { files: entries.filter((e) => e.endsWith('.md')) };
  },
});

const summarizeStep = createStep({
  id: 'summarize',
  inputSchema: z.object({ files: z.array(z.string()) }),
  outputSchema: z.object({ summary: z.string(), filesCount: z.number() }),
  execute: async ({ inputData, mastra, requestContext }) => {
    if (inputData.files.length === 0) {
      return { summary: '', filesCount: 0 };
    }
    const summarizer = mastra.getAgent('summarizer');
    const out = await summarizer.generate(
      `Summarize these workspace files:\n${inputData.files.map((f) => `- ${f}`).join('\n')}`,
      { requestContext },
    );
    return { summary: out.text, filesCount: inputData.files.length };
  },
});

export function createIngestPipelineWorkflow() {
  return createWorkflow({
    id: 'ingestPipeline',
    inputSchema: z.object({ rootPath: z.string() }),
    outputSchema: z.object({ summary: z.string(), filesCount: z.number() }),
  })
    .then(collectStep)
    .then(summarizeStep)
    .commit();
}
```

(Mastra workflow API may have evolved — verify exact `createWorkflow`/`createStep` signatures in `@mastra/core/workflows` during implementation. Adjust if needed.)

**Step 2 — Register**

```typescript
// packages/platform/src/mastra/create-mastra.ts
import { createIngestPipelineWorkflow } from './workflows/ingest-pipeline';

return new Mastra({
  agents: {
    projectAgent: createProjectAgent(agentConfig),
    summarizer: createSummarizerAgent(agentConfig),
  },
  workflows: {
    ingestPipeline: createIngestPipelineWorkflow(),
  },
  storage: createMastraStorage(connectionString),
});
```

**Step 3 — Export**

```typescript
// packages/platform/src/index.ts
export * from './mastra/workflows/ingest-pipeline';
```

**Step 4 — Re-init Mastra schema in production if `mastra_workflow_snapshot` not already present**

It is — verified during the original migration. No action needed.

**Step 5 — Commit**

```bash
git add packages/platform/src/mastra/workflows/ingest-pipeline.ts \
        packages/platform/src/mastra/create-mastra.ts \
        packages/platform/src/index.ts
git commit -m "feat: register ingestPipeline workflow

Two-step workflow: collect markdown files → summarize via summarizer agent.
Demonstrates workflow + agent composition. Exposed automatically via Tier A.

Co-Authored-By: <author>"
```

### Task 3.3: Integration test for the workflow

**Files:**
- Create: `packages/platform/test/integration/ingest-pipeline.integration.test.ts`

**Step 1 — Test**

```typescript
// packages/platform/test/integration/ingest-pipeline.integration.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client';

describe('ingestPipeline workflow', () => {
  beforeEach(async () => {
    await pool.query(`truncate table channel_threads, project_channels, workspace_provisioning_jobs, workspace_events, workspace_locks, workspace_bindings, workspace_roots, organization_memberships, projects, users, organizations restart identity cascade`);
  });

  it.skipIf(!process.env.OPENROUTER_API_KEY)(
    'completes the two-step pipeline',
    { timeout: 90_000 },
    async () => {
      const { createMastra } = await import('../../src/mastra/create-mastra');
      const { seedProjectFixture } = await import('../helpers/fixtures');
      const { buildExecutionContext } = await import('../../src/mastra/execution/build-execution-context');
      const { resolveWorkspaceForProject } = await import('../../src/workspace/resolver');
      const { loadProjectContext } = await import('../../src/services/project-context');

      const fixture = await seedProjectFixture();
      const projectContext = await loadProjectContext({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
      });
      const resolved = await resolveWorkspaceForProject(fixture.project.id);
      const execution = buildExecutionContext({
        projectContext,
        workspaceRootPath: resolved.root.root_path,
        workspace: resolved.workspace,
        resourceId: `harness:ingest-pipeline:project:${fixture.project.id}`,
        threadId: `ingest:${Date.now()}`,
      });

      const mastra = createMastra(process.env.DATABASE_URL!, {
        openrouterApiKey: process.env.OPENROUTER_API_KEY!,
      });

      const run = await mastra.getWorkflow('ingestPipeline').start({
        inputData: { rootPath: '/' },
        requestContext: execution.requestContext,
      });
      // Result API name may differ; verify with mastra.getWorkflow('...') return shape.
      expect(run).toBeDefined();
      // Assert that workflow completed (status / result shape per Mastra docs).
    },
  );
});
```

**Step 2 — Run**

```bash
pnpm test:integration
```

(Expected count depends on whether the first run of this test creates more `mastra_*` rows. Verify and adjust the truncate list if needed.)

**Step 3 — Commit**

```bash
git add packages/platform/test/integration/ingest-pipeline.integration.test.ts
git commit -m "test: integration for ingestPipeline workflow

Exercises the two-step workflow against a real Neon branch and the
real summarizer agent.

Co-Authored-By: <author>"
```

### Task 3.4: E2E test for the workflow via Tier A

**Files:**
- Create: `packages/worker/test/live/workflow.e2e.test.ts`

**Step 1 — Test**

```typescript
// packages/worker/test/live/workflow.e2e.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];
afterAll(async () => {
  for (const u of createdUsers) await u.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('Mastra workflow via Tier A', { timeout: 180_000 }, () => {
  it('starts ingestPipeline and gets a result', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    // Bootstrap a project so a workspace exists
    await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `wf-${user.uid}` }),
    });

    // Start the workflow via Mastra's native workflow endpoint.
    // Verify the exact endpoint name from MastraServer's routes during Spike B.
    const res = await fetch(`${baseUrl}/api/mastra/workflows/ingestPipeline/start-async`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ inputData: { rootPath: '/' } }),
    });
    expect(res.status).toBe(200);
    // Assert against the run/result shape Mastra returns.
  });
});
```

**Step 2 — Run E2E**

```bash
pnpm test:e2e
```

**Step 3 — Commit**

```bash
git add packages/worker/test/live/workflow.e2e.test.ts
git commit -m "test: E2E for ingestPipeline via Mastra native workflow endpoint

Co-Authored-By: <author>"
```

---

## Phase 4 — Mastra Editor

### Task 4.1: Add `MastraEditor` to `createMastra()`

**Files:**
- Modify: `packages/platform/package.json` (add `@mastra/editor` dep)
- Modify: `packages/platform/src/mastra/create-mastra.ts`

**Step 1 — Install**

```bash
pnpm --filter @hono-workspace/platform add @mastra/editor@latest
```

**Step 2 — Register**

```typescript
// packages/platform/src/mastra/create-mastra.ts
import { MastraEditor } from '@mastra/editor';

return new Mastra({
  agents: {/* ... */},
  workflows: {/* ... */},
  storage: createMastraStorage(connectionString),
  editor: new MastraEditor(),  // <-- new
});
```

**Step 3 — Re-init Mastra schema** (the editor may register new tables)

```bash
DATABASE_URL='postgresql://cl-admin-01:<pw>@<host>/mindcloud-test-01?sslmode=require&channel_binding=require' \
  node --import tsx -e "
  import { initMastraSchema } from '@hono-workspace/platform';
  await initMastraSchema(process.env.DATABASE_URL);
"
```

Also update `initMastraSchema()` invocations in the test orchestrator and integration setup if any new tables need to be in the truncate list.

**Step 4 — Run E2E to verify the editor endpoints exist**

```bash
pnpm test:e2e
```

Expected: existing tests still pass. Editor endpoints are now exposed at `/api/mastra/stored/agents/*`.

**Step 5 — Commit**

```bash
git add packages/platform/package.json packages/platform/src/mastra/create-mastra.ts
git commit -m "feat: enable Mastra editor

@mastra/editor added; MastraServer now exposes /stored/agents/*
endpoints for runtime agent config overrides + version management.

Co-Authored-By: <author>"
```

### Task 4.2: Admin gate for editor write endpoints (optional but recommended)

**Files:**
- Modify: `packages/worker/src/index.ts`
- Modify: `packages/app/src/server/factory.ts`

**Step 1 — Define admin-role check**

Decide what "admin" means in this codebase. Options:
- `principal.email` matches an allowlist env var (`ADMIN_EMAILS`).
- `organization_memberships.role === 'owner'` for the relevant org.
- Custom claim on the Firebase token.

Pick one. Implement as a Hono middleware:

```typescript
// in worker/src/index.ts
async function requireAdmin(c: Context, next: Next) {
  const principal = c.get('principal');
  const allowed = (c.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim());
  if (!principal.email || !allowed.includes(principal.email)) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  await next();
}

// Gate write methods on /api/mastra/stored/*
app.use('/api/mastra/stored/*', async (c, next) => {
  const m = c.req.method;
  if (m === 'GET' || m === 'HEAD') return next();
  return requireAdmin(c, next);
});
```

**Step 2 — Add `ADMIN_EMAILS` to `.env.example`**

```
# Comma-separated list of emails that can write to /api/mastra/stored/* (editor admin)
ADMIN_EMAILS=
```

**Step 3 — Set as a worker secret in production**

```bash
echo "remy@example.com,admin@example.com" | wrangler secret put ADMIN_EMAILS
```

**Step 4 — E2E: verify a non-admin user gets 403 on POST /api/mastra/stored/agents**

Add to `mastra-native.e2e.test.ts`:

```typescript
it('rejects non-admin from POST /api/mastra/stored/agents', async () => {
  const user = await createTestUser();
  createdUsers.push(user);
  const res = await fetch(`${baseUrl}/api/mastra/stored/agents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${user.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'unauthorized-test' }),
  });
  expect(res.status).toBe(403);
});
```

**Step 5 — Commit**

```bash
git add packages/worker/src/index.ts packages/app/src/server/factory.ts \
        .env.example packages/worker/test/live/mastra-native.e2e.test.ts
git commit -m "feat: admin gate for editor write endpoints

GET/HEAD on /api/mastra/stored/* stay open to authenticated users
(useful for read-only inspection from clients). Mutating methods
require principal.email to be in the ADMIN_EMAILS allowlist.

Co-Authored-By: <author>"
```

---

## Phase 5 — Per-request version targeting (optional)

### Task 5.1: Thread `?versionId`/`?status` through domain routes

**Files:**
- Modify: `packages/platform/src/services/summarization.ts`
- Modify: `packages/platform/src/services/chat.ts` (project-chat)
- Modify: `packages/worker/src/index.ts`

**Step 1 — Service signature accepts version opts**

```typescript
export type AgentVersionOpts = {
  status?: 'published' | 'draft';
  versionId?: string;
};

export async function summarizeProjectDocsForPrincipal(
  input: SummarizeInput,
  deps: { mastra: Mastra; version?: AgentVersionOpts },
): Promise<SummarizeResult> {
  // ...
  const agent = deps.version
    ? deps.mastra.getAgentById('summarizer', deps.version)
    : deps.mastra.getAgent('summarizer');
  // ... use `agent` instead of `deps.mastra.getAgent(...)`
}
```

**Step 2 — Route handler reads query params**

```typescript
app.post('/api/projects/:projectId/summarize', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ paths?: string[]; question?: string }>();
  const versionQ = c.req.query('versionId');
  const statusQ = c.req.query('status') as 'published' | 'draft' | undefined;
  const version = versionQ ? { versionId: versionQ } : statusQ ? { status: statusQ } : undefined;

  const result = await summarizeProjectDocsForPrincipal({/* ... */}, { mastra, version });
  return c.json(result);
});
```

**Step 3 — Test**

Add a test that creates a stored draft for `summarizer`, then calls `/summarize?status=draft` and asserts the response uses the draft instructions. This requires the editor to be installed (Phase 4).

**Step 4 — Commit**

```bash
git add packages/platform/src/services/summarization.ts \
        packages/platform/src/services/chat.ts \
        packages/worker/src/index.ts \
        packages/worker/test/live/mastra-native.e2e.test.ts
git commit -m "feat: per-request agent version targeting in domain routes

Accept ?status and ?versionId query params, pass through to
mastra.getAgentById(). Enables canary/A-B testing of editor drafts
on production traffic.

Co-Authored-By: <author>"
```

---

## Phase 6 — Documentation

### Task 6.1: Update knowledge doc with multi-agent + editor surfaces

**Files:**
- Modify: `.ai/knowledges/01_technical_architecture.md`

Add a new section between §6 (HTTP API surface) and §7 (Request flow):

```markdown
## 6.5 Mastra-native surface (Tier A)

`MastraServer` from `@mastra/hono` is mounted at `/api/mastra/*` per request.
This auto-exposes:

- `GET  /api/mastra/agents` — list registered agents
- `GET  /api/mastra/agents/:id` — agent details
- `POST /api/mastra/agents/:id/generate` — synchronous reply
- `POST /api/mastra/agents/:id/stream` — SSE reply
- `GET  /api/mastra/workflows` — list registered workflows
- `POST /api/mastra/workflows/:id/start-async` — start a workflow run
- `POST /api/mastra/stored/agents` — admin: create an editor override
- `PATCH /api/mastra/stored/agents/:id` — admin: edit instructions/tools
- (additional endpoints exposed by the Mastra editor — see Mastra docs)

All endpoints inherit our `/api/*` Firebase auth. Mutating `/stored/*`
endpoints additionally require admin role (see ADMIN_EMAILS env var).
```

Update §3 with the new `agents`/`workflows`/`tools` directories.

### Task 6.2: Write a short "how to add a new agent" guide

**Files:**
- Create: `.ai/knowledges/02_adding_agents_and_workflows.md`

**Step 1 — Write a focused guide**

```markdown
# Adding a New Agent or Workflow

This is the canonical recipe. See [`01_technical_architecture.md`](./01_technical_architecture.md) for context.

## Add an agent

1. Create `packages/platform/src/mastra/agents/<name>.ts` — copy from `summarizer.ts`, adjust instructions and id.
2. Register in `packages/platform/src/mastra/create-mastra.ts` under `agents:`.
3. Export from `packages/platform/src/index.ts`.
4. (Optional) Domain route: create a service function in `packages/platform/src/services/<name>.ts` mirroring `summarization.ts`, then add Hono routes in both `packages/worker/src/index.ts` and `packages/app/src/server/factory.ts`.
5. Tests: integration for the service, E2E for the domain route. See existing `summarization.integration.test.ts` and `summarize.e2e.test.ts`.

## Add a workflow

1. Create `packages/platform/src/mastra/workflows/<name>.ts` — copy from `ingest-pipeline.ts`.
2. Register under `workflows:` in `create-mastra.ts`.
3. Export.
4. (Optional) Domain route — the workflow is callable at `POST /api/mastra/workflows/<name>/start-async` natively.
5. Tests: integration + E2E.

## Required conventions

- `Memory` must use `observationalMemory: false`.
- `PostgresStore` must use `disableInit: true`. After bumping `@mastra/pg`, re-run `initMastraSchema()` against production.
- Memory `resourceId` follows the convention from §5 of the architecture doc.
- Workspace must be passed via `RequestContext`, not as a constructor arg.

## Costs

- New agent (Tier A only): 2 files, ~30 lines.
- New agent (Tier A + Tier B): 4 files, ~80 lines.
- New workflow (Tier A only): 2 files, ~50 lines.
- New workflow (Tier A + Tier B): 4 files.

## Mastra Editor

Once Phase 4 lands, you can override the instructions or tools of any code-defined
agent via `POST /api/mastra/stored/agents` (admin-only) or via Studio. Code stays
the source of truth for `id`, `name`, `model`. Edits are versioned; clients can
target specific versions via `?versionId=<id>` on agent endpoints.
```

**Step 2 — Commit**

```bash
git add .ai/knowledges/01_technical_architecture.md \
        .ai/knowledges/02_adding_agents_and_workflows.md
git commit -m "docs: knowledge updates for native Mastra multi-agent surface

Co-Authored-By: <author>"
```

### Task 6.3: Mark this plan complete

**Files:**
- Create: `.ai/tasks/05_native_mastra_multi_agent_completion.md`

Brief completion report linking to commits, surfaces added, deviations from this plan, and remaining open items.

---

## Final verification

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:smoke
```

Expected counts after all phases:

| Layer | Before | After |
|---|---|---|
| Unit | 31 | 31 (no new pure logic except possible tool helpers) |
| Integration | 23 | 25-28 (new tests for summarization, ingest-pipeline) |
| E2E | 9 | 13-15 (Tier A list/generate/stream + summarize + workflow + admin gate) |
| Smoke | 5 | 5 (unchanged unless we want a smoke for the new surfaces — optional) |

Total: ~78-83 tests, all green.

---

## Known risks and open questions

| # | Risk | Mitigation |
|---|---|---|
| 1 | Mastra workflow API may have changed since 1.24 (`createWorkflow`/`createStep` signatures) | Spike check against `node_modules/.pnpm/@mastra+core*` types before Task 3.2. Adjust skeleton accordingly. |
| 2 | `MastraServer` may add Workers-incompatible code paths (e.g. internal pools, file system) | Spike A/B catch this. If incompatible, fallback is to NOT mount Tier A and rely on Tier B only — costs us discoverability but the architecture still works. |
| 3 | `MastraEditor` may add tables that conflict with our existing schema | Phase 4 includes a re-init step. Test in integration first. |
| 4 | Per-request `MastraServer` mount latency | Spike A measures it. Memoization fallback documented. |
| 5 | Workflow CF 30s limit | Out of scope. Document as a `traits: ['long-running']` warning if we add such a workflow. |

## Approval gate

Before starting implementation:

- [ ] Design doc 04 reviewed and approved by Remy.
- [ ] Spike A and Spike B run successfully (Phase 0).
- [ ] Test counts (78-83 expected) align with what we want to maintain.
- [ ] No additional architecture concerns from Remy.

After implementation:

- Write `05_native_mastra_multi_agent_completion.md` summarizing what landed, commits, and any deviations.
