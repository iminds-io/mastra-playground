# Workspace-Scoped Mastra Gateway Implementation Plan

> **For coworkers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.
>
> **Historical naming note:** This plan was authored before the hard-cut rename from `workspace` to `mindspace` and from `hono-workspace` to `mastra-mindspace`. Read project-owned `workspace` references here as `mindspace`. Preserve library-owned names such as `@mastra/core/workspace` and `Workspace`.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Priority**: High
**Estimated Effort**: 1-2 focused sessions
**Dependencies**: Task 03 native Mastra multi-agent orchestration is implemented; `.ai/analyses/02_native_mastra_multi_agent_runtime_analysis.md` is updated with the workspace-scoped gateway decision.

**Goal:** Make the project/workspace the primary product surface for Mastra operations by adding `/api/projects/:projectId/mastra/*`, a workspace-scoped gateway that lists and runs permitted Mastra agents/workflows with trusted server-built context.

**Architecture:** Keep `/api/mastra/*` as the native/internal Mastra surface for editor/admin/development workflows. Add a platform gateway service that authenticates project access, resolves the workspace, builds `RequestContext`, applies capability policy, and delegates to Mastra's native SDK APIs. Route handlers in `packages/app` and `packages/worker` stay thin and symmetric.

**Tech Stack:** TypeScript, Hono, Mastra `@mastra/core@1.25.0`, `@mastra/hono`, Mastra `Agent.generate()` / `Agent.stream()`, Mastra workflow `createRun().start()`, Cloudflare Workers, Neon/Postgres, Vitest.

---

## Current-State Summary

The codebase already has most required building blocks:

- `packages/platform/src/services/project-context.ts` validates Firebase principal access to a project and returns trusted `organizationId`, `projectId`, `role`, and `resourceId`.
- `packages/platform/src/workspace/resolver.ts` resolves the workspace root and creates the request-scoped `Workspace`.
- `packages/platform/src/mastra/execution/build-execution-context.ts` builds the Mastra `RequestContext` and seeds workspace, project, role, memory resource, and thread keys.
- `packages/platform/src/mastra/version.ts` parses version query params and resolves version-targeted agents.
- `packages/platform/src/mastra/agents/registry.ts` and `packages/platform/src/mastra/workflows/registry.ts` are the code-defined primitive registries.
- `packages/platform/src/services/supervisor.ts` is the best current template for a project-scoped Mastra service.
- `packages/app/src/server/factory.ts` and `packages/worker/src/index.ts` already pass `{ mastra, workspaceFactory }` to platform services.

The problem is API shape. Product clients should not call raw `/api/mastra/*` for workspace execution because raw Mastra routes do not derive trusted project membership, workspace objects, resource ids, or role from the server. Product clients also should not need one bespoke route per agent or workflow forever. The new gateway should give clients a workspace-first Mastra surface.

## Target API

Implement these product routes:

```text
GET  /api/projects/:projectId/mastra/agents
POST /api/projects/:projectId/mastra/agents/:agentId/generate
POST /api/projects/:projectId/mastra/agents/:agentId/stream

GET  /api/projects/:projectId/mastra/workflows
POST /api/projects/:projectId/mastra/workflows/:workflowId/create-run
POST /api/projects/:projectId/mastra/workflows/:workflowId/start
```

Keep these existing routes:

```text
/api/mastra/*
/api/projects/:projectId/summarize
/api/projects/:projectId/supervise
```

`/api/mastra/*` remains native/internal/admin/development. Bespoke project routes remain convenience/product-specific shortcuts over the same platform capabilities.

## Target Request/Response Contracts

### List Agents

Request:

```http
GET /api/projects/:projectId/mastra/agents
Authorization: Bearer <firebase-id-token>
```

Response:

```json
{
  "projectId": "project-1",
  "agents": [
    { "id": "summarizer", "capability": "read", "operations": ["generate", "stream"] },
    { "id": "workspaceReviewer", "capability": "read", "operations": ["generate", "stream"] },
    { "id": "workspace-supervisor", "capability": "read", "operations": ["generate", "stream"] }
  ]
}
```

Do not include `projectAgent` in the first list response unless write-capable policy is implemented in the same task. If it is included, mark it as `capability: "write"` and require owner/admin role for execution.

### Generate Agent

Request:

```json
{
  "messages": "Review README.md and summarize the current architecture.",
  "threadId": "optional-client-thread-id"
}
```

Response:

```json
{
  "projectId": "project-1",
  "agentId": "workspace-supervisor",
  "threadId": "workspace-mastra:agent:workspace-supervisor:...",
  "resourceId": "workspace-mastra:agent:workspace-supervisor:project:project-1",
  "text": "...",
  "runId": "optional",
  "modelId": "optional"
}
```

Rules:

- Accept `messages` as string or Mastra-compatible message array only if the installed `Agent.generate()` typing supports it cleanly.
- Ignore any client-supplied `resourceId`, `memory.resource`, `role`, `workspace`, `organizationId`, or `projectId` in the body.
- Support `?versionId=` and `?status=draft|published` for agents using `parseAgentVersionFromQuery()` and `getAgentWithVersion()`.

### Stream Agent

Request:

```json
{
  "messages": "Say ok in one word.",
  "threadId": "optional-client-thread-id"
}
```

Response: `text/event-stream`.

Events:

```text
event: ack
data: {"projectId":"...","agentId":"...","threadId":"...","resourceId":"..."}

event: token
data: {"text":"..."}

event: done
data: {"projectId":"...","agentId":"...","threadId":"...","text":"...","runId":"optional","modelId":"optional"}
```

Use the same `createSseResponse()` helper shape already present in `packages/app/src/server/factory.ts`.

### List Workflows

Response:

```json
{
  "projectId": "project-1",
  "workflows": [
    { "id": "ingestPipeline", "capability": "read", "operations": ["create-run", "start"] }
  ]
}
```

### Create Workflow Run

Request:

```json
{}
```

Response:

```json
{
  "projectId": "project-1",
  "workflowId": "ingestPipeline",
  "runId": "..."
}
```

### Start Workflow

Request:

```json
{
  "runId": "optional-existing-run-id",
  "inputData": { "rootPath": "/" },
  "threadId": "optional-client-thread-id"
}
```

