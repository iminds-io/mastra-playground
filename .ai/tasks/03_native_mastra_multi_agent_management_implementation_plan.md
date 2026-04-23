# Native Mastra Multi-Agent Management Implementation Plan

> **For Claude/coworkers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Make `hono-workspace` scalable for many Mastra agents by adding local agent/workflow registries, a safe supervisor-agent pattern, and a project-scoped Tier B supervisor route while preserving Cloudflare Worker request-scoped I/O constraints.

**Architecture:** Keep Mastra as the source of truth for runtime primitives: specialists are normal `Agent` instances, predictable orchestration stays in `Workflow`s, and ambiguous multi-agent coordination uses a Mastra supervisor agent through normal `generate()` / `stream()` calls. Add thin local registries so `createMastra()` stops accumulating ad hoc imports, and keep domain routes responsible for Firebase auth, project authorization, workspace resolution, and request-context seeding.

**Tech Stack:** TypeScript, Hono, Mastra `@mastra/core@1.25.0`, `@mastra/memory@1.15.1`, `@mastra/pg@1.9.1`, `@mastra/editor@0.7.16`, `@mastra/hono`, Neon, Cloudflare Workers, Vitest.

---

## Current-State Investigation

### Current Local Architecture

- `packages/platform/src/mastra/create-mastra.ts` manually imports and registers `projectAgent`, `summarizer`, and `ingestPipeline`.
- `packages/platform/src/mastra/agents/build-agent.ts` is already the right standard factory for workspace-aware agents. It centralizes model resolution, `observationalMemory: false`, `workspace` from `RequestContext`, and toolkit registration.
- `packages/platform/src/mastra/tools/workspace-tools.ts` exposes `workspaceReadOnlyToolkit` and `workspaceToolkit`; this gives us a natural permission split for safe specialists vs write-capable project agents.
- `packages/platform/src/mastra/execution/build-execution-context.ts` is the shared context builder used by chat, admin/test, summarization, and workflow surfaces.
- `packages/platform/src/platform-deps.ts` is the explicit service dependency boundary: `{ mastra, workspaceFactory }`.
- Tier A `/api/mastra/*` already exposes registered agents/workflows generically. Tier B domain routes are still needed when requests must enforce project membership and create a runtime `Workspace`.

### Native Mastra Primitives Reviewed

- **Supervisor agents:** Current Mastra docs recommend supervisor agents for multi-agent coordination. Subagents are configured on the supervisor's `agents` property, and calls use normal `Agent.generate()` / `Agent.stream()`.
- **Delegation controls:** Installed `@mastra/core@1.25.0` types include `delegation` hooks, `messageFilter`, `onIterationComplete`, and `isTaskComplete` in `AgentExecutionOptions`.
- **Workflows:** Mastra workflows are the right primitive for deterministic orchestration. Docs and installed code support calling agents from workflow steps and composing agents/tools as steps with `createStep()`.
- **Application registry:** `Mastra` supports `agents`, `workflows`, `listAgents()`, `addAgent()`, `listWorkflows()`, and `addWorkflow()`. This helps at runtime but does not replace our need for local code organization.
- **MCP:** MCP can expose agents and workflows as tools to external systems. It is not the first internal multi-agent management primitive for this codebase.
- **`.network()`:** Do not build new functionality on `.network()`. The latest docs mark agent networks as deprecated and recommend supervisor agents instead.

### Sources

- Official: `https://mastra.ai/docs/agents/supervisor-agents`
- Official: `https://mastra.ai/guides/migrations/network-to-supervisor`
- Official: `https://mastra.ai/docs/agents/networks`
- Official: `https://mastra.ai/docs/workflows/agents-and-tools`
- Local types: `packages/platform/node_modules/@mastra/core/dist/agent/agent.types.d.ts`
- Local types: `packages/platform/node_modules/@mastra/core/dist/agent/types.d.ts`
- Local types: `packages/platform/node_modules/@mastra/core/dist/mastra/index.d.ts`

---

## Strategy Decision

### Option A: Keep Manual Registration

Continue adding imports directly in `create-mastra.ts`.

**Pros:** Minimal change, low risk.

**Cons:** Does not scale; registration, tests, and docs drift as agent count grows.

### Option B: Use Deprecated `.network()`

Create a routing agent and call `agent.network()`.

**Pros:** Installed package has the API and network event stream.

**Cons:** Official docs mark it deprecated. New work would start on a path scheduled for removal.

### Option C: Registry + Supervisor Agents + Workflows

Create local registries, add safe specialist agents, add a supervisor agent using `agents`/`workflows`, and expose a project-scoped Tier B route.

**Pros:** Aligns with current Mastra guidance, keeps deterministic flows deterministic, keeps project authorization in platform services, and gives us one place to add future agents.

**Cons:** Requires coordinated refactor and more tests up front.

**Decision:** Choose Option C.

---

## Success Criteria

