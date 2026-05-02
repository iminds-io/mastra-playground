# Porting And Reusing mastra-mindspace

**Category:** Reference
**Tags:** reuse, porting, architecture, adapters, integration
**Last Updated:** 2026-04-23
**References:** [`01_technical_architecture.md`](./01_technical_architecture.md), [`02_adding_agents_and_workflows.md`](./02_adding_agents_and_workflows.md), [`usage_guide.md`](./usage_guide.md)

---

## Purpose

This guide explains how to reuse `mastra-mindspace` in other projects without copying it blindly.

The repo is reusable, but it is not a drop-in generic SDK yet. The main reusable asset is the architecture and the platform layer. The main non-reusable parts are the current identity assumptions, domain model, and delivery surfaces.

Use this document when:

- forking `mastra-mindspace` into a new product
- extracting parts of it into another Worker or app
- deciding what to keep, replace, or generalize
- designing a new delivery surface such as Telegram, Slack, email, or an MCP server

---

## Executive Summary

The cleanest mental model is:

```text
Mastra = execution engine
packages/platform = reusable product core
packages/app and packages/worker = delivery adapters
auth / channel model / deployment config = project-specific shells
```

If you are building a new project, do not start by rewriting agents or workflows. Start by deciding whether the new project can keep the current:

- principal model
- project and membership model
- mindspace storage model
- conversation model
- transport surface

If most of those stay the same, forking is efficient.

If several of those change, still fork the repo, but treat the first phase as an adapter refactor rather than a feature sprint.

---

## What Reuses Well

These parts are strong reuse candidates.

### `packages/platform`

This is the most reusable layer in the repo.

It already centralizes:

- Mastra instance construction
- agent and workflow registries
- request-context building
- mindspace resolution
- mindspace provisioning and reconciliation
- chat/thread orchestration
- project-scoped agent execution
- mindspace-scoped Mastra gateway behavior

If you want agentic mindspace behavior in another project, this package is the starting point.

### Mastra composition model

The following patterns port well:

- code-defined registries for agents and workflows
- `buildMindspaceAgent()` as the common agent factory
- explicit primitive metadata in `mastra/registry-metadata.ts`
- one gateway that exposes permitted primitives through a product-scoped surface
- convenience routes only when the request or response contract needs to differ from the generic gateway

### Mindspace runtime model

This design is broadly reusable:

- durable project record in Postgres
- active mindspace binding in Postgres
- request-scoped Mastra `Workspace`
- server-built `RequestContext`
- server-owned `resourceId` and `threadId`

That model is transport-agnostic. HTTP, Telegram, Slack, CLI, cron, or MCP can all feed into it.

### Worker-safe Mastra runtime choices

These choices are reusable for any Cloudflare-based fork:

- request-scoped runtime boot
- Neon HTTP adapter for app queries
- Neon WebSocket pool for Mastra storage
- `observationalMemory: false`
- `disableInit: true` plus out-of-band `initMastraSchema()`
- R2-backed `Workspace` creation per request

If the new project also runs on Cloudflare Workers, keep these unless you have a tested reason to change them.

---

## What Is Project-Specific Today

These are the parts that make `mastra-mindspace` a product, not just a framework starter.

### Firebase-first identity

The platform currently assumes Firebase user identity almost everywhere:

- `firebaseUid` is the principal handle in service inputs
- `loadProjectContext()` resolves membership from `users.firebase_uid`
- HTTP middleware verifies Firebase ID tokens directly
- bootstrap and test flows assume Firebase-backed users

This is the biggest portability constraint.

If the new project does not use Firebase as its primary identity layer, plan to refactor this first.

### Current domain model

The repo currently assumes:

- organizations
- organization memberships
- projects
- project channels
- channel threads
- messages stored through Mastra memory

That model is good for collaborative project chat, but not every product wants exactly that shape.

Examples:

- a Telegram bot may want one chat room mapped to one project
- a support workflow may want one external ticket mapped to one thread
- an internal ops assistant may not need channels at all