Response:

```json
{
  "projectId": "project-1",
  "workflowId": "ingestPipeline",
  "runId": "...",
  "status": "success",
  "result": { "summary": "", "filesCount": 0 },
  "steps": {}
}
```

If `runId` is omitted, create a run server-side and start it in the same call.

## Non-Negotiable Constraints

- Do not remove `/api/mastra/*`.
- Do not make raw `/api/mastra/*` the product workspace API.
- Do not trust client-supplied project, org, role, workspace, resource, or memory context.
- Do not share Worker I/O objects across requests.
- Do not use deprecated `agent.network()`.
- Do not expose stored-agent/editor mutation through the workspace gateway in this task.
- Do not expose runtime `addAgent()` / `addWorkflow()` through the workspace gateway in this task.
- Do not include AI-assistance/co-author wording in commit messages.
- Keep changes TDD-first and commit in logical groups if committing.

## Phase 1: Registry Key/ID Rules

### Task 1.1: Add Registry Key/ID Unit Coverage

**Files:**

- Modify: `packages/platform/test/unit/mastra-registry.test.ts`
- Read: `packages/platform/src/mastra/agents/registry.ts`
- Read: `packages/platform/src/mastra/workflows/registry.ts`

**Step 1: Write failing or characterization tests**

Add tests that compare registry keys to primitive ids where the id is accessible. If the `Agent` id is not public, use `__getOverridableFields()` or another installed API only after inspecting the current object shape. If there is no clean public id accessor, add a helper in the registry module in Task 1.2 instead of reaching into private fields.

Start with workflow ids because workflow id should be available from the committed workflow object:

```ts
it('uses workflow registry keys that match workflow ids', () => {
  const workflows = createWorkflowRegistry();

  for (const [key, workflow] of Object.entries(workflows)) {
    expect(workflow.id).toBe(key);
  }
});
```

For agents, add an explicit expected exception first:

```ts
it('documents current agent registry key exceptions', () => {
  const workflows = createWorkflowRegistry();
  const agents = createAgentRegistry({}, { workflows });

  expect(Object.keys(agents)).toEqual(expect.arrayContaining([
    'projectAgent',
    'summarizer',
    'workspaceReviewer',
    'workspace-supervisor',
  ]));
  expect('projectAgent').not.toBe('project-agent');
});
```

**Step 2: Run tests**

```bash
pnpm test:unit -- --run packages/platform/test/unit/mastra-registry.test.ts
```

Expected: workflow test should either pass or reveal the public id accessor to use. The project-agent mismatch is intentionally characterized.

### Task 1.2: Add Registry Metadata And Policy Surface

**Files:**

- Create: `packages/platform/src/mastra/registry-metadata.ts`
- Modify: `packages/platform/src/index.ts`
- Modify: `packages/platform/test/unit/mastra-registry.test.ts`

**Step 1: Add metadata**

Create a small explicit metadata map. This avoids depending on private `Agent` fields and gives the gateway a policy source.

```ts
// packages/platform/src/mastra/registry-metadata.ts
// ABOUTME: Metadata for code-defined Mastra primitives used by workspace gateway policy.
// ABOUTME: Keeps route exposure explicit instead of inferring safety from object internals.

export type WorkspaceMastraCapability = 'read' | 'write';
export type WorkspaceMastraOperation =
  | 'generate'
  | 'stream'
  | 'create-run'
  | 'start';

export type WorkspaceMastraPrimitiveMetadata = {
  id: string;
  capability: WorkspaceMastraCapability;
  operations: WorkspaceMastraOperation[];
  minRole?: 'owner' | 'admin' | 'member';
  exposed: boolean;
};

export const workspaceMastraAgentMetadata = {
  projectAgent: {
    id: 'projectAgent',
    capability: 'write',
    operations: ['generate', 'stream'],
    minRole: 'owner',
    exposed: false,
  },
  summarizer: {
    id: 'summarizer',
    capability: 'read',
    operations: ['generate', 'stream'],
    exposed: true,
  },
  workspaceReviewer: {
    id: 'workspaceReviewer',
    capability: 'read',
    operations: ['generate', 'stream'],
    exposed: true,
  },
  'workspace-supervisor': {
    id: 'workspace-supervisor',
    capability: 'read',
    operations: ['generate', 'stream'],
    exposed: true,
  },
} as const satisfies Record<string, WorkspaceMastraPrimitiveMetadata>;

export const workspaceMastraWorkflowMetadata = {
  ingestPipeline: {
    id: 'ingestPipeline',
    capability: 'read',
    operations: ['create-run', 'start'],
    exposed: true,
  },
} as const satisfies Record<string, WorkspaceMastraPrimitiveMetadata>;
```

**Step 2: Export metadata**

```ts
// packages/platform/src/index.ts
export * from './mastra/registry-metadata';
```

**Step 3: Test metadata matches registries**

Add:

```ts
import {
  workspaceMastraAgentMetadata,
  workspaceMastraWorkflowMetadata,
} from '../../src/mastra/registry-metadata';

it('has metadata for every code-defined agent', () => {
  const workflows = createWorkflowRegistry();
  const agents = createAgentRegistry({}, { workflows });

  expect(Object.keys(workspaceMastraAgentMetadata).sort()).toEqual(Object.keys(agents).sort());
});

it('has metadata for every code-defined workflow', () => {
  const workflows = createWorkflowRegistry();

  expect(Object.keys(workspaceMastraWorkflowMetadata).sort()).toEqual(Object.keys(workflows).sort());
});

it('keeps exposed primitive ids aligned with registry keys unless explicitly documented', () => {
  for (const [key, metadata] of Object.entries(workspaceMastraAgentMetadata)) {
    expect(metadata.id).toBe(key);
  }
  for (const [key, metadata] of Object.entries(workspaceMastraWorkflowMetadata)) {
    expect(metadata.id).toBe(key);
  }
});
```

**Step 4: Run tests**