- `createMastra()` delegates agent and workflow construction to local registries.
- A new read-only `workspaceReviewer` specialist is registered and exposed on Tier A.
- A new `workspace-supervisor` agent is registered and can delegate to read-only specialists without exposing write-capable tools by default.
- A new project-scoped Tier B route runs the supervisor with project authorization and a resolved workspace.
- Unit tests prove registry contents, tool permissions, and supervisor subagent wiring.
- Integration tests prove the supervisor service rejects invalid input without model calls and can call the model when `OPENROUTER_API_KEY` is present.
- App integration tests prove auth, query-version pass-through, and route wiring with a stubbed service.
- Live Worker E2E optionally proves the deployed-style `/api/projects/:projectId/supervise` path works through Wrangler.
- `02_adding_agents_and_workflows.md` is updated after implementation to replace stale direct `new Agent(...)` guidance with registry + `buildWorkspaceAgent()` guidance.

---

## Non-Negotiable Constraints

- Do not use `.network()` for new implementation.
- Every workspace-aware agent must use `buildWorkspaceAgent()` unless there is a documented reason not to.
- Every agent memory path must preserve `observationalMemory: false`.
- Do not share Worker I/O objects across requests.
- Do not make Tier A `/api/mastra/*` responsible for project authorization or workspace resolution.
- Do not include the write-capable `projectAgent` as a supervisor subagent in the first iteration.
- Do not rely on subagent version overrides until verified against the installed package types and E2E behavior. Direct supervisor version targeting can use existing `getAgentWithVersion()`.

---

## Phase 1: Registry Foundation

### Task 1.1: Add Workflow Registry

**Files:**

- Create: `packages/platform/src/mastra/workflows/registry.ts`
- Modify: `packages/platform/src/mastra/create-mastra.ts`
- Modify: `packages/platform/src/index.ts`
- Create: `packages/platform/test/unit/mastra-registry.test.ts`
- Test: `packages/platform/test/unit/create-mastra.test.ts`

**Step 1: Write failing unit expectations**

Create `packages/platform/test/unit/mastra-registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createWorkflowRegistry } from '../../src/mastra/workflows/registry';

describe('createWorkflowRegistry', () => {
  it('returns all code-defined workflows', () => {
    const workflows = createWorkflowRegistry();

    expect(Object.keys(workflows)).toEqual(expect.arrayContaining(['ingestPipeline']));
    expect(workflows.ingestPipeline).toBeDefined();
  });
});
```

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/mastra-registry.test.ts
```

Expected: FAIL with "Cannot find module '../../src/mastra/workflows/registry'".

**Step 2: Add registry**

```ts
// packages/platform/src/mastra/workflows/registry.ts
// ABOUTME: Central registry for all code-defined Mastra workflows.
// ABOUTME: createMastra consumes this so workflow registration stays one-line per workflow.

import { createIngestPipelineWorkflow } from './ingest-pipeline';

export function createWorkflowRegistry() {
  return {
    ingestPipeline: createIngestPipelineWorkflow(),
  };
}

export type WorkflowRegistry = ReturnType<typeof createWorkflowRegistry>;
```

**Step 3: Use registry in `create-mastra.ts`**

```ts
import { createWorkflowRegistry } from './workflows/registry';

export function createMastra(connectionString: string, agentConfig?: ProjectAgentConfig) {
  const workflows = createWorkflowRegistry();

  return new Mastra({
    agents: {
      projectAgent: createProjectAgent(agentConfig),
      summarizer: createSummarizerAgent(agentConfig),
    },
    workflows,
    storage: createMastraStorage(connectionString),
    editor: new MastraEditor(),
  });
}
```

**Step 4: Export registry**

```ts
// packages/platform/src/index.ts
export * from './mastra/workflows/registry';
```

**Step 5: Verify**

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/mastra-registry.test.ts
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: tests and typecheck pass.

### Task 1.2: Add Agent Registry

**Files:**

- Create: `packages/platform/src/mastra/agents/registry.ts`
- Modify: `packages/platform/src/mastra/create-mastra.ts`
- Modify: `packages/platform/src/index.ts`
- Modify: `packages/platform/test/unit/mastra-registry.test.ts`
- Test: `packages/platform/test/unit/create-mastra.test.ts`

**Step 1: Write failing registry assertions**

Add to `packages/platform/test/unit/mastra-registry.test.ts`:

```ts
import { createAgentRegistry } from '../../src/mastra/agents/registry';

describe('createAgentRegistry', () => {
  it('returns all code-defined base agents', () => {
    const workflows = createWorkflowRegistry();
    const agents = createAgentRegistry({}, { workflows });

    expect(Object.keys(agents)).toEqual(expect.arrayContaining(['projectAgent', 'summarizer']));
  });
});
```

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/mastra-registry.test.ts
```

Expected: FAIL with "Cannot find module '../../src/mastra/agents/registry'".

**Step 2: Add registry**

