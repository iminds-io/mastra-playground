# Native Mastra Multi-Agent Architecture — Design

**Status:** Design proposal. Awaiting approval before drafting the implementation plan ([05_*](./05_native_mastra_multi_agent_implementation_plan.md)).
**Author context:** Iterates on `.ai/knowledges/01_technical_architecture.md`. Strongly adheres to native Mastra primitives (no third-party "harness" abstraction; no iminds-style wrapper).
**Date:** 2026-04-16

---

## 1. Goal

Support **multiple Mastra agents and workflows** sharing **one workspace per project**, callable via HTTP, deployable on the existing CF Worker. Make adding a new agent or workflow a 30-line, single-file change. Optionally expose Mastra's editor + Studio for non-developer prompt tuning. **Build with native Mastra primitives — no custom abstraction layers.**

## 2. Non-goals

- Long-running workflow execution that survives a CF request boundary. (Future: Durable Objects.)
- Multi-tenant orchestration across deployments (one Mastra per Worker is sufficient).
- Custom JSON-Schema discovery or harness manifest. Mastra's own `/api/agents` / `/api/workflows` listings are enough.
- Replacing the existing chat surface. Channels/threads/posts stay; they're a domain-specialized surface that *uses* an agent.

## 3. Architectural principle

> Use Mastra's native primitives directly. Add a domain layer above them. Resist building any abstraction that wraps `Agent` or `Workflow` — Mastra already has the right shape.

Concretely, three tiers of HTTP surface:

| Tier | Path prefix | Source | Purpose |
|---|---|---|---|
| **A. Mastra native** | `/api/mastra/*` | Mounted via `@mastra/hono`'s `MastraServer` | Generic, discoverable, supports all agents and workflows out of the box. Editor endpoints land here too once `MastraEditor` is added. |
| **B. Domain-shaped** | `/api/projects/:p/...` | Hand-written Hono routes | Project/org/channel-aware surfaces that add business logic around an agent or workflow call. The existing chat is the canonical example. |
| **C. Studio (optional)** | external | Mastra Studio (hosted or self-hosted) pointed at our DB | Operator UI for editing agent prompts/tools versions. Phase 4. |

## 4. What lives where

### Per-request `Mastra` instance (unchanged from today)

```ts
// packages/platform/src/mastra/create-mastra.ts (revised)
export function createMastra(connectionString: string, agentConfig?: ProjectAgentConfig) {
  return new Mastra({
    agents: {
      projectAgent: createProjectAgent(agentConfig),     // existing
      summarizer:   createSummarizerAgent(agentConfig),  // new in Phase 1
      codeReviewer: createCodeReviewerAgent(agentConfig),// new in Phase 2
    },
    workflows: {
      ingestPipeline: createIngestPipelineWorkflow(),    // new in Phase 3
    },
    storage: createMastraStorage(connectionString),
    // editor: new MastraEditor(),                       // Phase 4
  });
}
```

### Tier A — `MastraServer` mount (Phase 1)

```ts
// packages/worker/src/index.ts (additions)
import { MastraServer } from '@mastra/hono';

app.use('/api/*', authMiddleware);  // existing — covers /api/mastra/* too

app.use('/api/mastra/*', async (c, next) => {
  const mastra = c.get('mastra');                       // already set per-request
  const subApp = new Hono<HonoEnv>();
  const server = new MastraServer({ app: subApp, mastra, prefix: '' });
  await server.init();                                  // registers all Mastra routes
  return subApp.fetch(stripPrefix(c.req.raw, '/api/mastra'), c.env, c.executionCtx);
});
```