```bash
pnpm test:unit -- --run packages/platform/test/unit/mastra-registry.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: pass.

## Phase 2: Gateway Service Foundation

### Task 2.1: Add Gateway Types And Policy Tests

**Files:**

- Create: `packages/platform/src/services/workspace-mastra-gateway.ts`
- Create: `packages/platform/test/unit/workspace-mastra-gateway.test.ts`
- Modify: `packages/platform/src/index.ts`

**Step 1: Write policy tests first**

Create `packages/platform/test/unit/workspace-mastra-gateway.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  deriveWorkspaceMastraResourceId,
  deriveWorkspaceMastraThreadId,
  listAllowedWorkspaceAgents,
  listAllowedWorkspaceWorkflows,
} from '../../src/services/workspace-mastra-gateway';

describe('workspace Mastra gateway policy', () => {
  it('lists only exposed agents for project members', () => {
    expect(listAllowedWorkspaceAgents({ role: 'member' }).map((agent) => agent.id).sort()).toEqual([
      'summarizer',
      'workspace-supervisor',
      'workspaceReviewer',
    ]);
  });

  it('does not expose write-capable projectAgent by default', () => {
    expect(listAllowedWorkspaceAgents({ role: 'member' }).map((agent) => agent.id)).not.toContain('projectAgent');
  });

  it('lists exposed workflows for project members', () => {
    expect(listAllowedWorkspaceWorkflows({ role: 'member' }).map((workflow) => workflow.id)).toEqual([
      'ingestPipeline',
    ]);
  });

  it('derives server-owned memory resource ids', () => {
    expect(deriveWorkspaceMastraResourceId({
      projectId: 'project-1',
      primitiveKind: 'agent',
      primitiveId: 'summarizer',
    })).toBe('workspace-mastra:agent:summarizer:project:project-1');
  });

  it('uses caller thread ids only as thread ids, not resource ids', () => {
    expect(deriveWorkspaceMastraThreadId({
      primitiveKind: 'agent',
      primitiveId: 'summarizer',
      suppliedThreadId: 'client-thread',
    })).toBe('client-thread');
  });
});
```

Expected: FAIL because service does not exist.

**Step 2: Add initial service helpers**

Implement:

```ts
import type { PlatformDeps } from '../platform-deps';
import {
  workspaceMastraAgentMetadata,
  workspaceMastraWorkflowMetadata,
  type WorkspaceMastraOperation,
} from '../mastra/registry-metadata';
import { AccessDeniedError } from './access-control';

type ProjectRole = string;
type PrimitiveKind = 'agent' | 'workflow';

export type WorkspaceMastraListItem = {
  id: string;
  capability: 'read' | 'write';
  operations: WorkspaceMastraOperation[];
};

export type WorkspaceMastraGatewayDeps = PlatformDeps;

export function listAllowedWorkspaceAgents(input: { role: ProjectRole }): WorkspaceMastraListItem[] {
  return Object.values(workspaceMastraAgentMetadata)
    .filter((metadata) => metadata.exposed)
    .filter((metadata) => isRoleAllowed(input.role, metadata.minRole))
    .map(({ id, capability, operations }) => ({ id, capability, operations: [...operations] }));
}

export function listAllowedWorkspaceWorkflows(input: { role: ProjectRole }): WorkspaceMastraListItem[] {
  return Object.values(workspaceMastraWorkflowMetadata)
    .filter((metadata) => metadata.exposed)
    .filter((metadata) => isRoleAllowed(input.role, metadata.minRole))
    .map(({ id, capability, operations }) => ({ id, capability, operations: [...operations] }));
}

export function deriveWorkspaceMastraResourceId(input: {
  projectId: string;
  primitiveKind: PrimitiveKind;
  primitiveId: string;
}) {
  return `workspace-mastra:${input.primitiveKind}:${input.primitiveId}:project:${input.projectId}`;
}

export function deriveWorkspaceMastraThreadId(input: {
  primitiveKind: PrimitiveKind;
  primitiveId: string;
  suppliedThreadId?: string;
}) {
  const supplied = input.suppliedThreadId?.trim();
  if (supplied) return supplied;
  return `workspace-mastra:${input.primitiveKind}:${input.primitiveId}:${Date.now()}`;
}

function isRoleAllowed(role: ProjectRole, minRole?: ProjectRole) {
  if (!minRole) return true;
  if (minRole === 'owner') return role === 'owner';
  if (minRole === 'admin') return role === 'owner' || role === 'admin';
  return Boolean(role);
}

function deny(message: string): never {
  throw new AccessDeniedError(message);
}
```

Export from `packages/platform/src/index.ts`:

```ts
export * from './services/workspace-mastra-gateway';
```

**Step 3: Run tests**

```bash
pnpm test:unit -- --run packages/platform/test/unit/workspace-mastra-gateway.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: pass.

### Task 2.2: Add Shared Context Builder For Gateway

**Files:**

- Modify: `packages/platform/src/services/workspace-mastra-gateway.ts`
- Modify: `packages/platform/test/unit/workspace-mastra-gateway.test.ts`
- Create or modify integration test later in Phase 3

**Step 1: Add helper shape**

Add a non-exported helper in the service:

```ts
async function buildGatewayExecution(input: {
  firebaseUid: string;
  projectId: string;
  primitiveKind: PrimitiveKind;
  primitiveId: string;
  suppliedThreadId?: string;
}, deps: WorkspaceMastraGatewayDeps) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolved = await resolveWorkspaceForProject(input.projectId, {
    workspaceFactory: deps.workspaceFactory,
  });
  const resourceId = deriveWorkspaceMastraResourceId({
    projectId: projectContext.projectId,
    primitiveKind: input.primitiveKind,
    primitiveId: input.primitiveId,
  });
  const threadId = deriveWorkspaceMastraThreadId({
    primitiveKind: input.primitiveKind,
    primitiveId: input.primitiveId,
    suppliedThreadId: input.suppliedThreadId,
  });

  return buildExecutionContext({
    projectContext,
    workspaceRootPath: resolved.root.root_path,
    workspace: resolved.workspace,
    resourceId,
    threadId,
  });
}
```

Imports needed:

```ts
import { buildExecutionContext } from '../mastra/execution/build-execution-context';
import { resolveWorkspaceForProject } from '../workspace/resolver';
import { loadProjectContext } from './project-context';
```

**Step 2: Do not unit-test DB behavior here**

The helper uses DB-backed project context. Cover it through integration tests in later phases. Keep unit tests focused on pure policy/derivation.