```ts
// packages/platform/src/mastra/agents/registry.ts
// ABOUTME: Central registry for all code-defined Mastra agents.
// ABOUTME: Keeps createMastra small as specialist and supervisor agents grow.

import type { WorkflowRegistry } from '../workflows/registry';
import { createProjectAgent } from './project-agent';
import type { ProjectAgentConfig } from './project-agent';
import { createSummarizerAgent } from './summarizer';

export type AgentRegistryDeps = {
  workflows: WorkflowRegistry;
};

export function createAgentRegistry(
  config: ProjectAgentConfig = {},
  _deps?: AgentRegistryDeps,
) {
  return {
    projectAgent: createProjectAgent(config),
    summarizer: createSummarizerAgent(config),
  };
}

export type AgentRegistry = ReturnType<typeof createAgentRegistry>;
```

**Step 3: Use registry in `create-mastra.ts`**

```ts
import { createAgentRegistry } from './agents/registry';
import { createWorkflowRegistry } from './workflows/registry';

export function createMastra(connectionString: string, agentConfig?: ProjectAgentConfig) {
  const workflows = createWorkflowRegistry();
  const agents = createAgentRegistry(agentConfig, { workflows });

  return new Mastra({
    agents,
    workflows,
    storage: createMastraStorage(connectionString),
    editor: new MastraEditor(),
  });
}
```

**Step 4: Export registry**

```ts
// packages/platform/src/index.ts
export * from './mastra/agents/registry';
```

**Step 5: Verify**

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/mastra-registry.test.ts
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: tests and typecheck pass.

---

## Phase 2: Extend Agent Factory For Supervisor Composition

### Task 2.1: Add Agent/Workflow/Default Option Support To `buildWorkspaceAgent()`

**Files:**

- Modify: `packages/platform/src/mastra/agents/build-agent.ts`
- Create: `packages/platform/test/unit/build-workspace-agent.test.ts`
- Test: `packages/platform/test/unit/create-mastra.test.ts`

**Step 1: Write failing factory test**

Create `packages/platform/test/unit/build-workspace-agent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildWorkspaceAgent } from '../../src/mastra/agents/build-agent';

describe('buildWorkspaceAgent', () => {
  it('can attach subagents, workflows, and default execution options for supervisor agents', async () => {
    const child = buildWorkspaceAgent({
      id: 'child-agent',
      name: 'Child Agent',
      description: 'Test child.',
      instructions: () => 'child',
      toolkit: {},
      config: { openrouterApiKey: 'test-key' },
    });

    const parent = buildWorkspaceAgent({
      id: 'parent-agent',
      name: 'Parent Agent',
      description: 'Test parent.',
      instructions: () => 'parent',
      toolkit: {},
      config: { openrouterApiKey: 'test-key' },
      agents: { child },
      workflows: {},
      defaultOptions: { maxSteps: 3 },
    });

    await expect(parent.listAgents()).resolves.toMatchObject({ child });
    await expect(parent.listWorkflows()).resolves.toEqual({});
    await expect(parent.getDefaultOptions()).resolves.toMatchObject({ maxSteps: 3 });
  });
});
```

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/build-workspace-agent.test.ts
```

Expected: FAIL because `WorkspaceAgentInput` does not accept `agents`, `workflows`, or `defaultOptions`.

**Step 2: Update factory input type**

```ts
// packages/platform/src/mastra/agents/build-agent.ts
import type { AgentExecutionOptions } from '@mastra/core/agent';
import type { Workflow } from '@mastra/core/workflows';

type AgentMap = Record<string, Agent<string, ToolsInput, undefined, ProjectAgentRequestContext>>;
type WorkflowMap = Record<string, Workflow<any, any, any, any, any, any, any, any>>;

export type WorkspaceAgentInput<TId extends string, TToolkit extends Toolkit> = {
  id: TId;
  name: string;
  description: string;
  instructions: InstructionsFn;
  toolkit: TToolkit;
  config?: AgentModelConfig;
  agents?: AgentMap;
  workflows?: WorkflowMap;
  defaultOptions?: AgentExecutionOptions;
};
```

The installed package exports `AgentExecutionOptions` from `@mastra/core/agent` through `dist/agent/index.d.ts`, so this import should work. If a future package version changes that export, use `Parameters<Agent['stream']>[1]` as a local type fallback.

**Step 3: Pass options through**

```ts
return new Agent<TId, TToolkit, undefined, ProjectAgentRequestContext>({
  id,
  name,
  description,
  instructions,
  model: () => resolveOpenRouterModel(config),
  memory: new Memory({ options: WORKSPACE_AGENT_MEMORY_OPTIONS }),
  workspace: ({ requestContext }) => requestContext.get('workspace'),
  tools: () => toolkit,
  ...(agents ? { agents } : {}),
  ...(workflows ? { workflows } : {}),
  ...(defaultOptions ? { defaultOptions } : {}),
});
```

**Step 4: Verify type imports**

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/build-workspace-agent.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: typecheck passes. If the Mastra type surface is difficult, simplify by using `unknown`/`never` casts inside the factory only, not at call sites.

---

## Phase 3: Add A Safe Read-Only Specialist

### Task 3.1: Add `workspaceReviewer` Agent

**Files:**

- Create: `packages/platform/src/mastra/agents/workspace-reviewer.ts`
- Modify: `packages/platform/src/mastra/agents/registry.ts`
- Modify: `packages/platform/src/index.ts`
- Test: `packages/platform/test/unit/create-mastra.test.ts`

**Step 1: Write failing test**

Add:

```ts
it('registers workspaceReviewer with read-only tools', async () => {
  const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');
  const reviewer = mastra.getAgent('workspaceReviewer');
  const tools = await resolveAgentTools(reviewer as never);

  expect(reviewer).toBeDefined();
  expect(Object.keys(tools ?? {}).sort()).toEqual(['listDir', 'readFile']);
});
```

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
```

