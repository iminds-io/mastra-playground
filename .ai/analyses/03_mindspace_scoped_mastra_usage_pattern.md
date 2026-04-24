# Mindspace-Scoped Mastra Usage Pattern

**Date**: 2026-04-23
**Author**: Engineering
**Status**: Final
**References**: [`02_native_mastra_multi_agent_runtime_analysis.md`](./02_native_mastra_multi_agent_runtime_analysis.md), [`../tasks/08_mindspace_scoped_mastra_gateway_implementation_plan.md`](../tasks/08_mindspace_scoped_mastra_gateway_implementation_plan.md), [`../knowledges/01_technical_architecture.md`](../knowledges/01_technical_architecture.md), [`../knowledges/02_adding_agents_and_workflows.md`](../knowledges/02_adding_agents_and_workflows.md), [`../knowledges/usage_guide.md`](../knowledges/usage_guide.md), [`packages/platform/src/services/mindspace-mastra-gateway.ts`](../../packages/platform/src/services/mindspace-mastra-gateway.ts), [`packages/platform/src/mastra/registry-metadata.ts`](../../packages/platform/src/mastra/registry-metadata.ts), [`packages/app/src/server/factory.ts`](../../packages/app/src/server/factory.ts), [`packages/worker/src/index.ts`](../../packages/worker/src/index.ts)

---

## Executive Summary

The project now uses a mindspace-scoped Mastra gateway as the main product-facing Mastra API. Product clients should treat the project/mindspace as the unit of execution and call `/api/projects/:projectId/mastra/*` for agent and workflow operations. The server, not the client, supplies the trusted Mastra execution context.

The native `/api/mastra/*` surface still exists, but it is no longer the recommended product entry point for mindspace behavior. It is the native/internal/admin/development surface for framework-level operations such as generic Mastra discovery, editor-backed stored-agent operations, and internal diagnostics.

The core rule is simple: clients choose the permitted primitive to run, but they do not choose the trusted context in which it runs. Project membership, mindspace resolution, request context, and memory/resource ids are all derived server-side.

## Context

The architecture has shifted from a mixed model of bespoke project routes plus raw native Mastra routes toward a clearer product contract:

- project/mindspace is the primary product surface
- Mastra remains the execution engine
- the mindspace-scoped gateway is the trust boundary between them

This analysis documents how to use that pattern going forward, both for client consumers and for engineers extending the codebase.

## Investigation

### The Two API Surfaces

There are now two distinct surfaces with different responsibilities.

#### Native/Internal Mastra Surface

```text
/api/mastra/*
```

Use this surface for:

- framework-native Mastra agent/workflow discovery
- editor-backed stored-agent CRUD
- internal diagnostics
- development workflows
- tests that intentionally validate Mastra’s native route behavior

Do not treat this surface as the default product API for project mindspace behavior.

#### Mindspace-Scoped Product Surface

```text
/api/projects/:projectId/mastra/*
```

Use this surface for:

- product-facing agent execution
- product-facing workflow execution
- any request that must run inside an authenticated project/mindspace
- any flow that depends on a real resolved `Workspace`

This is the primary Mastra surface for application clients.

### Request Mechanics

The request mechanics are now:

```text
client request
  -> Firebase auth
  -> project membership check
  -> mindspace resolution
  -> trusted RequestContext build
  -> primitive exposure policy
  -> Mastra SDK call
  -> shaped response
```

For a gateway request such as:

```text
POST /api/projects/:projectId/mastra/agents/summarizer/generate
```

the server performs these steps:

1. verifies the Firebase bearer token
2. loads project membership and role
3. resolves the project’s active mindspace root/binding
4. constructs the request-scoped Mastra `Workspace`
5. builds `RequestContext` with project/mindspace identity
6. derives server-owned `resourceId` and `threadId`
7. checks whether the primitive is exposed and allowed
8. calls the Mastra SDK

The same model applies to workflows, with workflow runs created and started through the gateway instead of through a raw client-supplied Mastra context.

### What The Client Is Allowed To Supply

Clients may supply:

- `messages`
- `inputData`
- `threadId`
- version-targeting query params such as `?versionId=` or `?status=draft`

Clients must not be trusted for:

- `projectId`
- `organizationId`
- `role`
- `workspace`
- `requestContext`
- `memory.resource`
- any other server-owned execution identity

The gateway explicitly strips the product operation down to safe inputs, then rebuilds the trusted execution context itself.

