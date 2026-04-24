# Native Mastra Multi-Agent Runtime Analysis

**Date**: 2026-04-23
**Author**: Engineering
**Status**: Final
**References**: [`../tasks/03_native_mastra_multi_agent_management_implementation_plan.md`](../tasks/03_native_mastra_multi_agent_management_implementation_plan.md), [`../tasks/08_mindspace_scoped_mastra_gateway_implementation_plan.md`](../tasks/08_mindspace_scoped_mastra_gateway_implementation_plan.md), [`../knowledges/01_technical_architecture.md`](../knowledges/01_technical_architecture.md), [`../knowledges/02_adding_agents_and_workflows.md`](../knowledges/02_adding_agents_and_workflows.md), [`packages/platform/src/mastra/create-mastra.ts`](../../packages/platform/src/mastra/create-mastra.ts), [`packages/platform/src/mastra/agents/build-agent.ts`](../../packages/platform/src/mastra/agents/build-agent.ts), [`packages/platform/src/mastra/agents/registry.ts`](../../packages/platform/src/mastra/agents/registry.ts), [`packages/platform/src/mastra/agents/mindspace-supervisor.ts`](../../packages/platform/src/mastra/agents/mindspace-supervisor.ts), [`packages/platform/src/mastra/workflows/registry.ts`](../../packages/platform/src/mastra/workflows/registry.ts), [`packages/platform/src/mastra/workflows/ingest-pipeline.ts`](../../packages/platform/src/mastra/workflows/ingest-pipeline.ts), [`packages/platform/src/services/supervisor.ts`](../../packages/platform/src/services/supervisor.ts), [Mastra supervisor agents](https://mastra.ai/docs/agents/supervisor-agents), [Mastra agent networks](https://mastra.ai/docs/agents/networks), [Mastra workflows with agents and tools](https://mastra.ai/docs/workflows/agents-and-tools)

---

## Executive Summary

The current implementation is directionally correct. It uses Mastra's native multi-agent primitives rather than building a parallel orchestration framework: agents and workflows are registered with `new Mastra({ agents, workflows })`, the coordinator is a normal supervisor `Agent` configured with subordinate `agents` and `workflows`, and mindspace execution is mediated by app-owned services that resolve authorization, mindspace, request context, and memory resources.

Mastra does provide scalable primitives for multi-agent systems: supervisor agents, workflow composition, runtime agent/workflow registration, editor-backed stored versions, and MCP exposure of agents/workflows as tools. The local registry and factory are still necessary because Mastra does not know this app's tenant model, Cloudflare request-I/O constraints, workspace binding rules, tool safety policy, model provider conventions, or route-level authorization requirements.

The target product surface should now be clarified as a mindspace-scoped Mastra gateway: `/api/projects/:projectId/mastra/*`. This gateway should mirror useful Mastra operations for agents and workflows while injecting trusted project context server-side. The existing `/api/mastra/*` surface should remain mounted for native Mastra/editor/admin/development needs, but it should not be treated as the mindspace product API.

The main remaining risk is workflow execution context. The current direct workflow path succeeds when `ingestPipeline` is started with the platform-built `RequestContext`, but the generic native workflow HTTP surface can start the same workflow without a resolved `workspace`. The current live native workflow test accepts `success`, `failed`, or `suspended`, so it verifies route reachability more than product correctness. A mindspace-scoped gateway would make the project/mindspace the main API surface while preserving the trust boundary.

## Context

This analysis follows the implementation of the native Mastra multi-agent strategy from task 03. The goal is to confirm whether the codebase now reflects the recommended architecture, identify gaps before further expansion, and document the practical strategy for managing many agents and workflows over time.

The key questions investigated were:

1. Which Mastra primitives are native and current for multi-agent management?
2. Does the local implementation use those primitives directly?
3. Why does this repo still need local factories and registries?
4. Which runtime surfaces are ready for product use, and which are only native/internal/admin/development surfaces?
5. What product API shape best supports the requirement that the mindspace/project is the primary surface for Mastra operations?
6. What should be updated next before adding more supervisors or workflow-heavy agents?

## Investigation

### Methodology

The investigation checked three evidence layers:

1. Official Mastra documentation for current guidance on supervisor agents, deprecated networks, and workflows.
2. Installed `@mastra/core@1.25.0` TypeScript definitions under `packages/platform/node_modules/@mastra/core/dist`.
3. Current application code, routes, integration tests, E2E tests, and typecheck results in this workspace.

The verification command `pnpm --filter @mastra-mindspace/platform exec tsc --noEmit --pretty false` passed during this investigation.

### Native Mastra Primitives

Mastra supervisor agents are the current first-class primitive for flexible multi-agent coordination. The official docs describe supervisor agents as normal agents that coordinate subagents through `Agent.generate()` or `Agent.stream()` and are configured with an `agents` property. The same docs cover delegation hooks, message filtering, iteration monitoring, memory isolation, task-completion scoring, and subagent versioning.

Mastra agent networks are not the right target for new work. The official network docs mark `.network()` as deprecated and direct users to supervisor agents instead. This repo correctly avoids `.network()` in the new implementation.

The installed local types confirm the primitives are available in the pinned runtime:

- `Agent` config accepts `agents?: DynamicArgument<Record<string, Agent>, TRequestContext>`.
- `Agent` config accepts `workflows?: DynamicArgument<Record<string, Workflow<...>>, TRequestContext>`.
- `Agent` config accepts `defaultOptions?: DynamicArgument<AgentExecutionOptions<TOutput>, TRequestContext>`.
- `AgentExecutionOptions` includes `delegation`, `onIterationComplete`, and `isTaskComplete`.
- `Mastra` accepts top-level `agents` and `workflows`.
- `Mastra` exposes `listAgents()`, `addAgent()`, `listWorkflows()`, and `addWorkflow()`.
- MCP server config can expose `agents` and `workflows` as tools, though this repo does not currently use that surface.

The conclusion is that Mastra provides the orchestration primitives. What it does not provide is this app's platform policy layer.

### Current Implementation Shape

`createMastra()` now builds workflows first, then agents, then passes both registries into `new Mastra({ agents, workflows, storage, editor })`. This keeps `create-mastra.ts` small and turns agent/workflow growth into registry growth rather than repeated top-level wiring edits.

`createWorkflowRegistry()` currently returns `ingestPipeline`. The workflow is code-defined, registered with Mastra, and independently tested through direct SDK execution with a platform-built request context.

`createAgentRegistry()` currently builds:

- `projectAgent`
- `summarizer`
- `mindspaceReviewer`
- `mindspace-supervisor`

The supervisor receives only read-oriented subordinate agents: `summarizer` and `mindspaceReviewer`. It intentionally does not receive the write-capable `projectAgent`, which is the right safety boundary for an analysis coordinator.

`buildMindspaceAgent()` remains the correct local factory. It centralizes OpenRouter model resolution, `Memory` configuration with `observationalMemory: false`, request-scoped mindspace resolution, toolkit registration, optional subagents, optional workflows, and bounded default execution options. This is not a substitute for Mastra's primitives; it is the enforcement point for platform invariants before handing control to Mastra.

`createMindspaceSupervisorAgent()` is implemented as a normal Mastra `Agent` with:

- read-only mindspace tools
- subordinate agents
- workflow access to `ingestPipeline`
- `maxSteps: 8`
- `delegation.messageFilter` limited to the last 12 messages
- `onIterationComplete` guardrails to stop long loops

`runMindspaceSupervisorForPrincipal()` is the correct current project-scoped product surface. It validates prompt input, loads project context, resolves the project mindspace, builds request context, resolves the supervisor with optional version targeting, and calls `agent.generate()` with memory and delegation options. The proposed gateway generalizes this pattern for all permitted mindspace-scoped Mastra agents and workflows.

### Runtime Surfaces

The repo should use two clearly different execution surfaces:

1. Native/Internal Mastra Surface: `/api/mastra/*`, mounted through Mastra's native server adapter.
2. Workspace-Scoped Mastra Surface: `/api/projects/:projectId/mastra/*`, implemented by this app as a policy-enforcing gateway over Mastra primitives.

The native/internal surface is appropriate for generic Mastra exposure, editor workflows, admin tooling, simple diagnostics, and native agent/workflow discovery. It is not sufficient as the production user-facing workspace execution boundary because it does not itself derive trusted `projectId`, `organizationId`, `role`, workspace root, or workspace object from the authenticated principal.

The mindspace-scoped Mastra surface should be the main product API. It should expose mindspace-safe operations such as:

```text
GET  /api/projects/:projectId/mastra/agents
POST /api/projects/:projectId/mastra/agents/:agentId/generate
POST /api/projects/:projectId/mastra/agents/:agentId/stream
GET  /api/projects/:projectId/mastra/workflows
POST /api/projects/:projectId/mastra/workflows/:workflowId/create-run
POST /api/projects/:projectId/mastra/workflows/:workflowId/start
```

This gives product clients the desired mental model: authenticated workspace members operate within a project/workspace, and the server supplies trusted Mastra context. Existing bespoke routes such as `/api/projects/:projectId/summarize` and `/api/projects/:projectId/supervise` can remain as convenience/product-specific shortcuts, but they should not be the only long-term expansion pattern.

The gateway must still apply capability policy. "Any authenticated mindspace user can run any Mastra operation" should mean any permitted mindspace-scoped operation. Stored-agent mutation, editor writes, global runtime mutation, and future write-capable agents are higher-risk operations and should not become implicitly open just because they are Mastra operations.

### Editor And Version Targeting

Existing version-targeting helpers use `mastra.getAgent(id)` for default published behavior and `mastra.getAgentById(id, version)` when `versionId` or `status` is supplied. The supervisor route participates in the same targeting flow as existing agent routes.

One subtle convention matters: version targeting is simplest when the registry key and agent id match. The new supervisor uses key `'mindspace-supervisor'` and id `'mindspace-supervisor'`, which is good. Existing `projectAgent` uses a camelCase registry key while the agent id is likely kebab-case. Future agents should prefer key/id alignment unless there is a strong reason not to.

### Test Coverage

The committed changes added meaningful coverage:

- Unit coverage verifies `buildWorkspaceAgent()` can attach subagents, workflows, and default execution options.
- Unit coverage verifies Mastra registers the workflow and supervisor.
- Integration coverage verifies `ingestPipeline` succeeds when invoked with platform-built request context and an empty workspace.
- Integration coverage verifies the supervisor service rejects empty prompts before agent execution.
- Live E2E coverage verifies `/api/projects/:projectId/supervise` runs after bootstrap.
- Existing native route tests verify Mastra can list registered agents and execute simple native-surface agent calls.
- Platform typecheck passes.

The broad verification previously run after task 03 also passed: unit, integration, E2E, smoke, app typecheck, worker typecheck, platform typecheck, and `git diff --check`.

### Key Risk: Workflow Request Context

`ingestPipeline` expects `requestContext.get('workspace')` and throws if the workspace filesystem is unavailable. This is correct for a platform workflow, but it means the workflow is not self-sufficient when started from a generic HTTP body that contains only scalar project metadata.

The direct integration test builds the proper execution context and succeeds. The native live workflow test, however, bootstraps a project but sends only:

```ts
requestContext: {
  projectId,
  organizationId: 'e2e-org',
  role: 'owner',
}
```

That request does not include the actual `Workspace` object. The test currently accepts `success`, `failed`, or `suspended`, which means it can pass even if the workflow reaches the route but cannot perform workspace I/O. That is useful as a smoke test for native route reachability, but it should not be treated as evidence that generic native workflow execution is production-ready.

The same concern applies to supervisor workflow delegation. The supervisor service passes a real request context into `agent.generate()`, so delegation may preserve the needed context. But this needs direct verification because workflow-as-tool delegation is an important product path if supervisors are allowed to run workflows.

A mindspace-scoped gateway is the general fix for product workflow execution. Instead of creating a separate one-off route for each workflow, the gateway can resolve project context and mindspace once, build the trusted `RequestContext`, and then invoke the requested workflow through Mastra's native SDK APIs.

### Untracked Local Spike

The only uncommitted file observed during this investigation is `packages/worker/tmp-probe.ts`. It is a local spike that imports absolute machine paths and counts Mastra tables after running `initMastraSchema()` on a fresh branch. It should not be committed as-is.

## Findings

1. The implementation correctly uses Mastra supervisor agents, not deprecated agent networks.

2. The implementation correctly registers agents and workflows through Mastra's native `agents` and `workflows` configuration.

3. The local factory is still necessary because Mastra does not encode this app's Cloudflare Worker I/O constraints, tenant authorization model, workspace resolution policy, or toolkit safety rules.

4. The local registries are justified as codebase governance, not as a replacement for Mastra orchestration. They make adding agents/workflows scalable by isolating app wiring in predictable modules.

5. `mindspace-supervisor` is currently safe by default because it only receives read-oriented subordinate agents and read-only mindspace tools.

6. The supervisor route is correctly implemented as a mindspace-scoped product surface because it derives project context, mindspace, memory resource, and version target server-side.

7. The optimal product API is a generalized mindspace-scoped Mastra gateway, not raw global `/api/mastra/*` and not an endless set of bespoke project routes.

8. Native `/api/mastra/*` routes are useful for generic Mastra access but should not be documented as production workspace execution routes unless they receive trusted, server-built context.

9. Native workflow execution is currently under-validated. The live workflow test can pass when the workflow fails, so it proves route reachability rather than workspace-backed workflow correctness.

10. Workflow delegation from the supervisor needs a targeted verification test before relying on supervisor-to-workflow orchestration in product flows.

11. Future version-targeting behavior will be less surprising if registry keys match agent ids.

12. Mastra provides runtime `addAgent()` and `addWorkflow()`, but those should be used carefully. For this repo, code-defined registry entries should remain the default because they are testable, reviewable, and compatible with platform safety constraints.

13. Mastra's MCP support can expose agents and workflows as tools, but that should be treated as a future integration surface rather than part of the current project-scoped runtime path.

## Recommendations

### Priority 0: Build A Workspace-Scoped Mastra Gateway

Add a generalized product gateway under `/api/projects/:projectId/mastra/*`. This should be the primary product surface for workspace members to list and run permitted Mastra agents and workflows.

The gateway service should follow the supervisor route pattern: authenticate principal, load project context, resolve workspace, build execution context, resolve the requested Mastra primitive, inject server-owned memory/request context, apply policy, invoke Mastra, and shape the response.

Keep `/api/mastra/*` mounted as a native/internal/admin/development surface. Do not make it the product workspace API.

### Priority 0: Define Gateway Capability Policy

Start with a simple explicit policy:

1. All authenticated project members can list and run read-capable code-defined agents and workflows.
2. Write-capable agents require a specific role/capability check.
3. Stored-agent/editor mutation remains on the admin-gated native surface unless explicitly added to the workspace gateway later.
4. Runtime `addAgent()` / `addWorkflow()` remains out of product scope until there is an operator design.

This policy can be permissive for normal execution without making every Mastra/admin operation implicitly available to every workspace member.

### Priority 1: Verify Supervisor-To-Workflow Delegation

Add a deterministic test proving that `mindspace-supervisor` can delegate to `ingestPipeline` and that the workflow receives a valid workspace-bearing request context. If deterministic LLM delegation is hard to force, test the Mastra workflow tool path directly or temporarily use a constrained test supervisor whose instructions require running the workflow.

If this cannot be verified reliably, remove `ingestPipeline` from the supervisor's `workflows` map until there is a product route that can guarantee correct context propagation.

### Priority 1: Tighten Native Workflow E2E Semantics

Change the live native workflow test so it no longer treats `failed` as success without explanation. Two acceptable options:

1. Assert expected failure when no workspace object is present, including the specific missing-workspace error.
2. Move success assertions to a mindspace-scoped gateway workflow route that resolves the mindspace server-side.

This will prevent future readers from mistaking route reachability for product workflow readiness.

### Priority 1: Add Registry Key Rules

Update `02_adding_agents_and_workflows.md` to require registry keys to match Mastra agent ids and workflow ids unless the author documents an exception. This makes `getAgentWithVersion()`, native routes, editor behavior, and test expectations easier to reason about.

### Priority 2: Add Supervisor Versioning Coverage

Add integration coverage that stores or targets a supervisor version and verifies the supervisor route can resolve it. If possible, also verify subagent version override behavior once the product needs per-subagent version control.

### Priority 2: Add Observability And Cost Guardrails

The live supervisor route can take tens of seconds for a simple prompt because multi-agent orchestration may perform multiple model calls. Before exposing it broadly, add operational expectations around latency, maximum steps, model selection, and streaming. If users need progress visibility, expose supervisor streaming through the mindspace-scoped gateway rather than only synchronous JSON.

### Priority 2: Clean Up Local Probe

Remove or archive `packages/worker/tmp-probe.ts` before the next commit unless it is intentionally converted into a portable script or test. Its absolute paths make it unsuitable for source control.

## Open Questions

1. Which agents and workflows should be visible in the first mindspace-scoped gateway release?

2. Which project roles are allowed to run write-capable agents?

3. Should stored-agent/editor read operations be exposed through the workspace gateway, or should all editor operations remain on `/api/mastra/stored/*`?

4. Should supervisors be allowed to run workflows directly, or should workflow execution only happen through explicit gateway workflow routes until delegation is verified?

5. Do we need per-subagent version overrides in product routes, or is top-level supervisor version targeting enough for now?

6. Should runtime `addAgent()` / `addWorkflow()` be exposed to operators, or should all production primitives be code-defined and deployed through normal review?

7. Should this repo use Mastra MCP server support to expose selected internal agents/workflows to external clients, and if so, what auth and tenancy boundary would wrap it?

## Appendix

### Confirmed Local Package Versions

```text
@mastra/core: 1.25.0
@mastra/editor: 0.7.16
@mastra/memory: 1.15.1
@mastra/pg: 1.9.1
```

### Relevant Verification

```bash
pnpm --filter @mastra-mindspace/platform exec tsc --noEmit --pretty false
```

Result: passed.

Previous task 03 verification also passed:

```text
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:smoke
pnpm --filter @mastra-mindspace/platform typecheck
pnpm --filter @mastra-mindspace/app typecheck
pnpm --filter @mastra-mindspace/worker typecheck
git diff --check
```

### Practical Strategy Going Forward

The recommended strategy is:

1. Keep using Mastra's native primitives for orchestration.
2. Keep `buildWorkspaceAgent()` as the platform invariant boundary.
3. Keep local registries as the source of truth for code-defined agents and workflows.
4. Use supervisor agents for flexible delegation across specialists.
5. Use workflows for deterministic graphs.
6. Make `/api/projects/:projectId/mastra/*` the product-facing mindspace-scoped Mastra gateway.
7. Keep `/api/mastra/*` as the native/internal/admin/development surface, not as the app's tenant boundary.
8. Keep bespoke routes such as `/summarize` and `/supervise` as convenience surfaces over the same platform capabilities, not as the only expansion model.