Expected: FAIL because `workspaceReviewer` is not registered.

**Step 2: Add agent**

```ts
// packages/platform/src/mastra/agents/workspace-reviewer.ts
// ABOUTME: Read-only specialist that reviews workspace files for risks and gaps.
// ABOUTME: Intended for supervisor delegation; never receives write tools.

import { workspaceReadOnlyToolkit } from '../tools/workspace-tools';
import { buildWorkspaceAgent } from './build-agent';
import type { ProjectAgentConfig } from './project-agent';

export function createWorkspaceReviewerAgent(config: ProjectAgentConfig = {}) {
  return buildWorkspaceAgent({
    id: 'workspace-reviewer' as const,
    name: 'Workspace Reviewer',
    description: [
      'Reviews workspace files for implementation risks, missing tests, stale docs, and architectural inconsistencies.',
      'Returns concise findings with file-path citations.',
      'Does not modify files or write code.',
    ].join(' '),
    instructions: ({ requestContext }) => [
      'You are a read-only reviewer for a project workspace.',
      'Inspect relevant files with listDir and readFile before making claims.',
      'Return findings ordered by severity. Include exact file paths when possible.',
      'Do not write or modify files.',
      `Project: ${requestContext.get('projectId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    toolkit: workspaceReadOnlyToolkit,
    config,
  });
}
```

**Step 3: Register and export**

```ts
// packages/platform/src/mastra/agents/registry.ts
import { createWorkspaceReviewerAgent } from './workspace-reviewer';

export function createAgentRegistry(config: ProjectAgentConfig = {}, deps?: AgentRegistryDeps) {
  return {
    projectAgent: createProjectAgent(config),
    summarizer: createSummarizerAgent(config),
    workspaceReviewer: createWorkspaceReviewerAgent(config),
  };
}
```

```ts
// packages/platform/src/index.ts
export * from './mastra/agents/workspace-reviewer';
```

**Step 4: Verify**

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: tests and typecheck pass.

---

## Phase 4: Add Supervisor Agent

### Task 4.1: Add `workspace-supervisor` Agent

**Files:**

- Create: `packages/platform/src/mastra/agents/workspace-supervisor.ts`
- Modify: `packages/platform/src/mastra/agents/registry.ts`
- Modify: `packages/platform/src/index.ts`
- Test: `packages/platform/test/unit/create-mastra.test.ts`

**Step 1: Write failing tests**

Add:

```ts
it('registers workspace-supervisor with specialist subagents and workflows', async () => {
  const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');
  const supervisor = mastra.getAgent('workspace-supervisor');

  expect(supervisor).toBeDefined();
  const subagents = await supervisor.listAgents();
  expect(Object.keys(subagents)).toEqual(expect.arrayContaining(['summarizer', 'workspaceReviewer']));
  expect(Object.keys(subagents)).not.toContain('projectAgent');

  const workflows = await supervisor.listWorkflows();
  expect(Object.keys(workflows)).toEqual(expect.arrayContaining(['ingestPipeline']));
});
```

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
```

Expected: FAIL because the supervisor is not registered.

**Step 2: Add supervisor factory**

