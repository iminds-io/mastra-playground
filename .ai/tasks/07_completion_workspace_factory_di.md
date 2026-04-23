# Workspace Factory Explicit DI — Completion Report

**Status:** Complete. The module-scoped workspace factory singleton was removed and replaced with explicit dependency injection through platform services, app boot, worker boot, and integration fixtures.
**Implementation date:** 2026-04-17
**Completion report date:** 2026-04-22
**Plan reference:** [`07_workspace_factory_explicit_di_implementation_plan.md`](./07_workspace_factory_explicit_di_implementation_plan.md)

## Outcome

The workspace factory is no longer hidden behind mutable module state. Runtime entry points now construct their own `WorkspaceFactory` and pass it through explicit service dependencies. Workspace resolution still returns `{ root, binding, workspace }`, but it now builds the workspace from the factory supplied by the caller. Higher-level execution paths use that resolved `workspace` directly, avoiding the old duplicate construction path.

This unblocks local Node agent-touching routes because `packages/app` now constructs a `LocalFilesystem` / `LocalSandbox` factory inside `createApp()` instead of relying on a side-effect registration that never happened in the app server. Cloudflare Worker request boot now constructs an S3-backed factory and stores it in Hono variables alongside the request-local Mastra instance.

## Final Architecture

The shared dependency surface is now:

```ts
export type WorkspaceFactory = (basePath: string) => Promise<Workspace>;

export type PlatformDeps = {
  mastra: Mastra;
  workspaceFactory: WorkspaceFactory;
};
```

Services that need a Mastra agent or storage receive `PlatformDeps`. Lower-level workspace-only services receive `{ workspaceFactory: WorkspaceFactory }`. There is no optional fallback path and no compatibility shim.

## Deleted Files

The old singleton and its side-effect registration are gone:

- `packages/platform/src/workspace/workspace-context.ts`
- `packages/platform/src/workspace/factory.ts`
- `packages/platform/test/workspace/workspace-context.test.ts`

## What Landed

### Platform dependency surface

- Added `packages/platform/src/platform-deps.ts` with `WorkspaceFactory` and `PlatformDeps`.
- Re-exported `platform-deps` from `packages/platform/src/index.ts`.
- Added `@mastra/core` as a direct dependency of `packages/app` because the app now constructs `Workspace` instances directly.

### Resolver and reconciliation

- `resolveWorkspaceForProject(projectId, { workspaceFactory })` now requires an explicit factory and keeps returning `{ root, binding, workspace }`.
- Added a guard for missing `workspaceFactory` with a clear error: `resolveWorkspaceForProject: workspaceFactory is required.`
- `reconcileWorkspaceForProject(projectId, { workspaceFactory })` now receives the factory directly and no longer reads module state.

### Agent execution and chat services

- `executeProjectAgent()` now receives `workspaceFactory` in deps, passes it into `resolveWorkspaceForProject()`, and uses `resolvedWorkspace.workspace` in `buildExecutionContext()`.
- `summarizeProjectDocsForPrincipal()` now receives `PlatformDeps & { version?: AgentVersionOpts }`.
- Chat principal-flow functions now take `PlatformDeps` where they previously took `{ mastra }`.
- Chat's local execution-context helper now receives `workspaceFactory`, calls resolver with it, and uses `resolvedWorkspace.workspace`.
- The removed `createRuntimeWorkspace` escape hatch was not replaced.

### App boot

- `packages/app/src/server/factory.ts` now defines `createLocalWorkspaceFactory()`.
- `createApp()` constructs one `workspaceFactory` from params or the local default.
- Agent, summarization, chat feed, post, thread, message, and stream handlers pass `{ mastra, workspaceFactory }` to platform services.
- `AppFactoryParams` accepts `workspaceFactory?: WorkspaceFactory` for tests and controlled bootstraps.

### Worker boot

- `packages/worker/src/index.ts` removed `setWorkspaceFactory`.
- `bootRequest(env)` now returns `{ mastra, workspaceFactory }`.
- Hono variables now include `workspaceFactory`.
- Agent, summarization, chat feed, post, thread, message, and stream handlers read `workspaceFactory` from context and pass it to platform services.