**Step 3: Run typecheck**

```bash
pnpm --filter @hono-workspace/platform typecheck
```

Expected: pass.

## Phase 3: Agent Gateway Service

### Task 3.1: List Agents Service

**Files:**

- Modify: `packages/platform/src/services/workspace-mastra-gateway.ts`
- Create: `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

**Step 1: Write integration test**

Use the fixture pattern from `workspace-supervisor.integration.test.ts`.

```ts
it('lists workspace-scoped agents for an authorized project member', async () => {
  const { seedProjectFixture } = await import('../helpers/fixtures');
  const { createMastra } = await import('../../src/mastra/create-mastra');
  const { listWorkspaceMastraAgentsForPrincipal } = await import('../../src/services/workspace-mastra-gateway');

  const fixture = await seedProjectFixture();
  const mastra = createMastra(process.env.DATABASE_URL!, {
    openrouterApiKey: 'not-needed',
  });

  try {
    const result = await listWorkspaceMastraAgentsForPrincipal({
      firebaseUid: fixture.user.firebaseUid,
      projectId: fixture.project.id,
    }, { mastra, workspaceFactory: fixture.workspaceFactory });

    expect(result.projectId).toBe(fixture.project.id);
    expect(result.agents.map((agent) => agent.id).sort()).toEqual([
      'summarizer',
      'workspace-supervisor',
      'workspaceReviewer',
    ]);
    expect(result.agents.map((agent) => agent.id)).not.toContain('projectAgent');
  } finally {
    await (mastra.getStorage() as { close?: () => Promise<void> } | undefined)?.close?.();
  }
});
```

Expected: FAIL because service function does not exist.

**Step 2: Implement list function**

```ts
export async function listWorkspaceMastraAgentsForPrincipal(
  input: { firebaseUid: string; projectId: string },
  deps: WorkspaceMastraGatewayDeps,
) {
  const projectContext = await loadProjectContext(input);
  const available = deps.mastra.listAgents();
  const agents = listAllowedWorkspaceAgents({ role: projectContext.role })
    .filter((agent) => agent.id in available);

  return {
    projectId: projectContext.projectId,
    agents,
  };
}
```

**Step 3: Run test**

```bash
pnpm test:integration -- --run packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts
```

Expected: pass.

### Task 3.2: Generate Agent Service

**Files:**

- Modify: `packages/platform/src/services/workspace-mastra-gateway.ts`
- Modify: `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

**Step 1: Add invalid-input and unknown-agent tests**

```ts
it('rejects empty generate messages before model execution', async () => {
  const { seedProjectFixture } = await import('../helpers/fixtures');
  const { generateWorkspaceMastraAgentForPrincipal } = await import('../../src/services/workspace-mastra-gateway');
  const fixture = await seedProjectFixture();

  await expect(generateWorkspaceMastraAgentForPrincipal({
    firebaseUid: fixture.user.firebaseUid,
    projectId: fixture.project.id,
    agentId: 'summarizer',
    messages: '   ',
  }, {
    mastra: {} as never,
    workspaceFactory: fixture.workspaceFactory,
  })).rejects.toThrow('messages is required');
});

it('rejects agents that are not exposed through workspace policy', async () => {
  const { seedProjectFixture } = await import('../helpers/fixtures');
  const { createMastra } = await import('../../src/mastra/create-mastra');
  const { generateWorkspaceMastraAgentForPrincipal } = await import('../../src/services/workspace-mastra-gateway');
  const fixture = await seedProjectFixture();
  const mastra = createMastra(process.env.DATABASE_URL!, { openrouterApiKey: 'not-needed' });

  await expect(generateWorkspaceMastraAgentForPrincipal({
    firebaseUid: fixture.user.firebaseUid,
    projectId: fixture.project.id,
    agentId: 'projectAgent',
    messages: 'hello',
  }, { mastra, workspaceFactory: fixture.workspaceFactory })).rejects.toThrow('not available');
});
```

**Step 2: Add optional live test**

Skip unless `OPENROUTER_API_KEY` exists:

```ts
it.skipIf(!process.env.OPENROUTER_API_KEY)('generates with trusted workspace context', async () => {
  // Use summarizer or workspace-supervisor with a one-sentence prompt.
});
```

**Step 3: Implement service**

```ts
export type GenerateWorkspaceMastraAgentInput = {
  firebaseUid: string;
  projectId: string;
  agentId: string;
  messages: string;
  threadId?: string;
};

export async function generateWorkspaceMastraAgentForPrincipal(
  input: GenerateWorkspaceMastraAgentInput,
  deps: WorkspaceMastraGatewayDeps & { version?: AgentVersionOpts },
) {
  const messages = input.messages.trim();
  if (!messages) throw new AccessDeniedError('messages is required');

  assertAgentOperationAllowed(input.agentId, 'generate');
  const execution = await buildGatewayExecution({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
    primitiveKind: 'agent',
    primitiveId: input.agentId,
    suppliedThreadId: input.threadId,
  }, deps);

  const agent = await getAgentWithVersion(deps.mastra, input.agentId, deps.version);
  const output = await agent.generate(messages, {
    requestContext: execution.requestContext,
    memory: {
      thread: execution.threadId,
      resource: execution.resourceId,
    },
  });

  return {
    projectId: input.projectId,
    agentId: input.agentId,
    threadId: execution.threadId,
    resourceId: execution.resourceId,
    text: output.text,
    ...(output.runId ? { runId: output.runId } : {}),
    ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
  };
}
```

Add helper:

```ts
function assertAgentOperationAllowed(agentId: string, operation: 'generate' | 'stream') {
  const metadata = workspaceMastraAgentMetadata[agentId as keyof typeof workspaceMastraAgentMetadata];
  if (!metadata?.exposed || !metadata.operations.includes(operation)) {
    deny(`Agent ${agentId} is not available through the workspace Mastra gateway.`);
  }
}
```

**Step 4: Run tests**

```bash
pnpm test:integration -- --run packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: pass. Live test passes only when credentials are present.

### Task 3.3: Stream Agent Service

**Files:**

- Modify: `packages/platform/src/services/workspace-mastra-gateway.ts`
- Modify: `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

**Step 1: Add type**

```ts
export type WorkspaceMastraStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};
```