```ts
// packages/platform/src/mastra/agents/workspace-supervisor.ts
// ABOUTME: Supervisor agent for coordinating safe read-only workspace specialists.
// ABOUTME: Uses normal generate/stream supervisor behavior; do not use deprecated .network().

import type { Agent } from '@mastra/core/agent';
import type { Workflow } from '@mastra/core/workflows';

import { workspaceReadOnlyToolkit } from '../tools/workspace-tools';
import { buildWorkspaceAgent } from './build-agent';
import type { ProjectAgentConfig } from './project-agent';

export type WorkspaceSupervisorDeps = {
  agents: Record<string, Agent>;
  workflows: Record<string, Workflow<any, any, any, any, any, any, any, any>>;
};

export function createWorkspaceSupervisorAgent(
  deps: WorkspaceSupervisorDeps,
  config: ProjectAgentConfig = {},
) {
  return buildWorkspaceAgent({
    id: 'workspace-supervisor' as const,
    name: 'Workspace Supervisor',
    description: [
      'Coordinates read-only workspace specialists for project analysis, summarization, and review.',
      'Use when a request may require more than one specialist or a workflow.',
    ].join(' '),
    instructions: ({ requestContext }) => [
      'You coordinate safe read-only specialists for a project workspace.',
      'Available specialists:',
      '- summarizer: summarizes selected workspace documents.',
      '- workspaceReviewer: reviews files for risks, stale docs, and missing tests.',
      'Available workflows:',
      '- ingestPipeline: lists markdown files and summarizes them.',
      'Delegate when a specialist is better suited than answering directly.',
      'Synthesize specialist results into one concise final answer.',
      'Do not claim file facts unless a specialist or workflow inspected the workspace.',
      `Project: ${requestContext.get('projectId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    toolkit: workspaceReadOnlyToolkit,
    agents: deps.agents,
    workflows: deps.workflows,
    defaultOptions: {
      maxSteps: 8,
      delegation: {
        messageFilter: ({ messages }) => messages.slice(-12),
      },
      onIterationComplete: ({ iteration, text }) => {
        if (iteration >= 8) {
          return {
            continue: false,
            feedback: 'Stop delegation and synthesize the best available answer.',
          };
        }
        if (text.length > 1200) {
          return { continue: false };
        }
        return { continue: true };
      },
    },
    config,
  });
}
```

If `defaultOptions` functions do not typecheck cleanly because of exact Mastra generics, keep `maxSteps` and `delegation.messageFilter` and move `onIterationComplete` to the Tier B service call options in Phase 5.

**Step 3: Register supervisor after specialists**

```ts
// packages/platform/src/mastra/agents/registry.ts
import { createWorkspaceSupervisorAgent } from './workspace-supervisor';

export function createAgentRegistry(config: ProjectAgentConfig = {}, deps: AgentRegistryDeps) {
  const projectAgent = createProjectAgent(config);
  const summarizer = createSummarizerAgent(config);
  const workspaceReviewer = createWorkspaceReviewerAgent(config);
  const workspaceSupervisor = createWorkspaceSupervisorAgent(
    {
      agents: {
        summarizer,
        workspaceReviewer,
      },
      workflows: {
        ingestPipeline: deps.workflows.ingestPipeline,
      },
    },
    config,
  );

  return {
    projectAgent,
    summarizer,
    workspaceReviewer,
    'workspace-supervisor': workspaceSupervisor,
  };
}
```

Use the string key `'workspace-supervisor'` intentionally. It makes the Mastra registry key match the agent ID and avoids `getAgent()` vs `getAgentById()` ambiguity in version-targeted helpers.

**Step 4: Export**

```ts
// packages/platform/src/index.ts
export * from './mastra/agents/workspace-supervisor';
```

**Step 5: Verify**

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: tests and typecheck pass.

---

## Phase 5: Add Project-Scoped Supervisor Service

### Task 5.1: Add `runWorkspaceSupervisorForPrincipal()`

**Files:**

- Create: `packages/platform/src/services/supervisor.ts`
- Modify: `packages/platform/src/index.ts`
- Test: `packages/platform/test/integration/workspace-supervisor.integration.test.ts`

**Step 1: Write invalid-input integration test first**

```ts
// packages/platform/test/integration/workspace-supervisor.integration.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';

describe('runWorkspaceSupervisorForPrincipal', () => {
  beforeEach(async () => {
    await pool.query(`
      truncate table
        channel_threads,
        project_channels,
        workspace_provisioning_jobs,
        workspace_events,
        workspace_locks,
        workspace_bindings,
        workspace_roots,
        organization_memberships,
        projects,
        users,
        organizations
      restart identity cascade
    `);
  });

  it('rejects an empty prompt before calling the agent', async () => {
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const { runWorkspaceSupervisorForPrincipal } = await import('../../src/services/supervisor');
    const fixture = await seedProjectFixture();

    await expect(
      runWorkspaceSupervisorForPrincipal(
        {
          firebaseUid: fixture.user.firebaseUid,
          projectId: fixture.project.id,
          prompt: '   ',
        },
        {
          mastra: {} as never,
          workspaceFactory: fixture.workspaceFactory,
        },
      ),
    ).rejects.toThrow('Prompt is required');
  });
});
```

Run:

```bash
pnpm test:integration -- --run packages/platform/test/integration/workspace-supervisor.integration.test.ts
```

Expected: FAIL because the service does not exist.

**Step 2: Add service**

```ts
// packages/platform/src/services/supervisor.ts
// ABOUTME: Project-scoped Tier B surface for the workspace supervisor agent.
// ABOUTME: Handles authorization, workspace resolution, context seeding, and response shaping.

import { buildExecutionContext } from '../mastra/execution/build-execution-context';
import { getAgentWithVersion, type AgentVersionOpts } from '../mastra/version';
import type { PlatformDeps } from '../platform-deps';
import { resolveWorkspaceForProject } from '../workspace/resolver';
import { AccessDeniedError } from './access-control';
import { loadProjectContext } from './project-context';

export type WorkspaceSupervisorInput = {
  firebaseUid: string;
  projectId: string;
  prompt: string;
  paths?: string[];
};

export type WorkspaceSupervisorResult = {
  projectId: string;
  text: string;
  runId?: string;
  modelId?: string;
};