### Primitive Exposure Policy

Primitive exposure is now explicit rather than accidental.

The source of truth is:

```text
packages/platform/src/mastra/registry-metadata.ts
```

That metadata determines:

- primitive id
- capability (`read` or `write`)
- supported operations
- optional minimum role
- whether the primitive is exposed through the mindspace gateway

This means:

- Mastra registry membership answers “does the runtime know about this primitive?”
- metadata answers “is this primitive available through the product API?”

The current first-release gateway policy is intentionally conservative:

- exposed agents: `summarizer`, `mindspaceReviewer`, `mindspace-supervisor`
- exposed workflow: `ingestPipeline`
- hidden write-capable agent: `projectAgent`

### Product Convenience Routes

Routes such as:

```text
/api/projects/:projectId/summarize
/api/projects/:projectId/supervise
```

still exist and still make sense.

Their new role is:

- convenience product routes with curated request/response contracts
- shortcuts over the same project/mindspace context model
- not the only way the product grows

The scalable extension pattern is now:

```text
register primitive in Mastra
-> add metadata
-> expose it through /api/projects/:projectId/mastra/*
-> optionally add a bespoke convenience route if UX needs one
```

### Workflow Behavior

One of the main reasons this pattern matters is workflow correctness.

The `ingestPipeline` workflow expects a real `workspace` in `RequestContext`. The native/internal workflow route can start the workflow, but it does not automatically guarantee a mindspace-bound product context. The mindspace-scoped gateway fixes that by resolving the mindspace before calling the workflow.

So the product contract is now:

- native/internal workflow routes prove route reachability and framework behavior
- mindspace-scoped workflow routes prove real project/mindspace execution

### Mechanical Mental Model

The most useful mental model is:

```text
Mastra = execution engine
mindspace gateway = trust boundary
project/mindspace = product unit
```

Or operationally:

```text
Mastra knows how to run agents and workflows.
The app knows who may run them, in which mindspace.
The gateway joins those two responsibilities.
```

## Findings

1. The project/mindspace is now the primary product-facing unit for Mastra execution.

2. `/api/mastra/*` still matters, but it is an internal/native surface, not the recommended product surface.

3. The gateway pattern replaces implicit trust with explicit server-owned context construction.

4. Primitive exposure is now a policy decision, not an accidental consequence of runtime registration.

5. Convenience routes remain useful, but the long-term expansion model is the mindspace-scoped gateway.

6. Workflow correctness is materially improved when workflows are started through the mindspace-scoped gateway rather than via raw client-supplied native routes.

## Recommendations

1. Document new product-facing integrations against `/api/projects/:projectId/mastra/*` first.

2. Treat `registry.ts` and `registry-metadata.ts` as a pair. New primitives are not complete until both are updated.

3. Keep the native/internal Mastra surface mounted, but avoid building product client assumptions around it.

4. Use convenience routes only when a simplified or domain-specific request/response contract materially improves UX.

5. Keep write-capable primitives hidden from the gateway until role policy is explicitly designed and tested.

## Open Questions

1. Which write-capable agents, if any, should be exposed through the mindspace gateway next?

2. Should gateway policy stay metadata-based only, or eventually support per-project capability overrides?

3. Should stored-agent/editor read operations eventually be mirrored into the mindspace-scoped product surface, or remain native/internal only?

4. How much of the gateway should be surfaced directly to the frontend versus wrapped in higher-level product services?

## Appendix

### Recommended Client Pattern

Use:

```text
/api/projects/:projectId/mastra/*
```

for:

- product-facing agent execution
- product-facing workflow execution
- any flow requiring a real project mindspace

Use:

```text
/api/mastra/*
```

for:

- editor/admin flows
- internal diagnostics
- framework-native tests

### Current Mindspace-Scoped Gateway Surface

```text
GET  /api/projects/:projectId/mastra/agents
POST /api/projects/:projectId/mastra/agents/:agentId/generate
POST /api/projects/:projectId/mastra/agents/:agentId/stream
GET  /api/projects/:projectId/mastra/workflows
POST /api/projects/:projectId/mastra/workflows/:workflowId/create-run
POST /api/projects/:projectId/mastra/workflows/:workflowId/start
```

### Current First-Release Exposure

```text
agents:
- summarizer
- mindspaceReviewer
- mindspace-supervisor

workflows:
- ingestPipeline
```