**Step 2: Add invalid-input test**

Mirror generate invalid input and assert empty messages throw before model calls.

**Step 3: Implement streaming generator**

Use the existing pattern from `packages/platform/src/services/chat.ts`:

```ts
export async function* streamWorkspaceMastraAgentForPrincipal(
  input: GenerateWorkspaceMastraAgentInput,
  deps: WorkspaceMastraGatewayDeps & { version?: AgentVersionOpts },
): AsyncGenerator<WorkspaceMastraStreamEvent> {
  const messages = input.messages.trim();
  if (!messages) throw new AccessDeniedError('messages is required');

  assertAgentOperationAllowed(input.agentId, 'stream');
  const execution = await buildGatewayExecution({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
    primitiveKind: 'agent',
    primitiveId: input.agentId,
    suppliedThreadId: input.threadId,
  }, deps);
  const agent = await getAgentWithVersion(deps.mastra, input.agentId, deps.version);
  const stream = await agent.stream(messages, {
    requestContext: execution.requestContext,
    memory: {
      thread: execution.threadId,
      resource: execution.resourceId,
    },
  });

  yield {
    event: 'ack',
    data: {
      projectId: input.projectId,
      agentId: input.agentId,
      threadId: execution.threadId,
      resourceId: execution.resourceId,
    },
  };

  for await (const token of stream.textStream) {
    yield { event: 'token', data: { text: token } };
  }

  const output = await stream.getFullOutput();
  yield {
    event: 'done',
    data: {
      projectId: input.projectId,
      agentId: input.agentId,
      threadId: execution.threadId,
      text: output.text,
      ...(output.runId ? { runId: output.runId } : {}),
      ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
    },
  };
}
```

**Step 4: Run tests**

```bash
pnpm test:integration -- --run packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: pass.

## Phase 4: Workflow Gateway Service

### Task 4.1: List Workflows Service

**Files:**

- Modify: `packages/platform/src/services/workspace-mastra-gateway.ts`
- Modify: `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

**Step 1: Write test**

```ts
it('lists workspace-scoped workflows for an authorized project member', async () => {
  const result = await listWorkspaceMastraWorkflowsForPrincipal(...);
  expect(result.workflows.map((workflow) => workflow.id)).toEqual(['ingestPipeline']);
});
```

**Step 2: Implement**

```ts
export async function listWorkspaceMastraWorkflowsForPrincipal(
  input: { firebaseUid: string; projectId: string },
  deps: WorkspaceMastraGatewayDeps,
) {
  const projectContext = await loadProjectContext(input);
  const available = deps.mastra.listWorkflows();
  const workflows = listAllowedWorkspaceWorkflows({ role: projectContext.role })
    .filter((workflow) => workflow.id in available);

  return {
    projectId: projectContext.projectId,
    workflows,
  };
}
```

**Step 3: Run tests**

```bash
pnpm test:integration -- --run packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts
```

Expected: pass.

### Task 4.2: Create Workflow Run Service

**Files:**

- Modify: `packages/platform/src/services/workspace-mastra-gateway.ts`
- Modify: `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

**Step 1: Write test**

```ts
it('creates a workflow run through the workspace gateway', async () => {
  const result = await createWorkspaceMastraWorkflowRunForPrincipal({
    firebaseUid: fixture.user.firebaseUid,
    projectId: fixture.project.id,
    workflowId: 'ingestPipeline',
  }, { mastra, workspaceFactory: fixture.workspaceFactory });

  expect(result.projectId).toBe(fixture.project.id);
  expect(result.workflowId).toBe('ingestPipeline');
  expect(typeof result.runId).toBe('string');
});
```

**Step 2: Implement**

```ts
export async function createWorkspaceMastraWorkflowRunForPrincipal(
  input: { firebaseUid: string; projectId: string; workflowId: string },
  deps: WorkspaceMastraGatewayDeps,
) {
  const projectContext = await loadProjectContext(input);
  assertWorkflowOperationAllowed(input.workflowId, 'create-run');
  const workflow = deps.mastra.getWorkflow(input.workflowId as never);
  const run = await workflow.createRun();

  return {
    projectId: projectContext.projectId,
    workflowId: input.workflowId,
    runId: run.runId,
  };
}
```

If `run.runId` is not the correct property in the installed API, inspect the object in the test and adjust to the same shape used by `packages/worker/test/live/workflow.e2e.test.ts`.

**Step 3: Run tests**

```bash
pnpm test:integration -- --run packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts
```

Expected: pass.

### Task 4.3: Start Workflow Service With Real Workspace Context

**Files:**

- Modify: `packages/platform/src/services/workspace-mastra-gateway.ts`
- Modify: `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

**Step 1: Write success test**

Use `ingestPipeline` and the empty workspace fixture. This should not need `OPENROUTER_API_KEY` because empty workspace means summarizer step returns early.

```ts
it('starts ingestPipeline with server-built workspace context', async () => {
  const result = await startWorkspaceMastraWorkflowForPrincipal({
    firebaseUid: fixture.user.firebaseUid,
    projectId: fixture.project.id,
    workflowId: 'ingestPipeline',
    inputData: { rootPath: '/' },
  }, { mastra, workspaceFactory: fixture.workspaceFactory });

  expect(result.projectId).toBe(fixture.project.id);
  expect(result.workflowId).toBe('ingestPipeline');
  expect(result.status).toBe('success');
  if (result.status === 'success') {
    expect(result.result).toEqual({ summary: '', filesCount: 0 });
  }
});
```

**Step 2: Write context-spoofing test**

This is mostly an app-route concern, but service should not accept arbitrary `requestContext`. Do not include a `requestContext` field in the service input type. Add a type-level `@ts-expect-error` only if useful; runtime spoofing is covered in Phase 5 app tests.

**Step 3: Implement**