function deriveResourceId(projectId: string) {
  return `harness:workspace-supervisor:project:${projectId}`;
}

function deriveThreadId() {
  return `workspace-supervisor:${Date.now()}`;
}

function renderPrompt(input: WorkspaceSupervisorInput) {
  const prompt = input.prompt.trim();
  const paths = input.paths?.filter((path) => path.trim().length > 0) ?? [];

  return [
    prompt,
    ...(paths.length > 0
      ? ['', 'Relevant workspace paths:', ...paths.map((path) => `- ${path}`)]
      : []),
  ].join('\n');
}

export async function runWorkspaceSupervisorForPrincipal(
  input: WorkspaceSupervisorInput,
  deps: PlatformDeps & { version?: AgentVersionOpts },
): Promise<WorkspaceSupervisorResult> {
  if (input.prompt.trim().length === 0) {
    throw new AccessDeniedError('Prompt is required');
  }

  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolved = await resolveWorkspaceForProject(input.projectId, {
    workspaceFactory: deps.workspaceFactory,
  });
  const execution = buildExecutionContext({
    projectContext,
    workspaceRootPath: resolved.root.root_path,
    workspace: resolved.workspace,
    resourceId: deriveResourceId(input.projectId),
    threadId: deriveThreadId(),
  });

  const agent = await getAgentWithVersion(deps.mastra, 'workspace-supervisor', deps.version);
  const output = await agent.generate(renderPrompt(input), {
    requestContext: execution.requestContext,
    memory: { thread: execution.threadId, resource: execution.resourceId },
    maxSteps: 8,
    delegation: {
      messageFilter: ({ messages }) => messages.slice(-12),
    },
  });

  return {
    projectId: input.projectId,
    text: output.text,
    ...(output.runId ? { runId: output.runId } : {}),
    ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
  };
}
```

If the installed `generate()` options type rejects `delegation` at compile time, first confirm the import path and version. The local type file `dist/agent/agent.types.d.ts` contains `delegation?: DelegationConfig` in `AgentExecutionOptionsBase`; do not silently drop the hook without documenting why.

**Step 3: Export service**

```ts
// packages/platform/src/index.ts
export * from './services/supervisor';
```

**Step 4: Add model-backed integration test**

```ts
it.skipIf(!process.env.OPENROUTER_API_KEY)(
  'returns a model reply for an authorized project',
  { timeout: 90_000 },
  async () => {
    const { createMastra } = await import('../../src/mastra/create-mastra');
    const { seedProjectFixture } = await import('../helpers/fixtures');
    const { runWorkspaceSupervisorForPrincipal } = await import('../../src/services/supervisor');

    const fixture = await seedProjectFixture();
    const mastra = createMastra(process.env.DATABASE_URL!, {
      openrouterApiKey: process.env.OPENROUTER_API_KEY!,
      openrouterModel: process.env.OPENROUTER_MODEL,
    });

    try {
      const result = await runWorkspaceSupervisorForPrincipal(
        {
          firebaseUid: fixture.user.firebaseUid,
          projectId: fixture.project.id,
          prompt: 'Review the workspace at a high level and reply with one short sentence.',
          paths: ['README.md'],
        },
        { mastra, workspaceFactory: fixture.workspaceFactory },
      );

      expect(result.projectId).toBe(fixture.project.id);
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
    } finally {
      await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
    }
  },
);
```

**Step 5: Verify**

Run:

```bash
pnpm test:integration -- --run packages/platform/test/integration/workspace-supervisor.integration.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: invalid-input test passes always; model-backed test passes when `OPENROUTER_API_KEY` is set and is skipped otherwise.

---

## Phase 6: Add Tier B HTTP Route In Node App And Worker

### Task 6.1: Add Node App Route With Injectable Test Stub

**Files:**

- Modify: `packages/app/src/server/factory.ts`
- Test: `packages/app/test/integration/authenticated-routes.integration.test.ts`
- Test: `packages/app/test/integration/agent-version-targeting.integration.test.ts`

**Step 1: Add failing authenticated route test**

In `authenticated-routes.integration.test.ts`, add:

```ts
it('executes the workspace supervisor wrapper for authenticated project supervision', async () => {
  const app = await createApp({
    tokenVerifier: {
      async verifyIdToken() {
        return verifiedPrincipal;
      },
    },
    runWorkspaceSupervisor: async ({ projectId, prompt, paths }) => ({
      projectId,
      text: `supervised:${prompt}:${paths?.join(',') ?? ''}`,
    }),
  });

  const response = await app.request('/api/projects/project-1/supervise', {
    method: 'POST',
    headers: {
      authorization: 'Bearer demo-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prompt: 'review', paths: ['README.md'] }),
  });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    projectId: 'project-1',
    text: 'supervised:review:README.md',
  });
});
```

Run:

```bash
pnpm test:unit -- --run packages/app/test/integration/authenticated-routes.integration.test.ts
```

Expected: FAIL because `runWorkspaceSupervisor` factory param and route do not exist.

**Step 2: Add app factory param**

Add to `AppFactoryParams`:

```ts
runWorkspaceSupervisor?: (
  input: {
    firebaseUid: string;
    projectId: string;
    prompt: string;
    paths?: string[];
  },
  deps?: {
    version?: { versionId: string } | { status: 'draft' | 'published' };
  },
) => Promise<{
  projectId: string;
  text: string;
  runId?: string;
  modelId?: string;
}>;
```

**Step 3: Register route**

```ts
import {
  runWorkspaceSupervisorForPrincipal,
  // existing imports...
} from '@hono-workspace/platform';

app.post('/api/projects/:projectId/supervise', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ prompt?: string; paths?: string[] }>();
  const version = parseAgentVersionFromQuery({
    get: (name: string) => c.req.query(name) ?? null,
  });
  const input = {
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    prompt: body.prompt ?? '',
    ...(Array.isArray(body.paths) ? { paths: body.paths } : {}),
  };
  const depArg = version ? { version } : undefined;
  const result = params.runWorkspaceSupervisor
    ? await params.runWorkspaceSupervisor(input, depArg)
    : await runWorkspaceSupervisorForPrincipal(input, {
        ...platformDeps,
        ...(version ? { version } : {}),
      });

  return c.json(result);
});
```

Place it near `/api/projects/:projectId/summarize` so version targeting patterns stay grouped.

**Step 4: Add version pass-through tests**

Mirror `packages/app/test/integration/agent-version-targeting.integration.test.ts` for `/supervise`:

- `?versionId=...` passes `{ versionId }`.
- `?status=draft` passes `{ status: 'draft' }`.
- no query omits version.

**Step 5: Verify**

Run:

```bash
pnpm test:unit -- --run packages/app/test/integration/authenticated-routes.integration.test.ts
pnpm test:unit -- --run packages/app/test/integration/agent-version-targeting.integration.test.ts
pnpm --filter @hono-workspace/app typecheck
```

Expected: tests and typecheck pass.

### Task 6.2: Add Worker Route

**Files:**

- Modify: `packages/worker/src/index.ts`
- Test: `packages/worker/test/live/supervisor.e2e.test.ts`

**Step 1: Register Worker route**

```ts
import {
  runWorkspaceSupervisorForPrincipal,
  // existing imports...
} from '@hono-workspace/platform';

app.post('/api/projects/:projectId/supervise', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const workspaceFactory = c.get('workspaceFactory');
  const body = await c.req.json<{ prompt?: string; paths?: string[] }>();
  const version = parseAgentVersionFromQuery({
    get: (name: string) => c.req.query(name) ?? null,
  });
  const result = await runWorkspaceSupervisorForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    prompt: body.prompt ?? '',
    ...(Array.isArray(body.paths) ? { paths: body.paths } : {}),
  }, { mastra, workspaceFactory, ...(version ? { version } : {}) });

  return c.json(result);
});
```

**Step 2: Add live E2E test**