(Per-request mount is slow for first call but fits CF's per-request-Mastra constraint. Spike to validate latency in Phase 1; if too slow, see §9 spike A.)

### Tier B — domain routes (existing pattern, extended)

Each domain-shaped surface lives in `packages/platform/src/services/<surface>.ts` and is invoked from a thin route handler:

```ts
// packages/worker/src/index.ts
app.post('/api/projects/:projectId/summarize', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ paths: string[]; question?: string }>();
  const result = await summarizeProjectDocsForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    paths: body.paths,
    question: body.question,
  }, { mastra });
  return c.json(result);
});
```

The service function does authorization, builds the Mastra `RequestContext`, calls `mastra.getAgent('summarizer').generate(...)`, returns a project-shaped result.

### File layout (after Phase 3)

```
packages/platform/src/mastra/
├── agents/
│   ├── project-agent.ts        # existing
│   ├── summarizer.ts           # Phase 1
│   └── code-reviewer.ts        # Phase 2
├── workflows/
│   └── ingest-pipeline.ts      # Phase 3
├── tools/
│   └── workspace-tools.ts      # shared Mastra Tool definitions (read file, ls, search)
├── execution/
│   ├── request-context.ts      # extended ProjectAgentRequestContext
│   └── build-execution-context.ts  # factor out the RequestContext builder
├── create-mastra.ts            # registers everything
└── storage.ts

packages/platform/src/services/
├── chat.ts                     # existing — uses projectAgent
├── summarization.ts            # Phase 1 — uses summarizer
├── code-review.ts              # Phase 2 — uses codeReviewer
└── ingestion.ts                # Phase 3 — starts ingestPipeline workflow
```

## 5. Memory and workspace conventions

These are the rules of the road for any new agent/workflow. They're not optional — violating them on CF Workers will cause hangs or deadlocks.

### Mastra Memory

| Convention | Required value |
|---|---|
| `observationalMemory` | `false` on every `Memory` instance. |
| `resourceId` (memory scope) | One of: `channel:<channelId>` (multi-thread, e.g. chat), `project:<projectId>` (single-thread, e.g. admin test), `harness:<surfaceName>:project:<projectId>` (per-surface ephemeral). |
| `threadId` | Caller-controlled or auto-derived from a request input. |

The `resourceId` convention lets a single agent serve multiple call sites with separate memory. We document this in `request-context.ts` and stick to it.

### Mastra Storage

| Convention | Required value |
|---|---|
| `disableInit` | `true` on `PostgresStore` at runtime. |
| Schema provisioning | Out-of-band: `initMastraSchema()` from `packages/worker/scripts/run-e2e.mjs` for tests, manual once for production. |
| Schema additions | Mastra's `init()` is idempotent. After bumping `@mastra/pg` or adding a domain that creates new tables, re-run `initMastraSchema()` against production. |

### Workspace

| Convention | Notes |
|---|---|
| One `Workspace` per project | `resolveWorkspaceForProject(projectId)` returns it. Already enforced. |
| Workspace passed to agents via `RequestContext` | `requestContext.set('workspace', workspace)` then agent reads via `({ requestContext }) => requestContext.get('workspace')`. |
| Workspace operations are I/O-scoped to the originating request | Don't `setTimeout` / `queueMicrotask` work that touches the workspace after the response. |

## 6. Adding a new agent — the canonical recipe

This is what a coworker should be able to do in 30 minutes after this design lands.

### Step 1 — Define the agent

```ts
// packages/platform/src/mastra/agents/summarizer.ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ProjectAgentRequestContext } from '../execution/request-context';
import type { ProjectAgentConfig } from './project-agent';   // re-use the config type

export function createSummarizerAgent(config: ProjectAgentConfig = {}) {
  return new Agent<'summarizer', never, undefined, ProjectAgentRequestContext>({
    id: 'summarizer',
    name: 'Summarizer',
    description: 'Summarize a set of workspace documents.',
    instructions: ({ requestContext }) => [
      'You produce a concise summary of the provided documents.',
      'Cite document paths inline when referring to specific content.',
      `Project: ${requestContext.get('projectId')}`,
    ].join('\n'),
    model: () => resolveModel(config),
    memory: new Memory({ options: { observationalMemory: false } }),
    workspace: ({ requestContext }) => requestContext.get('workspace'),
  });
}

function resolveModel(config: ProjectAgentConfig) {
  const apiKey = config.openrouterApiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required.');
  return createOpenRouter({ apiKey }).chat(config.openrouterModel ?? 'openai/gpt-4.1-mini');
}
```

### Step 2 — Register with Mastra

```ts
// packages/platform/src/mastra/create-mastra.ts
import { createSummarizerAgent } from './agents/summarizer';

agents: {
  projectAgent: createProjectAgent(agentConfig),
  summarizer:   createSummarizerAgent(agentConfig),  // <-- one new line
}
```

### Step 3 — Decide: native surface only, or also a domain route?

- **Native only** — done. The agent is callable at `POST /api/mastra/agents/summarizer/stream`. No more code.
- **Domain route** — write a service function + route handler if you want project-scoped semantics. See [Step 4-5].

### Step 4 — Service function (only if you want a domain route)

```ts
// packages/platform/src/services/summarization.ts
import type { Mastra } from '@mastra/core';
import { loadProjectContext } from './project-context';
import { resolveWorkspaceForProject } from '../workspace/resolver';
import { buildExecutionContext } from '../mastra/execution/build-execution-context';

export async function summarizeProjectDocsForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  paths: string[];
  question?: string;
}, deps: { mastra: Mastra }) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolved = await resolveWorkspaceForProject(input.projectId);
  const execution = buildExecutionContext({
    projectContext,
    workspaceRootPath: resolved.root.root_path,
    workspace: resolved.workspace,
    resourceId: `harness:summarizer:project:${input.projectId}`,
    threadId: `summarize:${Date.now()}`,
  });

  const prompt = renderPrompt(input);
  const output = await deps.mastra.getAgent('summarizer').generate(prompt, {
    requestContext: execution.requestContext,
    memory: { thread: execution.threadId, resource: execution.resourceId },
  });

  return {
    projectId: input.projectId,
    text: output.text,
    runId: output.runId,
    modelId: output.response?.modelId,
  };
}
```

### Step 5 — Route handler (paste in both worker and app entry points)

```ts
// packages/worker/src/index.ts
app.post('/api/projects/:projectId/summarize', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ paths: string[]; question?: string }>();
  const result = await summarizeProjectDocsForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    paths: body.paths,
    question: body.question,
  }, { mastra });
  return c.json(result);
});
```

### Step 6 — Test (one integration + one E2E)

- `packages/platform/test/integration/summarization.integration.test.ts` — calls service against a real Neon branch + real Mastra.
- `packages/worker/test/live/summarize.e2e.test.ts` — POST to the route through spawned wrangler dev.

**Adding an agent without a domain route is a 2-file change.** Adding it with a domain route is a 4-file change.

## 7. Adding a workflow — the canonical recipe

Workflows go in `packages/platform/src/mastra/workflows/`. Mastra exposes `mastra.getWorkflow(name).start({ inputData })` (verify exact API in Mastra 1.24 docs during Phase 3). Pattern:

```ts
// packages/platform/src/mastra/workflows/ingest-pipeline.ts
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

const collectStep = createStep({
  id: 'collect',
  inputSchema: z.object({ rootPath: z.string() }),
  outputSchema: z.object({ files: z.array(z.string()) }),
  execute: async ({ inputData, requestContext }) => {
    const workspace = requestContext.get('workspace');
    const files = await workspace.filesystem.readdir(inputData.rootPath, { recursive: true });
    return { files };
  },
});

const summarizeStep = createStep({
  id: 'summarize',
  inputSchema: z.object({ files: z.array(z.string()) }),
  outputSchema: z.object({ summary: z.string() }),
  execute: async ({ inputData, mastra }) => {
    const summarizer = mastra.getAgent('summarizer');
    const out = await summarizer.generate(`Summarize: ${inputData.files.join(', ')}`, {});
    return { summary: out.text };
  },
});

export function createIngestPipelineWorkflow() {
  return createWorkflow({
    id: 'ingestPipeline',
    inputSchema: z.object({ rootPath: z.string() }),
    outputSchema: z.object({ summary: z.string() }),
  })
    .then(collectStep)
    .then(summarizeStep)
    .commit();
}
```

Register in `create-mastra.ts` under `workflows: { ingestPipeline: createIngestPipelineWorkflow() }`. Callable at `POST /api/mastra/workflows/ingestPipeline/start-async` (Tier A) or via a domain route that starts the workflow with project-scoped input (Tier B).

**Workflow CF caveat:** the entire workflow must complete within a single request handler's I/O context. Multi-step workflows that take >30s, or workflows with human-in-the-loop suspension, will require a different execution strategy. Out of scope for now; flagged in §11.

## 8. Mastra Editor integration (Phase 4)

### What

Add `editor: new MastraEditor()` to `createMastra()`. `MastraServer` automatically picks it up and registers the `/stored/agents/*` routes. Operators can:

- Create a stored override for any code-defined agent (e.g. `summarizer`).
- Edit instructions and add tools without touching code.
- Save drafts, publish, archive — full version lifecycle.
- A/B test versions via per-request `?versionId=...` query param.

### How it touches our codebase

- One line in `create-mastra.ts`.
- `MastraServer` already exposes the editor endpoints — they appear under `/api/mastra/stored/agents/*` automatically.
- For domain routes that should also support version targeting, accept `?status=published|draft` or `?versionId=xxx` query params and pass through:

```ts
// packages/platform/src/services/summarization.ts (Phase 5 enhancement)
const versionOpts = parseVersionFromQuery(input.versionQuery);
const agent = deps.mastra.getAgentById('summarizer', versionOpts);
```

### What it does NOT change

- Workflows are not editable through the editor.
- `agent.id`, `agent.name`, `agent.model` come from code and stay fixed.
- The agent registry (`createMastra()`) stays in code — it's the stable contract.

### Studio access (Phase 5, optional)

Mastra Studio is a separate web UI. Three options:
- **Self-host Studio** (run as a separate Vercel/Cloudflare Pages deployment or even locally via `mastra studio`) pointed at our deployed worker.
- **Use Mastra-hosted Studio** if available, configured with our worker URL + a service-account auth bridge.
- **Skip Studio**, use programmatic `mastra.getEditor().agent.update(...)` from a CLI/admin route.

Decision deferred to Phase 5.

## 9. Spike points (resolve in Phase 1)

These are unknowns that need a quick code experiment, not deep architectural debate.

### Spike A — `MastraServer` per-request init latency

Per-request `new MastraServer().init()` may add latency to every `/api/mastra/*` request. Measure on wrangler dev. If >100ms, fall back to:

- **Sub-app caching:** memoize `MastraServer` per `mastra` instance. Each request still gets its own Mastra (so its own MastraServer), but at least we don't redo the work twice in one request.
- **Hybrid:** mount `MastraServer` once at module load with a "current Mastra" indirection (risky on CF — would need to verify no I/O state is captured).

### Spike B — Auth interaction with `MastraServer`

`MastraServer.registerAuthMiddleware()` adds Mastra's own auth. Our Hono auth middleware (`/api/*`) runs first and sets `c.var.principal`. Verify these don't conflict. Use Mastra's `customRouteAuthConfig` to disable Mastra's built-in if needed.

### Spike C — `Hono` version compat

`@mastra/hono` defines its own `HonoApp` interface to avoid Hono generics issues. Verify our Hono v4.12 instance satisfies it without type errors. Likely fine; worth typechecking.

## 10. Testing strategy (extension of [02_testing_strategy_design.md](./02_testing_strategy_design.md))

| Layer | Coverage for new agents |
|---|---|
| Unit | Agent factories pure functions (model resolution, instruction templating). |
| Integration | One test per service function — calls service against real Neon branch + real Mastra. Validates memory/storage shape on the branch. |
| E2E | One test per Tier B route — POST to the route through spawned wrangler dev with a real Firebase token. |
| Smoke | Optional per surface. Skip unless the surface is critical or expensive to break in production. |

For Tier A: one E2E test per agent confirming `POST /api/mastra/agents/<name>/stream` returns valid SSE. Add as a single parameterized test.

## 11. Open questions / future work

| # | Question | Resolution path |
|---|---|---|
| 1 | Long-running workflows past CF's 30s HTTP limit | Use Cloudflare Queues or Durable Objects. Out of scope until needed. |
| 2 | Workflow human-in-the-loop suspension | Same — needs Durable Objects or external job queue. |
| 3 | Per-request streaming for Tier B routes uniformly | Phase 6 — generalize the SSE wrapper helper used by `/messages/stream`. |
| 4 | Tool registry shared across agents | Phase 2 deliverable — `packages/platform/src/mastra/tools/workspace-tools.ts` exposes shared `Tool` definitions. |
| 5 | Per-tenant agent isolation (different agents per org) | Out of scope — current model is one Mastra instance, all projects/orgs share the same agents. |
| 6 | Studio deployment + auth bridge | Phase 5 spike. |

## 12. Decision summary

| Decision | Choice | Why |
|---|---|---|
| Abstraction layer over Mastra agents/workflows | **None.** Use native primitives. | Resists framework-on-framework. Mastra already has the right shape. |
| Generic execute endpoint | Mastra's own `/api/agents/:id/stream` via `MastraServer` | Zero-cost; supported upstream. |
| Domain routes | Hand-written, one per surface | Encodes business semantics that Mastra doesn't know about. |
| Mastra Editor | Phase 4, opt-in via one line | Gives ops prompt-tuning without redeploys. Schema already provisioned. |
| Studio | Phase 5, decide later | Operator UX nice-to-have, not blocking. |
| Workflows | Tier A only initially, Tier B if domain semantics needed | Same recipe as agents. |
| New agent cost | 2-file change (Tier A only) or 4-file change (with Tier B) | Predictable, mechanical, low-friction. |

## 13. Approval gate

Before drafting [`05_native_mastra_multi_agent_implementation_plan.md`](./05_native_mastra_multi_agent_implementation_plan.md), confirm:

- [ ] Tier A `MastraServer` mount approach is acceptable (per-request init, with spike A as safety net).
- [ ] No "harness" abstraction. Agents and workflows are first-class.
- [ ] New agent recipe (steps 1-6 in §6) is the canonical path forward.
- [ ] Editor in Phase 4, Studio in Phase 5 — agreeable phasing.
- [ ] Workflow-CF limitations (§7 caveat, §11 #1, #2) are acknowledged and out of scope for now.