```ts
export type StartWorkspaceMastraWorkflowInput = {
  firebaseUid: string;
  projectId: string;
  workflowId: string;
  runId?: string;
  inputData?: unknown;
  threadId?: string;
};

export async function startWorkspaceMastraWorkflowForPrincipal(
  input: StartWorkspaceMastraWorkflowInput,
  deps: WorkspaceMastraGatewayDeps,
) {
  assertWorkflowOperationAllowed(input.workflowId, 'start');
  const execution = await buildGatewayExecution({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
    primitiveKind: 'workflow',
    primitiveId: input.workflowId,
    suppliedThreadId: input.threadId,
  }, deps);
  const workflow = deps.mastra.getWorkflow(input.workflowId as never);
  const run = input.runId
    ? await workflow.createRun({ runId: input.runId } as never)
    : await workflow.createRun();
  const result = await run.start({
    inputData: input.inputData,
    requestContext: execution.requestContext as never,
  });

  return {
    projectId: input.projectId,
    workflowId: input.workflowId,
    runId: run.runId,
    ...result,
  };
}
```

If `workflow.createRun({ runId })` is not supported by the installed package, inspect the workflow run API. If existing run ids cannot be resumed through SDK cleanly, make `/start` always create a run and document that `/create-run` is currently for Mastra parity/discovery only.

**Step 4: Run tests**

```bash
pnpm test:integration -- --run packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts
pnpm --filter @hono-workspace/platform typecheck
```

Expected: pass.

## Phase 5: App Server Routes

### Task 5.1: Add AppFactory Test Overrides

**Files:**

- Modify: `packages/app/src/server/factory.ts`
- Modify: `packages/app/test/integration/authenticated-routes.integration.test.ts`
- Modify: `packages/app/test/integration/agent-version-targeting.integration.test.ts`

**Step 1: Add type imports**

Import gateway functions and stream event type from platform:

```ts
import {
  listWorkspaceMastraAgentsForPrincipal,
  generateWorkspaceMastraAgentForPrincipal,
  streamWorkspaceMastraAgentForPrincipal,
  listWorkspaceMastraWorkflowsForPrincipal,
  createWorkspaceMastraWorkflowRunForPrincipal,
  startWorkspaceMastraWorkflowForPrincipal,
  type WorkspaceMastraStreamEvent,
} from '@hono-workspace/platform';
```

**Step 2: Add optional test override fields**

Add these to `AppFactoryParams`:

```ts
listWorkspaceMastraAgents?: typeof listWorkspaceMastraAgentsForPrincipal;
generateWorkspaceMastraAgent?: typeof generateWorkspaceMastraAgentForPrincipal;
streamWorkspaceMastraAgent?: typeof streamWorkspaceMastraAgentForPrincipal;
listWorkspaceMastraWorkflows?: typeof listWorkspaceMastraWorkflowsForPrincipal;
createWorkspaceMastraWorkflowRun?: typeof createWorkspaceMastraWorkflowRunForPrincipal;
startWorkspaceMastraWorkflow?: typeof startWorkspaceMastraWorkflowForPrincipal;
```

If TypeScript rejects direct `typeof` because of overloaded/generic signatures, define local function types exactly as done for existing route overrides.

**Step 3: Run typecheck**

```bash
pnpm --filter @hono-workspace/app typecheck
```

Expected: pass after the imports/types compile.

### Task 5.2: Add Agent Gateway Routes In App

**Files:**

- Modify: `packages/app/src/server/factory.ts`
- Modify: `packages/app/test/integration/authenticated-routes.integration.test.ts`
- Modify: `packages/app/test/integration/agent-version-targeting.integration.test.ts`

**Step 1: Add failing route tests**

Add list test:

```ts
it('lists workspace-scoped Mastra agents for authenticated project members', async () => {
  const app = await createApp({
    tokenVerifier: { async verifyIdToken() { return verifiedPrincipal; } },
    listWorkspaceMastraAgents: async ({ projectId }) => ({
      projectId,
      agents: [{ id: 'summarizer', capability: 'read', operations: ['generate', 'stream'] }],
    }),
  });

  const response = await app.request('/api/projects/project-1/mastra/agents', {
    headers: { authorization: 'Bearer demo-token' },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    projectId: 'project-1',
    agents: [{ id: 'summarizer', capability: 'read', operations: ['generate', 'stream'] }],
  });
});
```

Add generate test and assert spoofed body fields are not forwarded:

```ts
it('generates through workspace-scoped Mastra agent route without forwarding trusted body context', async () => {
  let captured: unknown;
  const app = await createApp({
    tokenVerifier: { async verifyIdToken() { return verifiedPrincipal; } },
    generateWorkspaceMastraAgent: async (input) => {
      captured = input;
      return {
        projectId: input.projectId,
        agentId: input.agentId,
        threadId: input.threadId ?? 'generated-thread',
        resourceId: 'server-resource',
        text: 'ok',
      };
    },
  });

  const response = await app.request('/api/projects/project-1/mastra/agents/summarizer/generate', {
    method: 'POST',
    headers: { authorization: 'Bearer demo-token', 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: 'hello',
      threadId: 'client-thread',
      projectId: 'evil-project',
      role: 'owner',
      resourceId: 'evil-resource',
      requestContext: { workspace: 'evil' },
    }),
  });

  expect(response.status).toBe(200);
  expect(captured).toEqual({
    firebaseUid: verifiedPrincipal.uid,
    projectId: 'project-1',
    agentId: 'summarizer',
    messages: 'hello',
    threadId: 'client-thread',
  });
});
```

Add version targeting test:

```ts
it('passes ?versionId through to workspace-scoped agent generate', async () => {
  // Same pattern as existing summarize/supervisor version tests.
});
```

**Step 2: Add routes**

Add after existing `/api/projects/:projectId/supervise` route:

```ts
app.get('/api/projects/:projectId/mastra/agents', async (c) => {
  const principal = c.get('principal');
  const result = await (params.listWorkspaceMastraAgents ??
    ((input, deps) => listWorkspaceMastraAgentsForPrincipal(input, deps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    }, platformDeps);
  return c.json(result);
});

app.post('/api/projects/:projectId/mastra/agents/:agentId/generate', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ messages?: string; threadId?: string }>();
  const version = parseAgentVersionFromQuery({ get: (name) => c.req.query(name) ?? null });
  const input = {
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    agentId: c.req.param('agentId'),
    messages: body.messages ?? '',
    ...(body.threadId ? { threadId: body.threadId } : {}),
  };
  const result = params.generateWorkspaceMastraAgent
    ? await params.generateWorkspaceMastraAgent(input, version ? { version } : undefined)
    : await generateWorkspaceMastraAgentForPrincipal(input, {
        ...platformDeps,
        ...(version ? { version } : {}),
      });
  return c.json(result);
});
```

