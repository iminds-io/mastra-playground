# Reusable Mindspace Package Extraction Design

**Status:** Target architecture design
**Intended Timing:** Execute after `mindspace-01` Telegram phase 1 is complete
**Depends On:** `2026-04-23-mindspace-01-telegram-integration-implementation-plan.md`

---

## Purpose

This document describes the post-`mindspace-01` target architecture for extracting reusable packages from the current fork-based architecture.

The immediate strategy for `mindspace-01` is a full fork of `mastra-mindspace`. That is the right short-term move.

The next architectural step, after the Telegram implementation is stable, is to extract the reusable core into packages so future projects do not need to fork the whole codebase.

This document defines:

- what should become reusable packages
- what should remain project-specific
- the package boundaries
- the dependency rules
- the migration order
- the non-goals

---

## Why Extraction Happens After The Telegram Build

Package extraction is explicitly deferred until after `mindspace-01` Telegram phase 1 because:

- the principal model still needs to be generalized
- Telegram will reveal the real seams between core logic and transport logic
- extracting too early would package the current Firebase/product assumptions instead of the improved architecture

So the correct sequence is:

1. fork `mastra-mindspace`
2. implement `mindspace-01`
3. prove the principal abstraction and Telegram adapter model
4. extract reusable packages from the stabilized architecture

This is a deliberate “prove first, extract second” strategy.

---

## Current Architectural Problem

Today, the architecture is reusable in practice but not reusable as packages.

The problem is not code quality. The problem is boundary shape.

Right now:

- `packages/platform` contains highly reusable core logic
- but it also contains product-specific assumptions
- and the repo still couples identity, product domain, and transport more tightly than a reusable package ecosystem should

Examples:

- service inputs still center around product-specific principal assumptions
- DB schema mixes reusable mindspace concerns and product-specific domain concerns
- the current Worker package is both a general runtime adapter and a specific product API surface

That means the code is best reused by forking, not by package consumption.

The target architecture should change that.

---

## Design Goals

The extracted package architecture should:

- make the core agentic mindspace runtime reusable across multiple products
- support multiple principal types
- support multiple transport adapters
- preserve the mindspace-scoped gateway pattern
- preserve the Cloudflare-safe Mastra runtime decisions
- keep product-specific domain logic out of reusable packages where possible

It should also:

- let a future project add Telegram, Slack, MCP, HTTP, or CLI adapters without rewriting core logic
- keep package boundaries clear enough that each package has a single reason to change

---

## Non-Goals

The extraction architecture should **not** aim to:

- produce a framework with every transport built in
- hide all product choices behind extreme abstraction
- remove the ability to build product-specific services in app code
- force every project to use the same database schema
- support every runtime in the first extraction pass

This should be a practical package architecture, not a universal platform rewrite.

---

## Recommended Package Architecture

### Package 1: `@mindspace/core`

This becomes the main reusable runtime core.

Responsibilities:

- mindspace execution concepts
- execution-context building
- request-context helpers
- resource and thread derivation helpers
- agent factory helpers such as `buildMindspaceAgent()`
- code-defined agent and workflow registry helpers
- registry metadata model
- generic gateway orchestration primitives

What should move here:

- `mastra/execution/*`
- reusable parts of `mastra/agents/*`
- reusable parts of `mastra/workflows/*`
- reusable parts of `mastra/registry-metadata.ts`
- shared gateway derivation helpers

What should not move here:

- project membership queries
- product-specific repositories
- Firebase token verification
- Telegram webhook code

### Package 2: `@mindspace/runtime-cloudflare`

This package holds Cloudflare-specific runtime behavior.

Responsibilities:

- Worker-safe runtime boot
- Neon HTTP query adapter
- Neon WebSocket Mastra storage setup
- R2-backed `Workspace` factory
- Cloudflare-specific runtime helpers

What should move here:

- Worker-safe DB adapter wiring
- `createMastraStorage()` patterns that are runtime-specific
- R2 mindspace factory helpers

Why this should be separate:

- Cloudflare decisions are reusable across multiple products
- but they should not be forced into every consumer of the core package

### Package 3: `@mindspace/identity`

This package holds principal and actor resolution contracts.

Responsibilities:

- `PrincipalRef`
- actor resolution interfaces
- project access resolution interfaces
- role and capability model types

Possible exports:

```ts
type PrincipalRef =
  | { kind: 'firebase'; uid: string }
  | { kind: 'telegram'; chatId: string; userId?: string }
  | { kind: 'system'; id: string };

type ActorResolver = (principal: PrincipalRef) => Promise<{ actorUserId: string }>;
type ProjectAccessResolver = (actorUserId: string, projectId: string) => Promise<ProjectAccess>;
```

What should stay out:

- raw Firebase SDK verification
- raw Telegram webhook parsing

Those belong in adapter-specific packages or the product app.

### Package 4: `@mindspace/telegram`

This becomes the reusable Telegram adapter package.

Responsibilities:

- outbound Telegram send service
- Telegram tool wrappers
- Telegram chat and thread binding helpers
- Telegram command parsing helpers
- optional grammY-based adapter helpers

The key rule:

- transport-neutral send logic should live here
- product-specific mapping policy should stay in the app unless generalized cleanly

This package should make it easy for any future product to add:

- agent-to-Telegram messaging
- Telegram webhook-driven thread triggers

without copying the whole implementation again.

### Package 5: `@mindspace/http-hono`

Optional but recommended if the HTTP gateway becomes a repeated pattern.

Responsibilities:

- mounting the mindspace gateway onto Hono
- shared auth middleware contracts
- route composition helpers for product-scoped Mastra APIs

This package should remain thin.

If the Hono adapter logic stays too product-specific, keep it in the app repo instead of forcing extraction.

---

## What Should Stay In The Product Repo

Even after extraction, some things should remain app-specific.

These include:

- product-specific DB schema
- project/channel/thread domain decisions
- bootstrapping flows
- admin policies
- env defaults
- deployment names
- UI
- product-specific routes

Examples for `mindspace-01`:

- the exact mapping of Telegram chat -> project -> default channel
- any JB2026-specific reporting or moderation behavior
- operator workflow decisions

Extraction should separate reusable runtime from reusable product patterns, but it should not erase product ownership.

---

## Dependency Rules

Use these rules to avoid architectural drift.

### Allowed dependency direction

```text
product app
  -> @mindspace/http-hono
  -> @mindspace/telegram
  -> @mindspace/runtime-cloudflare
  -> @mindspace/identity
  -> @mindspace/core
```

### Forbidden dependency direction

`@mindspace/core` must not depend on:

- Telegram
- Firebase
- grammY
- Hono
- product repositories

`@mindspace/identity` must not depend on:

- Cloudflare runtime code
- Hono
- Telegram SDKs

`@mindspace/telegram` must not depend on:

- product UI
- Firebase verification code

The goal is:

- core stays transport-neutral
- identity stays transport-neutral
- adapters depend downward, never upward

---

## Recommended Extraction Boundaries

### Extract first

These are the best first candidates:

- principal types and actor/access contracts
- execution-context helpers
- mindspace agent builder
- registry metadata types
- Telegram send service
- Telegram tool wrappers
- Cloudflare runtime factory helpers

### Extract later

These are likely reusable, but should move only after phase-1 behavior is stable:

- generic gateway orchestration helpers
- reusable conversation-binding abstractions
- generic outbound transport tool patterns

### Keep local until proven

These should stay in `mindspace-01` until there is clear evidence they generalize:

- project/channel/thread schema
- bootstrap flows
- default route contracts
- role policy defaults

---

## Migration Strategy

Use a staged extraction, not a big-bang rewrite.

### Stage 1: Stabilize `mindspace-01`

Before any extraction:

- Telegram integration works
- principal abstraction works
- tests are green
- the team understands the actual stable seams

### Stage 2: Extract identity contracts

Move:

- `PrincipalRef`
- actor resolution interfaces
- access resolution interfaces