### Current delivery surfaces

The existing entry points are tailored to:

- Hono HTTP app in `packages/app`
- Cloudflare Worker HTTP app in `packages/worker`
- browser frontend in `packages/web`, with shared React primitives in `packages/ui`

Those are adapters, not the core.

A new fork may keep them, trim them, or replace them with:

- Telegram webhook worker
- MCP server
- Slack bot
- CLI
- cron-driven automation

### Current operational defaults

The repo is also opinionated about:

- OpenRouter as the model provider
- Neon as the main database
- Cloudflare R2 for mindspace storage
- Cloudflare Workers as the deployment target
- admin email allowlist for editor mutations

These are replaceable, but they are real assumptions in the current repo.

---

## Reuse Modes

There are three realistic reuse modes.

### Mode 1: Near-clone fork

Use this when the new project still wants:

- project and membership model
- mindspace filesystem model
- HTTP API
- Firebase identity
- similar chat and thread behavior

Strategy:

- fork the repo
- rename the product identity
- trim unused routes and UI
- add new agents, tools, and integrations

This is the fastest path.

### Mode 2: Adapter-first fork

Use this when the new project wants the same core but a different outer surface.

Examples:

- Telegram on top of the same project and mindspace model
- Slack on top of the same project and thread model
- MCP on top of the same gateway and execution model

Strategy:

- keep most of `packages/platform`
- add a new adapter package or worker
- introduce a principal adapter layer
- map the new transport onto existing services

This is the recommended path for `mindspace-01`.

### Mode 3: Core extraction fork

Use this when the new project wants the Mastra + mindspace runtime ideas but not the current app domain.

Examples:

- no organizations
- no channels
- different authorization model
- different persistence model

Strategy:

- keep the Mastra, mindspace, and execution modules
- replace the project-context and chat layers
- build a new domain shell around the same runtime primitives

This is the most work but still easier than starting from zero.

---

## Portability Boundary

When forking, treat the repo as four layers.

### Layer 1: Runtime substrate

Keep by default.

- Mastra storage and runtime setup
- Neon and R2 Worker-safe patterns
- `buildMindspaceAgent()`
- `buildExecutionContext()`
- mindspace resolver and provisioning logic

### Layer 2: Product core

Keep if the new product still has projects, memberships, and mindspaces.

- project context loading
- summarization and supervisor services
- mindspace-scoped Mastra gateway
- project and mindspace repositories

### Layer 3: Delivery adapters

Replace or extend depending on the new surface.

- Node app
- Worker HTTP app
- web frontend

### Layer 4: Identity and policy

Usually refactor first for serious reuse.

- Firebase verification
- `firebaseUid`-based service APIs
- admin email allowlist
- role resolution query

---

## Recommended Refactors Before Heavy Reuse

If you want this repo to be easier to reuse across future projects, make these structural changes first.

### 1. Generalize the principal model

Current state:

```text
service input -> firebaseUid
```

Better reusable shape:

```ts
type PrincipalRef =
  | { kind: 'firebase'; uid: string }
  | { kind: 'telegram'; chatId: string; userId?: string }
  | { kind: 'system'; id: string };
```

Then refactor service entry points from:

```ts
{ firebaseUid: string; projectId: string; ... }
```

to something like:

```ts
{ principal: PrincipalRef; projectId: string; ... }
```

This is the most important long-term improvement.

### 2. Separate authorization lookup from transport identity

Current state:

- `loadProjectContext()` both interprets the identity and resolves authorization

Better reusable shape:

- `resolveActor(principal)` converts transport identity into an internal actor
- `loadProjectAccess(actorId, projectId)` resolves membership and role

That split makes Telegram, Slack, CLI, cron, or MCP much easier to add.

### 3. Make conversation mapping explicit

Current state:

- channels and threads are assumed to be the main conversation surface

Better reusable shape:

- a mapping layer translates an external conversation into:
  - project id
  - channel id
  - thread id
  - resource id

Examples:

- Telegram chat id -> project id
- Telegram command or reply thread -> channel/thread
- Slack channel -> project channel
- MCP session -> synthetic thread id

### 4. Treat adapters as thin shells

A new transport should mostly:

- authenticate or identify the caller
- map transport payload into a domain call
- invoke platform services
- map the response back to transport semantics

Do not rebuild business logic inside the adapter.

### 5. Move product-specific defaults behind configuration

Candidates:

- default project bootstrap behavior
- default channel creation
- default agent exposure policy
- admin gating policy
- model defaults
- mindspace root naming conventions

The more these move behind config or small interfaces, the easier reuse becomes.

---

## Forking Checklist

When starting a new project from this repo, follow this order.

### Step 1: Decide the reuse mode

Choose one of:

- near-clone fork
- adapter-first fork
- core extraction fork

If this is unclear, stop and decide it first. Most downstream confusion comes from skipping this step.

### Step 2: Define the principal model

Write down:

- who the caller is
- how the caller is authenticated or identified
- how that caller maps to an internal actor
- how that actor gets project access

If you cannot answer this cleanly, do not start wiring transports yet.

### Step 3: Define the conversation model

Write down:

- what starts a thread
- what identifies a thread
- whether the system has channels
- whether the transport already has its own conversation primitive

### Step 4: Decide what packages survive

Typical outcomes:

- keep `packages/platform`
- keep `packages/worker`
- maybe keep `packages/app`
- maybe remove `packages/web` (browser frontend) and `packages/ui` (its shared React primitives) together — they only earn their keep if a browser frontend survives
- maybe add `packages/telegram-worker`

### Step 5: Replace product identity

Update:

- package names
- worker name
- docs
- env examples
- deploy docs

Do this early so the fork does not carry stale product references for weeks.

### Step 6: Refactor identity seams

Before large feature work:

- replace `firebaseUid`-only assumptions
- add a principal abstraction
- split actor resolution from project authorization

### Step 7: Add the new transport adapter

Only after the principal and conversation models are clear.

### Step 8: Re-verify end-to-end behavior

At minimum:

- unit tests
- integration tests
- transport E2E tests
- deployed smoke test if applicable

---

## What To Keep When Reusing

Keep these unless the new project has a good reason not to.

### Keep the mindspace-scoped gateway pattern

The gateway is one of the best architectural decisions in the repo.

Why:

- product clients should not call raw runtime APIs with trusted context
- the server should resolve mindspace, project access, memory ids, and policy
- one generic surface scales better than many ad hoc routes

Even if the new product is not HTTP-first, keep the same idea:

```text
adapter input -> trusted product context -> Mastra primitive call
```

### Keep code-defined registries

Do not scatter agent and workflow registration across adapters.

Keep:

- one agent registry
- one workflow registry
- one metadata registry for exposure policy

### Keep request-scoped runtime objects

In Cloudflare Workers, do not relax this.

Keep:

- request-scoped DB adapter
- request-scoped mindspace factory
- request-scoped Mastra instance

### Keep server-owned thread and resource derivation

Clients and transports may suggest identifiers, but the server should stay authoritative about trusted scope and naming.

---

## What To Change Early In A Fork

Change these quickly so they do not fossilize.

### Identity terminology and assumptions

If the project is not Firebase-first, remove the naming immediately.

Do not build Telegram or Slack on top of functions that are still pretending every caller is a Firebase user.

### Bootstrap flows

`bootstrapProjectForPrincipal()` is useful for local development, but many forks will need a different provisioning story.

Examples:

- Telegram-first project may bootstrap a project from a chat registration flow
- enterprise project may bootstrap from an admin UI
- MCP-first project may bootstrap from a config file

### UI package and frontend

If the new product is not a browser app, remove or de-emphasize `packages/web` early.

### Domain language

Update:

- route names
- event names
- thread/channel terminology
- docs

This matters more than it seems. Stale product language causes architectural confusion later.

---

## Anti-Patterns When Reusing This Repo