Add stream route:

```ts
app.post('/api/projects/:projectId/mastra/agents/:agentId/stream', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ messages?: string; threadId?: string }>();
  const version = parseAgentVersionFromQuery({ get: (name) => c.req.query(name) ?? null });
  const input = {
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    agentId: c.req.param('agentId'),
    messages: body.messages ?? '',
    ...(body.threadId ? { threadId: body.threadId } : {}),
  };
  const stream = params.streamWorkspaceMastraAgent
    ? await params.streamWorkspaceMastraAgent(input, version ? { version } : undefined)
    : streamWorkspaceMastraAgentForPrincipal(input, {
        ...platformDeps,
        ...(version ? { version } : {}),
      });
  return createSseResponse(stream);
});
```

Adjust signatures if the override type expects `deps` differently.

**Step 3: Run tests**

```bash
pnpm test:integration -- --run packages/app/test/integration/authenticated-routes.integration.test.ts
pnpm test:integration -- --run packages/app/test/integration/agent-version-targeting.integration.test.ts
pnpm --filter @hono-workspace/app typecheck
```

Expected: pass.

### Task 5.3: Add Workflow Gateway Routes In App

**Files:**

- Modify: `packages/app/src/server/factory.ts`
- Modify: `packages/app/test/integration/authenticated-routes.integration.test.ts`

**Step 1: Add route tests**

Add tests for:

- `GET /api/projects/:projectId/mastra/workflows`
- `POST /api/projects/:projectId/mastra/workflows/:workflowId/create-run`
- `POST /api/projects/:projectId/mastra/workflows/:workflowId/start`
- spoofed `projectId`, `role`, `requestContext`, and `resourceId` in workflow start body are not forwarded

**Step 2: Add routes**

```ts
app.get('/api/projects/:projectId/mastra/workflows', async (c) => {
  const principal = c.get('principal');
  const result = await (params.listWorkspaceMastraWorkflows ??
    ((input, deps) => listWorkspaceMastraWorkflowsForPrincipal(input, deps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    }, platformDeps);
  return c.json(result);
});

app.post('/api/projects/:projectId/mastra/workflows/:workflowId/create-run', async (c) => {
  const principal = c.get('principal');
  const result = await (params.createWorkspaceMastraWorkflowRun ??
    ((input, deps) => createWorkspaceMastraWorkflowRunForPrincipal(input, deps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      workflowId: c.req.param('workflowId'),
    }, platformDeps);
  return c.json(result);
});

app.post('/api/projects/:projectId/mastra/workflows/:workflowId/start', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ runId?: string; inputData?: unknown; threadId?: string }>();
  const result = await (params.startWorkspaceMastraWorkflow ??
    ((input, deps) => startWorkspaceMastraWorkflowForPrincipal(input, deps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      workflowId: c.req.param('workflowId'),
      ...(body.runId ? { runId: body.runId } : {}),
      ...(body.threadId ? { threadId: body.threadId } : {}),
      inputData: body.inputData,
    }, platformDeps);
  return c.json(result);
});
```

**Step 3: Run tests**

```bash
pnpm test:integration -- --run packages/app/test/integration/authenticated-routes.integration.test.ts
pnpm --filter @hono-workspace/app typecheck
```

Expected: pass.

## Phase 6: Worker Routes And Live E2E

### Task 6.1: Add Worker Gateway Routes

**Files:**

- Modify: `packages/worker/src/index.ts`

**Step 1: Mirror app routes**

Add the same six routes after `/api/projects/:projectId/supervise`. Use Worker-scoped deps:

```ts
const mastra = c.get('mastra');
const workspaceFactory = c.get('workspaceFactory');
```

Then call platform gateway services with `{ mastra, workspaceFactory }`.

**Step 2: For stream route, add Worker SSE helper if needed**

`packages/worker/src/index.ts` may not currently have `createSseResponse()`. Copy the app helper shape or extract later if duplication becomes painful. Do not over-refactor in this task.

**Step 3: Run typecheck**

```bash
pnpm --filter @hono-workspace/worker typecheck
```

Expected: pass.

### Task 6.2: Add Worker Live E2E For Workspace Gateway

**Files:**

- Create: `packages/worker/test/live/workspace-mastra-gateway.e2e.test.ts`
- Modify: `packages/worker/test/live/mastra-native.e2e.test.ts` only if needed for naming consistency

**Step 1: Add list E2E**

Follow `supervisor.e2e.test.ts`: create Firebase user, bootstrap project, call:

```text
GET /api/projects/:projectId/mastra/agents
GET /api/projects/:projectId/mastra/workflows
```

Assert `200` and expected ids.

**Step 2: Add workflow success E2E**

Call:

```text
POST /api/projects/:projectId/mastra/workflows/ingestPipeline/start
```

Body:

```json
{ "inputData": { "rootPath": "/" } }
```

Assert:

```ts
expect(res.status).toBe(200);
expect(body.status).toBe('success');
expect(body.result).toEqual({ summary: '', filesCount: 0 });
```

This is the product-success workflow E2E. It must not accept `failed`.

**Step 3: Add optional agent generate E2E**

Only run when `OPENROUTER_API_KEY` is present, following existing E2E env gating. Call:

```text
POST /api/projects/:projectId/mastra/agents/summarizer/generate
```

Assert `200`, `projectId`, `agentId`, non-empty `text`, and server-shaped `resourceId`.

**Step 4: Run E2E when environment is available**

```bash
pnpm test:e2e -- --run packages/worker/test/live/workspace-mastra-gateway.e2e.test.ts
```

If the root script does not forward `--run`, use the worker package's E2E runner convention or run the full E2E suite:

```bash
pnpm test:e2e
```

Expected: pass when live env vars are present; skipped otherwise according to existing `shouldRun` pattern.

## Phase 7: Tighten Native Workflow E2E Semantics

### Task 7.1: Rename And Narrow Native Workflow Test

**Files:**

- Modify: `packages/worker/test/live/workflow.e2e.test.ts`

**Step 1: Update test names**

