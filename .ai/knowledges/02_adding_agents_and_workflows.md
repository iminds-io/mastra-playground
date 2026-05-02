# Adding Agents, Supervisor Agents, and Workflows

**Category:** Reference
**Tags:** mastra, agents, workflows, supervisor-agents, cloudflare-workers
**Last Updated:** 2026-04-23
**References:** [`01_technical_architecture.md`](./01_technical_architecture.md), [`03_native_mastra_multi_agent_management_implementation_plan.md`](../tasks/03_native_mastra_multi_agent_management_implementation_plan.md), [`08_mindspace_scoped_mastra_gateway_implementation_plan.md`](../tasks/08_mindspace_scoped_mastra_gateway_implementation_plan.md)

---

## Overview

This is the canonical recipe for extending the Mastra surface in `mastra-mindspace`.

Mastra provides the primitives: `Agent`, `Workflow`, supervisor delegation through normal `generate()` / `stream()` calls, `MastraServer`, editor-backed stored overrides, and the app-level `agents` / `workflows` registry.

This repo adds three local conventions:

- Use `buildMindspaceAgent()` for every mindspace-aware agent so Cloudflare, project terminology, model, memory, and toolkit constraints stay consistent.
- Register code-defined agents and workflows through `mastra/agents/registry.ts` and `mastra/workflows/registry.ts`, not by growing ad hoc imports in `create-mastra.ts`.
- Add explicit primitive metadata in `mastra/registry-metadata.ts` so the mindspace-scoped gateway can decide which agents/workflows are exposed to product clients.

Do not use `.network()` for new work. Mastra marks agent networks as deprecated; supervisor agents are the current recommended native primitive for multi-agent coordination.

---

## Mental Model

- **Specialist agents** do one job well: summarize, review, plan, write, etc.
- **Supervisor agents** coordinate specialists when the route should let the model decide delegation order.
- **Workflows** encode known execution graphs where sequence, branching, or structured outputs matter more than flexible delegation.
- **Native/internal Mastra surface** (`/api/mastra/*`) exposes registered agents and workflows generically.
- **Mindspace-scoped Mastra surface** (`/api/projects/:projectId/mastra/*`) is the main product-facing Mastra API.
- **Convenience product routes** (`/api/projects/:projectId/summarize`, `/supervise`, etc.) wrap common patterns on top of the same project/mindspace context model.

Use the mindspace-scoped Mastra surface for new product-facing primitive execution. Keep the native/internal surface for editor/admin/dev/diagnostic use.

---

## Required Conventions

Every mindspace-aware agent and workflow step must follow these rules:

1. **Use `buildMindspaceAgent()` for agents.** It enforces OpenRouter model resolution, `observationalMemory: false`, Mastra `Workspace` binding from `RequestContext`, and toolkit registration.
2. **Use the correct toolkit.** Use `mindspaceReadOnlyToolkit` for analysis/summarization/review agents; use `mindspaceToolkit` only when the agent is allowed to write files.
3. **Mastra `Workspace` comes from `RequestContext`.** Never capture a `Workspace` in an agent constructor. Worker I/O objects are request-scoped.
4. **Keep `PostgresStore.disableInit: true`.** Mastra schema changes are initialized out-of-band with `initMastraSchema()`.
5. **Use explicit service deps.** Mindspace-scoped services receive `{ mastra, mindspaceFactory }` through `PlatformDeps`.
6. **Use stable memory resource IDs.** Current conventions:
   - `channel:<channelId>` for chat surfaces with channel-thread history.
   - `project:<projectId>` for project-wide memory.
   - `harness:<surface>:project:<projectId>` for per-surface scratch memory.
7. **Keep registry keys aligned with primitive ids.** Registry keys should match agent/workflow ids unless there is a documented legacy exception.
8. **Update registry metadata.** Every code-defined primitive must have a corresponding metadata entry in `mastra/registry-metadata.ts`.
9. **Decide mindspace-gateway exposure explicitly.** New primitives should be marked exposed/not-exposed through metadata instead of being implicitly discoverable to product clients.

---

## Add A Specialist Agent

### 1. Define The Agent

Use `summarizer.ts` or `mindspace-reviewer.ts` as the template.