Avoid these.

### 1. Copying the worker and rewriting logic inside it

Bad outcome:

- business logic fragments across adapters
- tests become adapter-specific
- platform layer stops being authoritative

### 2. Adding a new transport without fixing identity seams

Bad outcome:

- Telegram or Slack users get stuffed into fake Firebase ids
- authorization becomes ad hoc
- auditability gets worse

### 3. Building one-off routes instead of using the gateway pattern

Bad outcome:

- route sprawl
- inconsistent memory and request-context behavior
- primitive exposure policy becomes impossible to reason about

### 4. Letting external callers provide trusted context

Never trust caller-supplied:

- project id ownership
- role
- organization id
- runtime `Workspace`
- memory resource id

### 5. Mixing transport semantics into core services

Examples:

- Telegram-specific formatting inside summarization services
- Slack-specific retry logic inside project-context loading
- webhook concepts inside Mastra execution helpers

Keep that logic in adapters.

---

## How To Better Modify mastra-mindspace Itself

If the goal is not just to fork the repo once, but to make `mastra-mindspace` a better starter for future reuse, these are the highest-value improvements.

### 1. Introduce `PrincipalRef`

This is the single best investment.

It would let the repo support:

- Firebase web users
- Telegram users and chats
- Slack users and channels
- system automation
- MCP sessions

without rewriting every service signature again.

### 2. Add actor-resolution interfaces

Example shape:

```ts
type ActorResolver = (principal: PrincipalRef) => Promise<{ actorUserId: string }>;
type ProjectAccessResolver = (actorUserId: string, projectId: string) => Promise<ProjectContext>;
```

That would move the repo from “Firebase app with Mastra” toward “Mastra product core with pluggable identity.”

### 3. Add external conversation mapping tables

Examples:

- `telegram_chat_bindings`
- `slack_channel_bindings`
- `external_thread_bindings`

That makes it easier to map external transports to internal channels and threads without hacks.

### 4. Add adapter packages, not giant adapters

Instead of overloading `packages/worker`, consider dedicated packages when transport logic becomes substantial:

- `packages/telegram-worker`
- `packages/slack-worker`
- `packages/mcp-server`

They can still all depend on `@mastra-mindspace/platform`.

### 5. Add a dedicated outbound integration layer

For actions like “send a Telegram message,” do not hide the integration only inside transport handlers.

Add explicit outbound services or tools so agents can use them intentionally and testably.

---

## Recommended Strategy For New Projects

If you are starting a new project from this repo, use this default strategy.

### Recommended sequence

1. Fork the repo.
2. Rename project identity immediately.
3. Decide reuse mode.
4. Define principal model.
5. Define conversation model.
6. Refactor identity seams in `packages/platform`.
7. Keep `packages/platform` as the core.
8. Add or replace adapters.
9. Trim unused surfaces.
10. Rebuild tests around the new entry points.

### Default advice

- reuse the platform core
- keep the mindspace gateway pattern
- keep Mastra registries centralized
- keep Worker-safe runtime behavior
- refactor identity before transport complexity grows

---

## Applying This To Future Integrations

A new integration should answer four questions before implementation starts:

1. Who is the principal?
2. How does that principal get access to a project or mindspace?
3. What external event starts or continues a thread?
4. What outbound capabilities should the agent have in that transport?

If those four answers are explicit, the integration work is usually straightforward.

If they are vague, the implementation will drift into ad hoc transport logic.

---

## Bottom Line

`mastra-mindspace` is reusable as a serious starter architecture.

The best reusable assets are:

- the platform layer
- the mindspace runtime model
- the Mastra registry and gateway patterns
- the Cloudflare-safe execution model

The least reusable parts are:

- Firebase-only identity assumptions
- current project/channel/thread semantics
- transport-specific delivery layers

So the right reuse strategy is usually:

```text
keep the core
adapt the identity layer
adapt the transport layer
preserve the gateway and runtime patterns
```

That is the path that gives you the most leverage with the least architectural thrash.