Rename describe/test labels to make it clear this is the native/internal Mastra surface, not product workflow success.

Current:

```ts
it('POST /workflows/ingestPipeline/create-run + start-async runs the two-step pipeline', ...)
```

Change to something like:

```ts
it('POST /workflows/ingestPipeline/create-run + start-async reaches the native workflow surface', ...)
```

**Step 2: Remove product-success assertions**

Do not assert that native route "runs the two-step pipeline" unless it truly receives workspace context. Replace:

```ts
expect(['success', 'failed', 'suspended']).toContain(body.status);
```

with one of these two choices:

1. If the native route reliably fails without workspace context, assert `body.status === 'failed'` and assert the missing workspace/filesystem error appears in the response shape.
2. If error shape is unstable, only assert run creation and that start returned a valid workflow status, and add a comment that workspace-backed success is covered by `workspace-mastra-gateway.e2e.test.ts`.

Prefer option 1 if the error is available in the response. Prefer option 2 if Mastra hides the step error.

**Step 3: Run E2E or targeted test**

```bash
pnpm test:e2e
```

Expected: native route test no longer accepts failure as product success, and workspace gateway E2E owns the success assertion.

## Phase 8: Verify Supervisor-To-Workflow Delegation

### Task 8.1: Add Deterministic Non-LLM Context Test First

**Files:**

- Modify: `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

**Step 1: Ensure gateway workflow success test exists**

The Phase 4 workflow start integration test is the first proof that workflow execution receives real workspace context. Do not skip it.

**Step 2: Add direct supervisor workflow listing test if not already covered**

This already exists in `create-mastra.test.ts`, but add a gateway-specific assertion only if helpful:

```ts
const supervisor = mastra.getAgent('workspace-supervisor');
const workflows = await supervisor.listWorkflows();
expect(Object.keys(workflows)).toContain('ingestPipeline');
```

**Step 3: Run tests**

```bash
pnpm test:unit -- --run packages/platform/test/unit/create-mastra.test.ts
pnpm test:integration -- --run packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts
```

Expected: pass.

### Task 8.2: Add Optional LLM Delegation Test

**Files:**

- Modify: `packages/platform/test/integration/workspace-supervisor.integration.test.ts`

**Step 1: Add skipped/live test**

Only run when `OPENROUTER_API_KEY` exists. Prompt should strongly require the workflow:

```text
Use the ingestPipeline workflow on rootPath "/" and report the filesCount only.
```

**Step 2: Accept non-determinism cautiously**

Do not make this the only proof of workflow context propagation. The deterministic gateway workflow test is the main contract. This test is a live confidence check that the supervisor can choose the workflow.

**Step 3: If this is flaky, leave it skipped or remove workflow access from supervisor**

If model delegation is unreliable, do not block the gateway implementation. Either keep the test skipped with clear notes or remove `ingestPipeline` from supervisor workflows until product usage requires it.

## Phase 9: Documentation Updates

### Task 9.1: Update Architecture Knowledge

**Files:**

- Modify: `.ai/knowledges/01_technical_architecture.md`

Add a section explaining:

- `/api/mastra/*` is native/internal/admin/development.
- `/api/projects/:projectId/mastra/*` is product-facing and workspace-scoped.
- Clients should prefer workspace-scoped routes for project operations.
- Bespoke routes are convenience shortcuts, not the primitive expansion model.

### Task 9.2: Update Agent/Workflow Knowledge

**Files:**

- Modify: `.ai/knowledges/02_adding_agents_and_workflows.md`

Add:

- Register new agents/workflows in local registries.
- Add metadata in `mastra/registry-metadata.ts`.
- Decide whether the primitive is exposed through the workspace gateway.
- Registry metadata ids should match registry keys.
- New workspace-aware product operations should be available through `/api/projects/:projectId/mastra/*` unless there is a reason for a bespoke route.

### Task 9.3: Update Usage Guide

**Files:**

- Modify: `.ai/knowledges/usage_guide.md`

Add examples for:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/projects/$PROJECT_ID/mastra/agents"

curl -X POST "$BASE_URL/api/projects/$PROJECT_ID/mastra/agents/summarizer/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":"Say ok in one word."}'

curl -X POST "$BASE_URL/api/projects/$PROJECT_ID/mastra/workflows/ingestPipeline/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputData":{"rootPath":"/"}}'
```

### Task 9.4: Update Analysis Status

**Files:**

- Modify: `.ai/analyses/02_native_mastra_multi_agent_runtime_analysis.md`

After implementation, update status from `Draft` to `Final` only if the gateway implementation and verification have landed.

## Phase 10: Verification And Commit Boundaries

### Task 10.1: Full Verification

Run:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:smoke
pnpm --filter @hono-workspace/platform typecheck
pnpm --filter @hono-workspace/app typecheck
pnpm --filter @hono-workspace/worker typecheck
git diff --check
```

Expected:

- Unit tests pass.
- Integration tests pass.
- E2E tests pass or skip according to existing live env gates.
- Smoke tests pass.
- Typechecks pass.
- `git diff --check` has no output.

### Task 10.2: Commit In Logical Groups

Suggested commit groups:

```text
test: add registry metadata coverage
feat: add workspace-scoped Mastra gateway service
feat: expose workspace Mastra gateway routes
test: tighten native workflow and gateway e2e coverage
docs: document workspace-scoped Mastra gateway
```

Do not include AI-assistance/co-author wording.

### Task 10.3: Cleanup

Before committing, check:

```bash
git status --short
```

The existing untracked `packages/worker/tmp-probe.ts` is a local absolute-path spike. Do not commit it unless it has been intentionally converted into a portable script or test.

## Handoff Notes

The most important design point is trust. The gateway is not a proxy that forwards arbitrary Mastra HTTP bodies. It is a project-scoped facade that:

1. Accepts only product-safe inputs.
2. Resolves project authorization server-side.
3. Resolves workspace server-side.
4. Builds Mastra request context server-side.
5. Sets memory resource/thread conventions server-side.
6. Applies explicit primitive exposure policy.
7. Calls Mastra SDK primitives.

If a later step feels like it needs to pass through raw `requestContext`, `memory.resource`, `workspace`, `role`, or `organizationId` from the client, stop and redesign that step.