```ts
// packages/worker/test/live/supervisor.e2e.test.ts
import { afterAll, describe, expect, it } from 'vitest';

import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(
  baseUrl &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  process.env.OPENROUTER_API_KEY,
);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const user of createdUsers) await user.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('POST /api/projects/:projectId/supervise', { timeout: 180_000 }, () => {
  it('runs the workspace supervisor after project bootstrap', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `supervisor-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    const { projectId } = await bootstrap.json() as { projectId: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/supervise`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Review this empty demo workspace and return one short sentence.',
        paths: ['README.md'],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { text?: string; projectId?: string };
    expect(body.projectId).toBe(projectId);
    expect(typeof body.text).toBe('string');
    expect(body.text!.length).toBeGreaterThan(0);
  });
});
```

**Step 3: Verify**

Run:

```bash
pnpm --filter @hono-workspace/worker typecheck
pnpm test:e2e
```

Expected: typecheck passes. The orchestrator runs the full live suite; the new supervisor E2E passes when live-test env vars are present and skips otherwise. If targeted live runs become necessary, first update `packages/worker/scripts/run-e2e.mjs` to forward extra Vitest args.

---

## Phase 7: Tier A Coverage For New Agents

### Task 7.1: Update Mastra Native Route Tests

**Files:**

- Modify: `packages/app/test/integration/mastra-native.integration.test.ts`
- Modify: `packages/worker/test/live/mastra-native.e2e.test.ts`

**Step 1: Update list assertions**

Expect the native `/api/mastra/agents` list to include:

```ts
expect(Object.keys(body)).toEqual(expect.arrayContaining([
  'project-agent',
  'summarizer',
  'workspace-reviewer',
  'workspace-supervisor',
]));
```

If the response keys are registry keys rather than agent IDs in the current MastraServer version, assert the observed key names and document the distinction in `01_technical_architecture.md`.

**Step 2: Add lightweight Tier A generate test for reviewer**

Add a Worker live test similar to summarizer:

```ts
const res = await fetch(`${baseUrl}/api/mastra/agents/workspace-reviewer/generate`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${user.idToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    messages: 'Say ok in one word.',
    memory: { thread: 'e2e-reviewer', resource: 'harness:tier-a:project:e2e' },
    requestContext: {
      projectId: 'e2e-project',
      organizationId: 'e2e-org',
      role: 'owner',
    },
  }),
});
```

**Step 3: Verify**

Run:

```bash
pnpm test:unit -- --run packages/app/test/integration/mastra-native.integration.test.ts
pnpm test:e2e
```

Expected: app integration passes. The orchestrator runs the full live suite; new native-route assertions pass or skip based on env.

---

## Phase 8: Documentation Updates

### Task 8.1: Update `02_adding_agents_and_workflows.md`

**Files:**

- Modify: `.ai/knowledges/02_adding_agents_and_workflows.md`
- Modify: `.ai/knowledges/01_technical_architecture.md`

**Step 1: Replace stale direct-agent construction**

Replace the current "Copy summarizer and use `new Agent(...)`" recipe with:

- Use `buildWorkspaceAgent()`.
- Choose `workspaceReadOnlyToolkit` or `workspaceToolkit`.
- Register via `agents/registry.ts`.
- Export from `src/index.ts`.
- Use Tier A automatically.
- Add Tier B service/route only when project semantics are needed.

**Step 2: Add supervisor guidance**

Add a section:

```md
## Add a supervisor agent

Use a supervisor when the task may need multiple specialists and the route should let the model decide delegation order. Do not use deprecated `.network()`. Configure specialists on the supervisor's `agents` property and call the supervisor with normal `.generate()` or `.stream()`.
```

Include a code sample based on `createWorkspaceSupervisorAgent()`.

**Step 3: Update workflow guidance**

Keep workflow guidance but add:

- Prefer workflows for known execution graphs.
- Workflows may call agents from `execute()` or compose an agent with `createStep(agent)`.
- In Worker routes, the workflow must complete within the request's I/O lifetime unless an external durable execution system is introduced.

**Step 4: Update architecture doc**

Add concise entries for:

- `mastra/agents/registry`
- `mastra/workflows/registry`
- `workspace-reviewer`
- `workspace-supervisor`
- `/api/projects/:projectId/supervise`

**Step 5: Verify docs**

Run:

```bash
rg -n "new Agent|\\.network\\(|setWorkspaceFactory|getWorkspaceFactory|workspace/factory" .ai/knowledges/02_adding_agents_and_workflows.md .ai/knowledges/01_technical_architecture.md
```

Expected:

- `new Agent` appears only when describing a low-level escape hatch or Mastra primitive, not as the recommended recipe.
- `.network()` appears only in "do not use/deprecated" context.
- no stale global workspace factory references.

---

## Phase 9: Full Verification

### Task 9.1: Run Focused Verification

Run:

```bash
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
pnpm test:unit -- --run packages/platform/test/unit/workspace-tools.test.ts
pnpm test:unit -- --run packages/platform/test/unit/build-execution-context.test.ts
pnpm test:unit -- --run packages/app/test/integration/authenticated-routes.integration.test.ts
pnpm test:unit -- --run packages/app/test/integration/agent-version-targeting.integration.test.ts
pnpm test:integration -- --run packages/platform/test/integration/workspace-supervisor.integration.test.ts
pnpm --filter @hono-workspace/platform typecheck
pnpm --filter @hono-workspace/app typecheck
pnpm --filter @hono-workspace/worker typecheck
```

Expected: all pass; model-backed integration skips if `OPENROUTER_API_KEY` is not set.

### Task 9.2: Run Broad Verification

Run:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

Expected:

- Unit passes.
- Integration passes when Neon/OpenRouter/Firebase test env is configured; otherwise document any intentional skips.
- E2E passes when live-test env is configured; otherwise document skips.

Do not claim completion until the actual command outputs are read.

---

## Rollback Plan

If supervisor behavior is unstable or too expensive:

1. Keep Phase 1 registries and Phase 3 `workspaceReviewer`.
2. Remove or do not register `workspace-supervisor`.
3. Remove `/api/projects/:projectId/supervise`.
4. Keep documentation explaining that deterministic workflows are the recommended multi-agent path until supervisor behavior is re-evaluated.

If registry refactor causes type instability:

1. Keep `createWorkflowRegistry()`.
2. Revert `createAgentRegistry()` only.
3. Continue registering agents manually until the factory generics are simplified.

---

## Open Questions To Resolve During Implementation

- Does `MastraServer` return agent list keys by registry key or by agent `id` for newly hyphenated agent IDs? Tests should document observed behavior.
- Does `@mastra/editor@0.7.16` fully support editing supervisor agents with `agents`/`workflows` configured, or only base fields like instructions/model/tools?
- Can direct supervisor version targeting with `getAgentWithVersion(..., 'workspace-supervisor', version)` work with stored overrides in the same way as `summarizer`?
- Are delegation hooks preserved when an editor-stored override hydrates a supervisor agent?
- Should supervisor subagent version overrides be supported in a later phase? The latest docs mention it, but it must be verified against installed package types and HTTP behavior before relying on it.