### Tests and fixtures

- `packages/platform/test/helpers/fixtures.ts` no longer side-effect-imports `workspace/factory`.
- The fixture now exports `createLocalWorkspaceFactory()` and returns `workspaceFactory` from `seedProjectFixture()`.
- Added `packages/platform/test/unit/workspace-resolver.test.ts`.
- Updated execute-agent integration coverage to prove the service uses the exact workspace object created by the injected factory and calls that factory exactly once.
- Updated reconciliation, summarization, stream-channel-reply, ingest-pipeline, version-targeting, and chat unit tests to pass explicit factories.
- Removed the chat unit test mock of `../../src/workspace/factory` because that module no longer exists.

## Success Criteria Check

| Criterion | Result |
|---|---|
| `workspace-context.ts` deleted | Complete |
| `workspace/factory.ts` deleted | Complete |
| No `setWorkspaceFactory` / `getWorkspaceFactory` use in `packages/` source or tests | Complete |
| App constructs a `LocalFilesystem`-backed factory in `createApp()` | Complete |
| Worker constructs an S3-backed factory in `bootRequest()` | Complete |
| Fixtures construct and return a local factory directly | Complete |
| Local Node server no longer depends on factory side effects | Complete |
| Unit tests still pass | Complete during implementation verification |
| Integration tests still pass | Complete during implementation verification |
| Typecheck clean across workspace packages | Complete during implementation verification |
| App and Worker boot shapes are symmetric | Complete |

## Verification Recorded During Implementation

These commands were run during the implementation session on 2026-04-17:

```bash
pnpm -r typecheck
```

Result: passed across platform, app, web, worker, and ui.

```bash
pnpm run test:unit
```

Result: 25 test files passed, 117 tests passed.

```bash
pnpm run test:integration
```

Result: 22 test files passed, 39 tests passed.

```bash
rg -n "setWorkspaceFactory|getWorkspaceFactory|workspace-context|workspace/factory" packages --glob '*.ts' --glob '*.tsx'
```

Result: zero matches.

```bash
pnpm -F @hono-workspace/app dev
curl -i http://localhost:3000/health
```

Result: app started on `http://localhost:3000`; `/health` returned `HTTP/1.1 200 OK` with `{"ok":true}`. The server was stopped afterward.

## Known Limitations

- The local server smoke covered `/health`. The original authenticated agent path requires a valid Firebase bearer token, so the implementation relied on integration tests and route wiring checks rather than a live authenticated manual call.
- Full verification was not re-run while drafting this completion report on 2026-04-22; this document records the verification performed during the implementation session.
- The working tree already contained substantial unrelated uncommitted changes before this task. This task preserved them and did not attempt to separate or revert them.

## Deviations from the Plan

| Plan point | Actual handling |
|---|---|
| Phase 2 allowed a temporary red typecheck state and suggested a WIP commit | No commit was made, per instruction. The tree was carried through to green in the same session. |
| Plan mentioned all five packages for typecheck | The workspace typecheck covered platform, app, web, worker, and ui. |
| Plan suggested local-server bootstrap-project/send-message smoke | Not executed manually because those routes require valid auth context and seeded state. Integration tests covered the dependency-threaded service paths. |

## Commit Status

No commit was created. The work remains in the current working tree awaiting explicit commit instructions.

Suggested commit split, if this is later committed:

1. `feat(platform): add explicit workspace factory deps`
2. `feat(app-worker): wire workspace factories at boot`
3. `test(platform): inject workspace factories in fixtures and services`
4. `chore(platform): delete workspace factory singleton`
5. `docs: add workspace factory DI completion report`

## Follow-Up Items

1. Add an authenticated local smoke harness that can create a valid Firebase token or test principal and exercise `/api/dev/bootstrap-project` plus an agent-touching route without mocking service calls.
2. Consider extracting the duplicated local workspace factory construction from app and integration fixtures only if a future shared Node-only entry surface emerges. For now, keeping it explicit avoids reintroducing hidden side effects.
3. Continue the planned `chat.ts` breakup separately; this task intentionally only threaded the new dependency through it.