```ts
// packages/platform/src/mastra/agents/my-agent.ts
// ABOUTME: One-line purpose.
// ABOUTME: Notes whether this agent is read-only or write-capable.

import { mindspaceReadOnlyToolkit } from '../tools/mindspace-tools';
import { buildMindspaceAgent } from './build-agent';
import type { ProjectAgentConfig } from './project-agent';

export function createMyAgent(config: ProjectAgentConfig = {}) {
  return buildMindspaceAgent({
    id: 'myAgent' as const,
    name: 'My Agent',
    description: 'Clear description used by supervisors to decide when to delegate.',
    instructions: ({ requestContext }) => [
      'What this agent does.',
      'What format it returns.',
      'What it must not do.',
      `Project: ${requestContext.get('projectId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    toolkit: mindspaceReadOnlyToolkit,
    config,
  });
}
```

Use `mindspaceToolkit` only if the agent is intentionally write-capable.

### 2. Register It

```ts
// packages/platform/src/mastra/agents/registry.ts
import { createMyAgent } from './my-agent';

export function createAgentRegistry(config: ProjectAgentConfig = {}, deps: AgentRegistryDeps) {
  const projectAgent = createProjectAgent(config);
  const librarian = createLibrarianAgent(config);
  const summarizer = createSummarizerAgent(config);
  const mindspaceReviewer = createMindspaceReviewerAgent(config);
  const myAgent = createMyAgent(config);
  const mindspaceSupervisor = createMindspaceSupervisorAgent(
    {
      agents: {
        summarizer,
        mindspaceReviewer,
        myAgent,
      },
      workflows: {
        ingestPipeline: deps.workflows.ingestPipeline,
      },
    },
    config,
  );

  return {
    projectAgent,
    librarian,
    summarizer,
    mindspaceReviewer,
    myAgent,
    'mindspace-supervisor': mindspaceSupervisor,
  };
}
```

### 3. Export It

```ts
// packages/platform/src/index.ts
export * from './mastra/agents/my-agent';
```

### 4. Test It

Add unit coverage to `packages/platform/test/unit/create-mastra.test.ts`:

```ts
it('registers myAgent with read-only tools', async () => {
  const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');
  const tools = await resolveAgentTools(mastra.getAgent('myAgent') as never);

  expect(Object.keys(tools ?? {}).sort()).toEqual(['listDir', 'readFile']);
});
```

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
pnpm --filter @mastra-mindspace/platform typecheck
```

### 5. Add Metadata

Add a metadata entry in `packages/platform/src/mastra/registry-metadata.ts`:

```ts
myAgent: {
  id: 'myAgent',
  capability: 'read',
  operations: ['generate', 'stream'],
  exposed: true,
},
```

If the agent is write-capable, start with `exposed: false` unless the product/API policy explicitly requires exposure.

---

## Add A Supervisor Agent

Use a supervisor when the task may need multiple specialists and the route should let the model decide delegation order. Do not use deprecated `.network()`.

Supervisor agents are normal Mastra agents with an `agents` map and optional `workflows` map. They are called with `.generate()` or `.stream()`.

```ts
// packages/platform/src/mastra/agents/my-supervisor.ts
import { mindspaceReadOnlyToolkit } from '../tools/mindspace-tools';
import { buildMindspaceAgent } from './build-agent';

export function createMySupervisorAgent(deps: MindspaceSupervisorDeps, config: ProjectAgentConfig = {}) {
  return buildMindspaceAgent({
    id: 'my-supervisor' as const,
    name: 'My Supervisor',
    description: 'Coordinates read-only specialists for multi-step analysis.',
    instructions: ({ requestContext }) => [
      'You coordinate specialists.',
      'Delegate when a specialist is better suited than answering directly.',
      'Synthesize specialist results into one final answer.',
      `Project: ${requestContext.get('projectId')}`,
    ].join('\n'),
    toolkit: mindspaceReadOnlyToolkit,
    agents: deps.agents,
    workflows: deps.workflows,
    defaultOptions: {
      maxSteps: 8,
      delegation: {
        messageFilter: ({ messages }) => messages.slice(-12),
      },
    },
    config,
  });
}
```

Guidelines:

- Give every subagent a strong `description`; supervisors use descriptions for delegation.
- Prefer read-only specialists in supervisors unless the route explicitly needs writes.
- Add `delegation.messageFilter` when parent context may contain too much or sensitive data.
- Add `onIterationComplete` or `isTaskComplete` when you need stronger termination behavior.
- Keep supervisor route options capped with `maxSteps` to control cost.