This is the safest first extraction because it simplifies everything else.

### Stage 3: Extract Cloudflare runtime helpers

Move:

- request-scoped Worker boot patterns
- R2 `Workspace` factory helpers
- Neon runtime helpers

### Stage 4: Extract Telegram integration package

Move:

- outbound send service
- Telegram tool wrappers
- command parsing helpers
- reusable binding helpers

### Stage 5: Extract core execution package

Move:

- generic execution-context helpers
- agent factory helpers
- gateway derivation helpers
- reusable registry metadata structures

### Stage 6: Rewire `mindspace-01` to consume packages

Only after the packages are stable:

- replace local imports with package imports
- keep thin local product shells

This stage proves the extraction is real, not theoretical.

---

## Package Interface Strategy

When extracting packages, prefer:

- narrow interfaces
- explicit dependency injection
- no hidden global state

Examples:

### Good

```ts
createTelegramSendService({ botToken, fetchImpl })
```

```ts
buildExecutionContext({ projectContext, mindspaceRootPath, workspace, resourceId, threadId })
```

```ts
resolveActorFromPrincipal(principal, resolvers)
```

### Bad

```ts
sendTelegramMessageFromEnv(...)
```

```ts
loadProjectContextFromGlobalFirebase(...)
```

```ts
createWorkerRuntimeAndRoutesAndPolicies(...)
```

Packages should expose composable pieces, not giant application constructors.

---

## Testing Strategy For Extraction

Each extracted package should ship with tests at its own layer.

### `@mindspace/core`

- unit tests
- no transport dependencies

### `@mindspace/identity`

- unit tests
- contract-level tests

### `@mindspace/runtime-cloudflare`

- unit tests plus targeted integration tests where needed

### `@mindspace/telegram`

- unit tests for outbound send and parsing
- integration tests for binding behavior
- Worker E2E coverage in the consuming app

The consuming product should still keep end-to-end tests. Package extraction should reduce duplication, not remove product verification.

---

## Risks And Failure Modes

### Risk 1: Extracting too much too early

Failure mode:

- packages become thin wrappers around unfinished app assumptions

Mitigation:

- extract only after `mindspace-01` proves the seams

### Risk 2: Packaging product-specific domain logic

Failure mode:

- reusable packages become tied to channels, thread semantics, or JB2026-specific policy

Mitigation:

- keep domain decisions in the product app until at least a second consumer exists

### Risk 3: Creating adapter packages with hidden business logic

Failure mode:

- Telegram package becomes a second application core

Mitigation:

- keep adapters thin
- keep core logic in `@mindspace/core` or the product app

### Risk 4: Identity abstractions that are too clever

Failure mode:

- the abstraction becomes harder to use than the original Firebase-only model

Mitigation:

- keep `PrincipalRef` small
- keep actor and access resolution explicit

---

## Recommended End State

After extraction, the desired long-term shape is:

```text
mindspace-01 app repo
  - product schema
  - product routes
  - product policy
  - product docs

@mindspace/core
  - reusable execution and agent/runtime helpers

@mindspace/identity
  - reusable principal and access contracts

@mindspace/runtime-cloudflare
  - reusable Worker-safe runtime helpers

@mindspace/telegram
  - reusable Telegram transport helpers and tools
```

This gives future projects two reuse paths:

1. fork the app repo if they want a similar product quickly
2. consume the extracted packages if they want a more custom product

That is a much stronger long-term architecture than forcing all future work through full forks forever.

---

## Recommendation

The extraction architecture should be pursued, but only after the Telegram-enabled `mindspace-01` fork is stable.

The highest-priority extraction targets are:

1. identity contracts
2. Cloudflare runtime helpers
3. Telegram transport package
4. core execution and registry helpers

That order gives the best balance of:

- reuse
- architectural clarity
- low migration risk

The core principle for the extraction stage is:

```text
extract proven seams
do not package assumptions that are still changing
```

That is the strategy most likely to produce genuinely reusable packages rather than a second layer of accidental coupling.
