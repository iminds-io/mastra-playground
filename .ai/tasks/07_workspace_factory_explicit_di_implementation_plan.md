# Task 07: Workspace Factory — Explicit DI (kill module-scoped singleton)

**Status**: Planning
**Created**: 2026-04-17
**Updated**: 2026-04-17
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: ~1 focused session (TDD, one service at a time)
**Dependencies**: Tasks 04/05 (Mastra-native surface) — this builds on Pass 1–3 of the Mastra-native refactor
**References**: [analyses/ — none yet, see §Context, packages/platform/src/workspace/workspace-context.ts, packages/platform/src/workspace/resolver.ts, packages/platform/src/workspace/reconciliation.ts, packages/platform/src/mastra/execution/execute-agent.ts, packages/platform/src/services/chat.ts, packages/platform/src/services/summarization.ts, packages/app/src/server/factory.ts, packages/worker/src/index.ts]

---

## Context

Pass 1–3 of the Mastra-native refactor made workspace-aware agents correct (tools registered, runtime context validated, typed contract split). One load-bearing piece was left alone: the **workspace factory** — the function that constructs a `Workspace` from a base path, using either `LocalFilesystem` (Node) or `S3Filesystem` (Workers).

Today the factory is held in a module-scoped mutable singleton at `packages/platform/src/workspace/workspace-context.ts:8`:

```ts
let currentFactory: WorkspaceFactory | undefined;
export function setWorkspaceFactory(factory: WorkspaceFactory): void { currentFactory = factory; }
export function getWorkspaceFactory(): WorkspaceFactory { /* throws if unset */ }
```

Entry points register via side effect — `packages/worker/src/index.ts:78` sets an S3 factory per request, `packages/platform/test/helpers/fixtures.ts:13` side-effect-imports `workspace/factory.ts` for integration tests. **`packages/app/src/index.ts` never registers anything.** Every agent-touching route on the local Node server would throw `"Workspace factory has not been initialized"` at call time. This was not caught by `packages/app/test/integration/*` because every integration test mocks `executeProjectAgent` or stops at 401 before reaching the factory.

Additional issues the current design causes:
- **Test parallelism is unsafe.** Two tests in the same process can't use different factories.
- **Discovery is runtime-only.** Missing registration doesn't fail at boot; it fails on first agent request.
- **Flow is inconsistent.** Workspace *instances* already travel explicitly via `RequestContext`. Only the *factory* uses hidden state.
- **Double work.** `execute-agent.ts:35` and `services/chat.ts:216` call `resolveWorkspaceForProject()` (which already builds a workspace) AND then call `getWorkspaceFactory()` again on the same path — constructing two identical workspaces per request. `summarization.ts:60` already does it right (uses `resolved.workspace`).

## Goal state (architecture)

Every function that needs a workspace either:
1. Takes a `resolveWorkspaceForProject`-result in and uses `resolved.workspace`, **or**
2. Takes `workspaceFactory: WorkspaceFactory` as a required field on its `deps` argument.

`workspace-context.ts` (the `set/get` pair) is deleted. The `WorkspaceFactory` type is preserved and moved to the entry-point type surface. Each entry point (`packages/app`, `packages/worker`) constructs one factory at boot and threads it into handler deps. Integration/unit tests pass an in-memory or local factory directly. No module-scoped mutable state remains in workspace resolution.

### Target dep shape

```ts
// packages/platform/src/platform-deps.ts (new)
export type WorkspaceFactory = (basePath: string) => Promise<Workspace>;
export type PlatformDeps = {
  mastra: Mastra;
  workspaceFactory: WorkspaceFactory;
};
```

Every existing `{ mastra }` deps type becomes `Pick<PlatformDeps, 'mastra' | 'workspaceFactory'>` (or the alias). Services that don't need a Mastra instance (reconciliation, resolver) take `Pick<PlatformDeps, 'workspaceFactory'>` only.

## Success criteria

- [ ] `packages/platform/src/workspace/workspace-context.ts` is deleted.
- [ ] `packages/platform/src/workspace/factory.ts` is deleted (side-effect file no longer needed).
- [ ] No file in `packages/platform/src` contains the strings `setWorkspaceFactory`, `getWorkspaceFactory`, or a fresh module-level mutable factory.
- [ ] `packages/app/src/server/factory.ts` constructs a `LocalFilesystem`-backed `WorkspaceFactory` once inside `createApp` and threads it via deps.
- [ ] `packages/worker/src/index.ts` constructs the `S3Filesystem` factory inside `bootRequest` and threads it via deps (no `setWorkspaceFactory` call).
- [ ] `packages/platform/test/helpers/fixtures.ts` no longer side-effect-imports `workspace/factory`; it constructs the factory locally and returns it alongside the seeded project.
- [ ] Hitting any agent-touching route on the local Node server (`pnpm -F @hono-workspace/app dev`) no longer throws "factory not initialized".
- [ ] All 117 unit tests still pass. All integration tests still pass. Typecheck clean on all five packages.
- [ ] `packages/app` and `packages/worker` have symmetric boot shapes — both visibly construct and pass a factory.