---

## Add A Workflow

Use workflows for known execution graphs. They are better than supervisor delegation when sequence, branching, parallelism, or structured outputs must be predictable.

### 1. Define The Workflow

```ts
// packages/platform/src/mastra/workflows/my-workflow.ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const stepOne = createStep({
  id: 'step-one',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ text: z.string() }),
  execute: async ({ inputData, mastra, requestContext }) => {
    const agent = mastra.getAgent('summarizer');
    const output = await agent.generate(inputData.message, {
      requestContext,
    });
    return { text: output.text };
  },
});

export function createMyWorkflow() {
  return createWorkflow({
    id: 'myWorkflow',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ text: z.string() }),
  })
    .then(stepOne)
    .commit();
}
```

Agents and tools can also be composed directly as workflow steps with `createStep(agent)` or `createStep(tool)` when no custom execute logic is needed.

### 2. Register It

```ts
// packages/platform/src/mastra/workflows/registry.ts
import { createMyWorkflow } from './my-workflow';

export function createWorkflowRegistry() {
  return {
    ingestPipeline: createIngestPipelineWorkflow(),
    myWorkflow: createMyWorkflow(),
  };
}
```

### 3. Worker Caveat

On Cloudflare Workers, the workflow must complete within the request's I/O lifetime unless we introduce Durable Objects, queues, or another durable execution system.

### 4. Add Metadata

Add a metadata entry in `packages/platform/src/mastra/registry-metadata.ts`:

```ts
myWorkflow: {
  id: 'myWorkflow',
  capability: 'read',
  operations: ['create-run', 'start'],
  exposed: true,
},
```

---

## Add A Convenience Product Route

Add a convenience product route only when the operation needs a bespoke request/response contract. For general product-facing primitive execution, prefer exposing the primitive through the mindspace-scoped Mastra gateway under `/api/projects/:projectId/mastra/*`.

The service pattern is:

```ts
export async function runMyAgentForPrincipal(
  input: MyInput,
  deps: PlatformDeps & { version?: AgentVersionOpts },
) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolved = await resolveMindspaceForProject(input.projectId, {
    mindspaceFactory: deps.mindspaceFactory,
  });
  const execution = buildExecutionContext({
    projectContext,
    mindspaceRootPath: resolved.root.root_path,
    workspace: resolved.workspace,
    resourceId: `harness:my-agent:project:${input.projectId}`,
    threadId: `my-agent:${Date.now()}`,
  });

  const agent = await getAgentWithVersion(deps.mastra, 'my-agent', deps.version);
  const output = await agent.generate(renderPrompt(input), {
    requestContext: execution.requestContext,
    memory: { thread: execution.threadId, resource: execution.resourceId },
  });

  return { projectId: input.projectId, text: output.text };
}
```

Register the route in both:

- `packages/app/src/server/factory.ts`
- `packages/worker/src/index.ts`

Keep the app route injectable for fast integration tests.

---

## Editor And Version Targeting

Code-defined agents are editable through `@mastra/editor` once registered in `createMastra()`.

Convenience product routes that support stored overrides should:

1. Parse query params with `parseAgentVersionFromQuery()`.
2. Pass `version` into the service deps.
3. Resolve the agent with `await getAgentWithVersion(...)`.

Supported query params:

- `?versionId=<uuid>`
- `?status=draft`
- `?status=published`

Do not assume subagent version overrides inside supervisor delegation until verified against installed package behavior.

---

## Verification Checklist

After adding an agent, supervisor, workflow, or convenience product route, run the smallest relevant set first:

```bash
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
pnpm test:unit -- --run packages/platform/test/unit/mastra-registry.test.ts
pnpm --filter @mastra-mindspace/platform typecheck
```

For convenience product app routes:

```bash
pnpm exec vitest run --config vitest.config.ts packages/app/test/integration/authenticated-routes.integration.test.ts
pnpm exec vitest run --config vitest.config.ts packages/app/test/integration/agent-version-targeting.integration.test.ts
pnpm --filter @mastra-mindspace/app typecheck
```

For Worker routes:

```bash
pnpm --filter @mastra-mindspace/worker typecheck
pnpm test:e2e
```

The E2E orchestrator currently runs the full live suite. If targeted live test execution is needed, update `packages/worker/scripts/run-e2e.mjs` to forward additional Vitest arguments.