## Critical constraints (do not violate)

- **TDD throughout.** Every service change: red test first, then change, then green. No bulk edits.
- **Keep changes minimal per commit.** One service per commit, tests in the same commit.
- **Preserve `resolveWorkspaceForProject` semantics.** It must keep returning `{ root, binding, workspace }`. Callers that already use `resolved.workspace` must keep working unchanged.
- **Do not change `buildExecutionContext`**'s contract. It already takes `workspace` explicitly — that part is already correct.
- **Do not rename `WorkspaceFactory` or change its signature.** `(basePath: string) => Promise<Workspace>`.
- **Do not add backwards-compat shims.** When a deps arg becomes required, it becomes required. No optional-with-fallback.
- **`observationalMemory: false`** and all other CF-Workers constraints from Task 05 remain untouched.

## Approach

Four phases. Each phase stays green — typecheck + unit + integration pass after every task inside a phase.

### Phase ordering rationale

- Phase 1 removes redundant factory calls first. That shrinks the surface we need to refactor from 4 sites to 2 (`resolver.ts`, `reconciliation.ts`) before we touch DI.
- Phase 2 defines the shared `PlatformDeps` type and plumbs it through *one* service (`summarization.ts`) end-to-end as a proof of shape before touching the bigger ones.
- Phase 3 propagates the pattern to the remaining services.
- Phase 4 deletes the singleton and wires the entry points.

---

## Phase 1 — Remove redundant factory calls

**Goal:** Make `execute-agent.ts` and `services/chat.ts` use `resolved.workspace` instead of separately calling `getWorkspaceFactory()`. This is a pure behavioral cleanup with zero DI changes.

### Task 1.1: Unit test pins current behavior of `executeProjectAgent`

**Files:**
- Read: `packages/platform/test/integration/execute-agent.integration.test.ts` (understand current coverage)
- Possibly update: the same file, to assert the workspace it resolves matches the one passed into `buildExecutionContext`.

**Step 1 — Confirm coverage.** Grep the test for assertions on the workspace instance. If the test currently passes a mocked `createRuntimeWorkspace` via deps, the redundant call is *already* shadowed in tests — which means we have behavioral coverage of the ideal path, just not of production. Document this finding in the commit message.

**Step 2 — Red.** Add a unit test that proves `executeProjectAgent` calls `resolveWorkspaceForProject` exactly once and uses its `.workspace` result. Assert by spying on the factory: it should be called exactly once per `executeProjectAgent` call (today it's called twice — once by resolver, once directly).

### Task 1.2: Simplify `executeProjectAgent`

**File:** `packages/platform/src/mastra/execution/execute-agent.ts`

**Before (line 34–37):**
```ts
const resolvedWorkspace = await resolveWorkspaceForProject(input.projectId);
const runtimeWorkspace = await (deps.createRuntimeWorkspace ?? getWorkspaceFactory())(
  resolvedWorkspace.root.root_path,
);
```

**After:**
```ts
const resolved = await resolveWorkspaceForProject(input.projectId);
// resolved.workspace is already constructed from the active workspace factory.
```

Then `buildExecutionContext({ ..., workspace: resolved.workspace, workspaceRootPath: resolved.root.root_path, ... })`.

Drop `createRuntimeWorkspace` from `ExecuteProjectAgentDeps` — callers that want to inject a test workspace will inject it at the factory level in Phase 2.

**Green.** Run unit tests for `execute-agent`. Integration test.

### Task 1.3: Simplify `buildExecutionContext` in `services/chat.ts`

**File:** `packages/platform/src/services/chat.ts:209-226`

Same mechanical change — the local `buildExecutionContext` helper inside `chat.ts` drops its `getWorkspaceFactory` call and uses `resolved.workspace`.

**Green.** Chat-service tests, stream-channel-reply integration.

### Phase 1 done when

- Only `src/workspace/resolver.ts:15` and `src/workspace/reconciliation.ts:13` still call `getWorkspaceFactory`.
- Every higher-level service uses `resolved.workspace` as the single source of truth.
- `ExecuteProjectAgentDeps` no longer has the `createRuntimeWorkspace` escape hatch.

---

## Phase 2 — Introduce `PlatformDeps`, convert `summarization.ts` as the exemplar

**Goal:** Establish the deps shape on the simplest service so we can see the entire pattern in one file before propagating.

### Task 2.1: Add `PlatformDeps` and move `WorkspaceFactory`

**New file:** `packages/platform/src/platform-deps.ts`

```ts
// ABOUTME: Ambient runtime dependencies threaded through every principal-flow service.
// ABOUTME: Constructed once per request at the entry point (app, worker) and passed down.

import type { Mastra } from '@mastra/core';
import type { Workspace } from '@mastra/core/workspace';

export type WorkspaceFactory = (basePath: string) => Promise<Workspace>;

export type PlatformDeps = {
  mastra: Mastra;
  workspaceFactory: WorkspaceFactory;
};
```

Re-export from `packages/platform/src/index.ts`.

Leave `src/workspace/workspace-context.ts` in place for now — will be deleted in Phase 4. Update the existing `WorkspaceFactory` type import site in `workspace-context.ts` to pull from the new file (single source of truth) or just delete the duplicate — doesn't matter because Phase 4 removes the whole file.

### Task 2.2: `resolveWorkspaceForProject(projectId, { workspaceFactory })`

**File:** `packages/platform/src/workspace/resolver.ts`

**Red.** New unit test: `resolveWorkspaceForProject` calls the supplied factory exactly once with the root path. Add a second test: throws `TypeError` / assertion if factory is missing (use a `requireFactory` assertion mirroring Pass 3's `requireWorkspace`).

**Change:**
```ts
import type { WorkspaceFactory } from '../platform-deps';

export async function resolveWorkspaceForProject(
  projectId: string,
  deps: { workspaceFactory: WorkspaceFactory },
) {
  const [root, binding] = await Promise.all([
    getActiveWorkspaceRootByProjectId(projectId),
    getActiveWorkspaceBinding(projectId),
  ]);
  if (!root || !binding) throw new Error('Workspace is not provisioned for this project');
  const workspace = await deps.workspaceFactory(root.root_path);
  return { root, binding, workspace };
}
```

**Green.** Unit test for resolver. Every caller of `resolveWorkspaceForProject` will fail to compile — that is intentional and will be repaired in Task 2.3 + Phase 3.

### Task 2.3: Propagate through `summarizeProjectDocsForPrincipal`

**File:** `packages/platform/src/services/summarization.ts`

Change deps to `deps: PlatformDeps & { version?: AgentVersionOpts }`. Pass `{ workspaceFactory: deps.workspaceFactory }` to `resolveWorkspaceForProject`.

**Red.** Update `test/integration/summarization.integration.test.ts` — it must now construct and pass a factory. The fixture already owns that (via `fixtures.ts`); make `seedProjectFixture` return `{ ..., workspaceFactory }` so tests can pass it directly.

**Green.** `pnpm -F @hono-workspace/platform test:integration -- summarization`.

### Phase 2 done when

- `summarization.ts` compiles and its integration test passes using the new explicit deps.
- Resolver takes the factory as a required arg.
- `PlatformDeps` type is exported from platform's public surface.
- `chat.ts`, `execute-agent.ts`, `reconciliation.ts` do NOT yet compile — they still reference the old resolver signature. This is expected; Phase 3 repairs them one by one.

**Gate check:** at this point typecheck will be red on several files. That's the only time during this task where a partial state is allowed. Commit Phase 2 as a single WIP commit marked `wip: phase 2 — resolver signature migrated, callers pending`.

---

## Phase 3 — Propagate to remaining services

One service per task, each self-contained. Order chosen so the simplest go first and chat (biggest) goes last.

### Task 3.1: `reconcileWorkspaceForProject`

**File:** `packages/platform/src/workspace/reconciliation.ts`

Signature becomes `reconcileWorkspaceForProject(projectId: string, deps: { workspaceFactory: WorkspaceFactory })`. Inline the `factory` call.

**Red.** `test/integration/reconciliation.integration.test.ts` — pass factory from fixture.

### Task 3.2: `executeProjectAgent`

**File:** `packages/platform/src/mastra/execution/execute-agent.ts`

Deps becomes `PlatformDeps`. Passes `{ workspaceFactory: deps.workspaceFactory }` to `resolveWorkspaceForProject`.

**Red.** Update `test/integration/execute-agent.integration.test.ts` and any unit tests.

### Task 3.3: `chat.ts` — six public functions

**File:** `packages/platform/src/services/chat.ts`

`ChatServiceDeps` becomes `PlatformDeps` (add `workspaceFactory`). All six principal-flow exports keep the same signature shape (`(input, deps)`), but `deps` is now `PlatformDeps`:

- `listChannelFeedForPrincipal`
- `createChannelPostForPrincipal`
- `createChannelThreadForPrincipal`
- `getChannelThreadForPrincipal`
- `sendChannelMessageForPrincipal`
- `streamChannelReplyForPrincipal`

The local `buildExecutionContext` helper (line 209) now receives `workspaceFactory` via its caller and forwards it to `resolveWorkspaceForProject`.

**Red.** `test/unit/chat-service.test.ts` currently uses `vi.mock('../../src/workspace/factory', …)` — delete that mock and pass a real factory via deps. That's a strict improvement (Pass 1 principle: no tests of mocked behavior).

**Green.** `test/integration/stream-channel-reply.integration.test.ts` and any chat integration tests.

### Phase 3 done when

- Every `deps.mastra`-taking function in `packages/platform/src/services/*` and `packages/platform/src/mastra/execution/*` also takes `deps.workspaceFactory`.
- Full typecheck passes on `@hono-workspace/platform`.
- All 117 unit tests green. All integration tests green.
- `getWorkspaceFactory` is still called from exactly one place: `workspace-context.ts`'s own file body (which we're about to delete).

---

## Phase 4 — Delete the singleton, wire the entry points

### Task 4.1: Construct factory in `packages/app/src/server/factory.ts`

**File:** `packages/app/src/server/factory.ts`

Add at the top:
```ts
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import type { WorkspaceFactory } from '@hono-workspace/platform';

function createLocalWorkspaceFactory(): WorkspaceFactory {
  return async (basePath: string) => {
    const workspace = new Workspace({
      filesystem: new LocalFilesystem({ basePath, contained: true }),
      sandbox: new LocalSandbox({ workingDirectory: basePath, env: { PATH: process.env.PATH ?? '' } }),
    });
    await workspace.init();
    return workspace;
  };
}
```

Inside `createApp`, construct once:
```ts
const workspaceFactory = params.workspaceFactory ?? createLocalWorkspaceFactory();
```

Update every route handler that today calls a service with `{ mastra }` to pass `{ mastra, workspaceFactory }`. There are ~10 such sites in `factory.ts:320-490`.

Add `workspaceFactory?: WorkspaceFactory` to `AppFactoryParams` so tests can inject fakes.

### Task 4.2: Construct factory in `packages/worker/src/index.ts`

**File:** `packages/worker/src/index.ts`

Replace the `setWorkspaceFactory(...)` call inside `bootRequest` (line 78) with a local const:

```ts
function bootRequest(env: Env) {
  setDatabasePool(createNeonHttpPool(env.DATABASE_URL));

  const workspaceFactory: WorkspaceFactory = async (basePath: string) => {
    const filesystem = new S3Filesystem({ /* same options */ });
    const workspace = new Workspace({ filesystem });
    await workspace.init();
    return workspace;
  };

  const mastra = createMastra(env.DATABASE_URL, {
    openrouterApiKey: env.OPENROUTER_API_KEY,
    openrouterModel: env.OPENROUTER_MODEL,
  });

  return { mastra, workspaceFactory };
}
```

The middleware that currently does `c.set('mastra', bootRequest(c.env).mastra)` now needs to set both:
```ts
app.use('*', async (c, next) => {
  const deps = bootRequest(c.env);
  c.set('mastra', deps.mastra);
  c.set('workspaceFactory', deps.workspaceFactory);
  await next();
});
```

Update `HonoEnv.Variables` to include `workspaceFactory: WorkspaceFactory`. Every route handler in this file passes `{ mastra: c.get('mastra'), workspaceFactory: c.get('workspaceFactory') }` to services.

Remove the `setWorkspaceFactory` import from the `@hono-workspace/platform` import list.

### Task 4.3: Update `fixtures.ts`

**File:** `packages/platform/test/helpers/fixtures.ts`

Remove the line `import '../../src/workspace/factory';`. Instead:

```ts
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';
import type { WorkspaceFactory } from '../../src/platform-deps';

export function createLocalWorkspaceFactory(): WorkspaceFactory {
  return async (basePath) => {
    const workspace = new Workspace({ filesystem: new LocalFilesystem({ basePath, contained: true }) });
    await workspace.init();
    return workspace;
  };
}
```

Make `seedProjectFixture` return `{ ..., workspaceFactory }` so every integration test gets a factory alongside the project. Update all integration test call sites to destructure it.

### Task 4.4: Delete the singleton

**Files to delete:**
- `packages/platform/src/workspace/workspace-context.ts`
- `packages/platform/src/workspace/factory.ts` (the side-effect one)
- `packages/platform/test/workspace/workspace-context.test.ts`

**Edit:** `packages/platform/src/index.ts` — remove `export * from './workspace/workspace-context';`. Add `export * from './platform-deps';` if not already done in Phase 2.

**Edit:** `packages/platform/src/node.ts` — stays as-is (only re-exports `pool`).

### Task 4.5: Full verification

```bash
cd /Users/pureicis/dev/mastra-playground/hono-workspace
pnpm -r typecheck
pnpm -r test:unit
pnpm -r test:integration  # if each package has it
pnpm vitest run --config vitest.integration.config.ts  # root integration
```

All green. Then:

```bash
grep -rn "setWorkspaceFactory\|getWorkspaceFactory\|workspace-context\|workspace/factory" packages/ --include='*.ts' --include='*.tsx'
# Expected: zero matches.
```

### Phase 4 done when

- The three files listed in Task 4.4 are deleted.
- `grep` for the banned strings returns nothing.
- Typecheck and tests pass on all packages.
- `packages/app` and `packages/worker` both visibly construct their factory at boot.

---

## Testing strategy

- **Unit tests first, in every task.** The refactor is mechanical; tests are the safety net against "looks right, compiles, but threads the wrong object."
- **Integration tests gate each phase.** Keep `pnpm -F @hono-workspace/platform test:integration` green at every phase boundary. Do not let integration tests drift red.
- **Delete the `vi.mock('../../src/workspace/factory', …)` in `chat-service.test.ts`.** Replacing it with an explicit factory injection is a strict improvement — today's test is testing a mock of a module we're about to delete, which is exactly the anti-pattern CLAUDE.md §Testing warns about.
- **No new test utilities.** `createLocalWorkspaceFactory` is exported from `fixtures.ts` and reused.
- **Local-server smoke after Phase 4.** Start `pnpm -F @hono-workspace/app dev`, hit `/health`, bootstrap-project, send a channel message. All three should succeed. This is the verification that motivated the whole refactor.

## Risks & mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Phase 2 leaves the tree temporarily red on typecheck (resolver signature changed, callers not yet updated). | Certain | Commit as `wip:` and finish Phase 3 in the same session. Do not leave the tree red across a session boundary. |
| `packages/app` integration tests depend on a workspace factory being available, and currently get it by accident via `@hono-workspace/platform/node` importing db/client. | Medium | `createApp` now always constructs its own factory inside the function body. Tests either pass a fake via `AppFactoryParams.workspaceFactory` or accept the real LocalFilesystem default. |
| `reconcileWorkspaceForProject` has other callers we haven't mapped. | Low | `grep -rn reconcileWorkspaceForProject packages/` before Task 3.1. Update every caller in the same commit. |
| `MastraServer` mount depends transitively on workspace state. | Very low | It doesn't — it only takes `mastra` and `app`. Verified by reading `packages/app/src/server/factory.ts:516`. |
| Worker's `c.set('workspaceFactory', …)` adds a per-request `Variables` entry that Hono must carry. | Negligible | Hono handles this natively; updating `HonoEnv.Variables` keeps types correct. |

## Out of scope (explicitly)

- **Mastra instance DI cleanup.** `createMastra()` is still called at boot; that is fine and symmetric with the new factory pattern.
- **Env-var centralization** (Pass 4c). Separate task.
- **`chat.ts` breakup** (Pass 4d). Separate task.
- **`index.ts` public surface audit** (Pass 4a). Separate task.
- **Agent integration tests that exercise the LLM with real tool invocation** (Pass 4g). Separate task; this refactor just unblocks them.

## Completion criteria (for `07_completion_workspace_factory_di.md`)

When this task is done, a completion doc should record:
1. Final file deletion list (exact paths).
2. The `PlatformDeps` surface as shipped.
3. Unit/integration test counts before vs. after.
4. Local-node-server smoke result (the originally-blocked path).
5. Any follow-up items discovered (likely: `chat.ts` is still 620 lines and now has one more dep to thread — candidate for Pass 4d).

## Notes

- The argument order is `(input, deps)` everywhere — already the prevailing convention. Do not flip.
- `PlatformDeps` intentionally bundles `mastra` and `workspaceFactory`. Services that need only one still take the whole object to keep handler sites uniform: `{ mastra, workspaceFactory }` everywhere, always both.
- If during implementation a site turns out to only need one, resist the urge to narrow the type. Uniformity at call sites beats minimal type surface inside services.
