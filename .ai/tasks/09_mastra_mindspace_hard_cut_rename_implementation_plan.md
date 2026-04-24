# Mastra Mindspace Hard-Cut Rename Implementation Plan

> **For coworkers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-23
**Updated**: 2026-04-23
**Priority**: High
**Estimated Effort**: 2-3 focused sessions
**Dependencies**: The workspace-scoped Mastra gateway is already implemented. This plan is a hard-cut rename over the current codebase and docs.

**Goal:** Rename the project and all project-owned `workspace` concepts to `mastra-mindspace` / `mindspace` in one hard cut, while preserving third-party/library-owned `Workspace` terminology from Mastra and Vitest.

**Architecture:** Treat this as a bounded rename program, not a blind search-and-replace. Project-owned domain concepts (`workspace_roots`, gateway docs, route names, env vars, file paths, TS symbols, package names, deployment names, test identities) become `mindspace`. External/library-owned concepts remain unchanged: `@mastra/core/workspace`, Mastra `Workspace`, Mastra internal `mastra_workspaces`, and Vitest `defineWorkspace`.

**Tech Stack:** TypeScript, Hono, Mastra `@mastra/core@1.25.0`, Cloudflare Workers, Neon/Postgres, Vitest, pnpm workspaces, Wrangler.

---

## Hard-Cut Rules

These rules are non-negotiable. Violating them creates partial rename states that are harder to recover from than the original terminology.

### Rename these

- Root project name: `hono-workspace` → `mastra-mindspace`
- Workspace package scope: `@hono-workspace/*` → `@mastra-mindspace/*`
- Project-owned domain concept: `workspace` → `mindspace`
- Project-owned DB/control-plane schema: `workspace_*` → `mindspace_*`
- Product/API routes that represent the project-owned concept
- Env vars that represent the project-owned concept
- Local files/directories/module names for the project-owned concept
- Test emails, URLs, bucket defaults, worker names, and user-facing strings

### Do NOT rename these

- `@mastra/core/workspace`
- Mastra `Workspace`, `LocalFilesystem`, `LocalSandbox`
- Mastra internal tables such as `mastra_workspaces`, `mastra_workspace_versions`
- Vitest `defineWorkspace` and `vitest.workspace.ts`
- Any external dependency API where `workspace` is library-owned

### Translation model

Use this mental model throughout the plan:

```text
mindspace = product/domain concept
Mastra Workspace = runtime execution object used inside a mindspace
```

Do not try to rename the second line.

## Current-State Findings That Matter

The investigation established these load-bearing rename areas:

1. Root/package identity still uses `hono-workspace` and `@hono-workspace/*`.
2. App-owned DB schema in `001_initial.sql` still uses:
   - `workspace_roots`
   - `workspace_bindings`
   - `workspace_locks`
   - `workspace_events`
   - `workspace_provisioning_jobs`
3. Source tree still has `packages/platform/src/workspace/`.
4. The platform exports and services still use `WorkspaceFactory`, `resolveWorkspaceForProject`, `runWorkspaceSupervisorForPrincipal`, etc.
5. Product and docs still describe “workspace” as the app-owned concept even though Mastra also has `Workspace`.
6. Worker/app/package names and imports still use `hono-workspace`.
7. There are many docs and tests that will drift or become misleading if not renamed in the same cut.

## Success Criteria

- Root project/package identity is `mastra-mindspace`.
- Every workspace package is renamed to `@mastra-mindspace/*`.
- Every project-owned `workspace_*` DB table/index/column/query is renamed to `mindspace_*`.
- `packages/platform/src/workspace/` is replaced by `packages/platform/src/mindspace/`.
- All project-owned routes, env vars, API fields, docs, tests, fixtures, examples, and deployment names use `mindspace`.
- Third-party/library-owned `Workspace` terms remain intact and typecheck clean.
- All tests pass after the hard cut:
  - `pnpm test:unit`
  - `pnpm test:integration`
  - `pnpm test:e2e`
  - `pnpm test:smoke`
  - `pnpm typecheck`
  - `git diff --check`

## Recommended Sequencing

This rename should be executed in this order:

1. Add failing characterization tests around the new terminology and renamed DB schema.
2. Rename package identity and imports first so the workspace starts speaking the new repo name.
3. Rename app-owned DB/control-plane schema second because it is the deepest contract.
4. Rename source files/modules/services/routes on top of that schema.
5. Rename docs and examples after code/tests are already green.
6. Run full verification only after the rename is globally consistent.

Do not start with docs-only or file-move-only changes. The plan needs a coherent migration path, not isolated cosmetics.

## Phase 1: Package And Repo Identity

### Task 1.1: Rename Root Package Identity

**Files:**

- Modify: `package.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml` if it embeds the repo name in comments/paths
- Test: root script behavior via existing commands

**Step 1: Write a failing test or assertion**

Use existing unit/root structure tests if they cover root manifest values. If they do not, add a small test in:

```text
packages/app/test/unit/root-structure.test.ts
```

that asserts:

```ts
expect(rootPackage.name).toBe('mastra-mindspace');
```

If reading root `package.json` is already covered elsewhere, extend that test instead of adding a new file.

**Step 2: Run it and verify failure**

```bash
pnpm test:unit -- --run packages/app/test/unit/root-structure.test.ts
```

Expected: FAIL because the root package is still `hono-workspace`.

**Step 3: Make the minimal change**

Update root `package.json`:

```json
{
  "name": "mastra-mindspace"
}
```

Update root script filters:

```json
"dev": "pnpm --filter @mastra-mindspace/app dev",
"dev:web": "pnpm --filter @mastra-mindspace/web dev",
"test:e2e": "pnpm --filter @mastra-mindspace/worker run test:e2e",
"test:smoke": "pnpm --filter @mastra-mindspace/worker run test:smoke"
```

Update `.env.example`:

```bash
MINDSPACE_ROOT=/absolute/path/to/mastra-mindspace/var/mindspaces
```

Do not remove unrelated variables yet.

**Step 4: Re-run**

```bash
pnpm test:unit -- --run packages/app/test/unit/root-structure.test.ts
```

Expected: PASS.

### Task 1.2: Rename Workspace Package Scope

**Files:**

- Modify: `packages/app/package.json`
- Modify: `packages/platform/package.json`
- Modify: `packages/ui/package.json`
- Modify: `packages/web/package.json`
- Modify: `packages/worker/package.json`
- Modify imports across `packages/**` and scripts
- Test: `pnpm typecheck`

**Step 1: Add failing import expectation**

Pick an existing compile-time test or add a small unit check in:

```text
packages/app/test/unit/root-scripts.test.ts
```

to assert the root scripts use `@mastra-mindspace/*` filters.

**Step 2: Run and watch it fail**

```bash
pnpm test:unit -- --run packages/app/test/unit/root-scripts.test.ts
```

Expected: FAIL.

**Step 3: Rename package names**

Update:

```json
"name": "@mastra-mindspace/app"
"name": "@mastra-mindspace/platform"
"name": "@mastra-mindspace/ui"
"name": "@mastra-mindspace/web"
"name": "@mastra-mindspace/worker"
```

Update all workspace references:

```json
"@mastra-mindspace/platform": "workspace:*"
"@mastra-mindspace/ui": "workspace:*"
```

Update source imports such as:

```ts
import { ... } from '@mastra-mindspace/platform';
import '@mastra-mindspace/platform/node';
import type { ... } from '@mastra-mindspace/platform';
```

Update package comments that mention `@hono-workspace/*`.

**Step 4: Re-run**

```bash
pnpm test:unit -- --run packages/app/test/unit/root-scripts.test.ts
pnpm typecheck
```

Expected: PASS.

## Phase 2: Database Schema Hard Cut

### Task 2.1: Add Failing Schema Expectations

**Files:**

- Modify or create: `packages/platform/test/integration/schema.integration.test.ts`
- Read: `packages/platform/src/db/migrations/001_initial.sql`

**Step 1: Add failing expectations**

Assert the schema contains:

```text
mindspace_roots
mindspace_bindings
mindspace_locks
mindspace_events
mindspace_provisioning_jobs
```

and no longer expects `workspace_*` tables.

Also assert renamed index names if the test already checks indexes.

**Step 2: Run**

```bash
pnpm test:integration -- --run packages/platform/test/integration/schema.integration.test.ts
```

Expected: FAIL because migrations still create `workspace_*` tables.

### Task 2.2: Rename App-Owned Tables, Columns, And Indexes

**Files:**

- Modify: `packages/platform/src/db/migrations/001_initial.sql`
- Potentially create: `packages/platform/src/db/migrations/003_workspace_to_mindspace.sql`

**Decision**

Because this is a hard cut, the cleanest path is:

1. Update `001_initial.sql` so fresh databases use only `mindspace_*`.
2. Add a new migration for existing databases that renames old tables/columns/indexes.

Do not rely only on editing `001_initial.sql`; that would break existing databases.

**Step 1: Create migration for existing DBs**

Create:

```text
packages/platform/src/db/migrations/003_workspace_to_mindspace.sql
```

with explicit rename statements such as:

```sql
alter table workspace_roots rename to mindspace_roots;
alter table workspace_bindings rename to mindspace_bindings;
alter table workspace_locks rename to mindspace_locks;
alter table workspace_events rename to mindspace_events;
alter table workspace_provisioning_jobs rename to mindspace_provisioning_jobs;
```

Then rename columns:

```sql
alter table mindspace_bindings rename column workspace_root_id to mindspace_root_id;
alter table mindspace_events rename column workspace_root_id to mindspace_root_id;
alter table mindspace_locks rename column workspace_root_id to mindspace_root_id;
alter table mindspace_provisioning_jobs rename column workspace_root_id to mindspace_root_id;
alter table mindspace_bindings rename column editor_workspace_ref to editor_mindspace_ref;
```

Then rename indexes:

```sql
alter index if exists workspace_roots_active_project_idx rename to mindspace_roots_active_project_idx;
alter index if exists workspace_bindings_active_project_idx rename to mindspace_bindings_active_project_idx;
alter index if exists workspace_locks_lookup_idx rename to mindspace_locks_lookup_idx;
```

If foreign key constraint names need explicit renames, inspect the generated names after running the migration. Prefer explicit names if current tests make this fragile.

**Step 2: Update the base schema**

Change `001_initial.sql` to define the same structures with `mindspace_*` names from the start.

**Step 3: Re-run**

```bash
pnpm test:integration -- --run packages/platform/test/integration/schema.integration.test.ts
```

Expected: PASS on fresh branch DB.

### Task 2.3: Rename Repository Modules And Queries

**Files:**

- Rename: `packages/platform/src/db/repositories/workspace-roots.ts` → `mindspace-roots.ts`
- Rename: `packages/platform/src/db/repositories/workspace-bindings.ts` → `mindspace-bindings.ts`
- Modify: every repository/service/test import that references those files
- Modify SQL in:
  - `packages/platform/src/services/audit.ts`
  - `packages/platform/src/services/dev-bootstrap.ts`
  - `packages/platform/src/services/project-context.ts` if needed
  - `packages/platform/src/services/chat.ts`
  - `packages/platform/src/services/summarization.ts`
  - `packages/platform/src/services/supervisor.ts`
  - `packages/platform/src/services/workspace-mastra-gateway.ts`
  - `packages/platform/src/mindspace/*` after later file moves
  - tests that truncate/query `workspace_*`

**Step 1: Write failing repo/service tests**

Prefer existing integration tests over unit mocks:

- `packages/platform/test/integration/project-context.integration.test.ts`
- `packages/platform/test/integration/reconciliation.integration.test.ts`
- `packages/platform/test/integration/workspace-provisioning.integration.test.ts`
- `packages/platform/test/integration/workspace-locking.integration.test.ts`
- `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

Update one file’s imports/expectations first so they fail on missing repo/query names.

**Step 2: Rename modules**

Example target names:

```text
mindspace-roots.ts
mindspace-bindings.ts
```

Rename exported functions too:

```ts
getActiveMindspaceRootByProjectId
getActiveMindspaceBinding
createMindspaceRoot
createMindspaceBinding
markMindspaceRootReady
updateMindspaceRootStatus
```

Keep function behavior the same; this phase is naming plus SQL table/column updates.

**Step 3: Re-run**

```bash
pnpm test:integration -- --run packages/platform/test/integration/project-context.integration.test.ts packages/platform/test/integration/reconciliation.integration.test.ts
pnpm --filter @mastra-mindspace/platform typecheck
```

Expected: PASS.

## Phase 3: Source Tree And Symbol Rename

### Task 3.1: Rename `packages/platform/src/workspace/` Directory

**Files:**

- Rename directory: `packages/platform/src/workspace/` → `packages/platform/src/mindspace/`
- Rename files:
  - `locking.ts` → `locking.ts` (directory move only is fine)
  - `paths.ts`
  - `provisioning.ts`
  - `reconciliation.ts`
  - `resolver.ts`
- Update all imports across repo

**Step 1: Add failing import-based tests**

Use existing tests that import current paths and rename one to fail first:

```text
packages/platform/test/unit/workspace-paths.test.ts
packages/platform/test/unit/workspace-resolver.test.ts
packages/platform/test/integration/workspace-locking.integration.test.ts
packages/platform/test/integration/workspace-provisioning.integration.test.ts
```

The tests themselves should be renamed in a later task; first make the import failure visible.

**Step 2: Rename directory and imports**

Update imports such as:

```ts
import { resolveMindspaceForProject } from '../mindspace/resolver';
import { provisionMindspaceForProject } from '../mindspace/provisioning';
```

Do not rename Mastra `Workspace` types here.

**Step 3: Re-run**

```bash
pnpm test:unit -- --run packages/platform/test/unit/workspace-paths.test.ts packages/platform/test/unit/workspace-resolver.test.ts
pnpm --filter @mastra-mindspace/platform typecheck
```

Expected: PASS after the corresponding symbol renames in Task 3.2.

### Task 3.2: Rename Project-Owned Symbols And Helpers

**Files:**

- Modify platform source under `packages/platform/src/**`
- Modify app/worker entry points

**Rename examples**

Project-owned names should become:

```ts
WorkspaceFactory                    -> MindspaceFactory
createLocalWorkspaceFactory         -> createLocalMindspaceFactory
resolveWorkspaceForProject          -> resolveMindspaceForProject
provisionWorkspaceForProject        -> provisionMindspaceForProject
reconcileWorkspaceForProject        -> reconcileMindspaceForProject
recordWorkspaceEvent                -> recordMindspaceEvent
runWorkspaceSupervisorForPrincipal  -> runMindspaceSupervisorForPrincipal
workspaceMastraAgentMetadata        -> mindspaceMastraAgentMetadata
workspaceMastraWorkflowMetadata     -> mindspaceMastraWorkflowMetadata
workspaceMastra-gateway             -> mindspace-mastra-gateway
```

Do **not** rename:

```ts
new Workspace(...)
import { Workspace } from '@mastra/core/workspace'
workspace: ({ requestContext }) => ...
requestContext.get('workspace')
```

Those are Mastra-owned runtime concepts.

**Important note**

If a local `requestContext` key named `'workspace'` is currently project-owned rather than Mastra-owned, investigate before renaming. The default assumption for this task is to preserve the runtime key `'workspace'` because the current agent/workflow code is intentionally built around Mastra `Workspace` injection.

**Step 1: Add failing symbol tests**

Focus on:

- `packages/platform/test/unit/build-execution-context.test.ts`
- `packages/platform/test/unit/workspace-tools.test.ts`
- `packages/platform/test/integration/workspace-supervisor.integration.test.ts`
- `packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts`

**Step 2: Rename symbols**

Apply the bounded rename throughout platform/app/worker.

**Step 3: Re-run**

```bash
pnpm test:unit -- --run packages/platform/test/unit/build-execution-context.test.ts packages/platform/test/unit/workspace-tools.test.ts
pnpm test:integration -- --run packages/platform/test/integration/workspace-supervisor.integration.test.ts packages/platform/test/integration/workspace-mastra-gateway.integration.test.ts
pnpm --filter @mastra-mindspace/platform typecheck
```

Expected: PASS.

## Phase 4: API Routes, JSON Contracts, And Env Vars

### Task 4.1: Rename Product Routes

**Files:**

- Modify: `packages/app/src/routes/projects.ts`
- Modify: `packages/app/src/server/factory.ts`
- Modify: `packages/worker/src/index.ts`
- Modify integration/E2E tests that call `/workspace` or refer to workspace-scoped naming

**Route decisions**

Rename product-owned routes:

```text
/api/projects/:projectId/workspace                      -> /api/projects/:projectId/mindspace
/api/projects/:projectId/mastra/*                      stays, because project scope is already the product unit
```

Do not rename `/api/mastra/*`.

If there are any legacy routes like `/workspace/commands` or `/workspace-binding` still present in docs/tests, rename them in the same cut.

**Step 1: Add failing route tests**

Update:

- `packages/app/test/integration/authenticated-routes.integration.test.ts`
- `packages/worker/test/live/workspace-mastra-gateway.e2e.test.ts`
- any route tests under `packages/app/test/integration/*`

to use `/mindspace` where the route is product-owned.

**Step 2: Update route handlers**

Rename route registrations and any JSON fields like:

```json
{
  "workspaceRootPath": "..."
}
```

to:

```json
{
  "mindspaceRootPath": "..."
}
```

Do this only for project-owned API contracts.

**Step 3: Re-run**

```bash
pnpm test:integration -- --run packages/app/test/integration/authenticated-routes.integration.test.ts packages/app/test/integration/agent-version-targeting.integration.test.ts
pnpm test:e2e
```

Expected: PASS.

### Task 4.2: Rename Env Vars And Deployment Names

**Files:**

- Modify: `.env.example`
- Modify: `packages/worker/.dev.vars.example`
- Modify: `packages/worker/.dev.vars.test` if committed
- Modify: `packages/worker/wrangler.toml`
- Modify: `packages/worker/scripts/run-e2e.mjs`
- Modify any local env parsing in platform/app/worker

**Rename**

```text
WORKSPACE_ROOT -> MINDSPACE_ROOT
```

Worker name:

```toml
name = "mastra-mindspace-api"
```

Bucket defaults/examples:

```text
hono-workspace -> mastra-mindspace
workspaces     -> mindspaces
```

Test emails:

```text
test.hono-workspace.local -> test.mastra-mindspace.local
```

**Step 1: Add failing env tests**

Use existing env tests under:

```text
packages/platform/test/unit/env.test.ts
```

and any worker test harness checks in:

```text
packages/worker/test/helpers/*
```

Add assertions for `MINDSPACE_ROOT`.

**Step 2: Rename**

Update every project-owned reference.

**Step 3: Re-run**

```bash
pnpm test:unit -- --run packages/platform/test/unit/env.test.ts
pnpm test:e2e
pnpm test:smoke
```

Expected: PASS.

## Phase 5: Test Suite Rename

### Task 5.1: Rename Test Files And Helpers

**Files:**

- Rename any test files whose names are project-owned terminology:
  - `workspace-paths.test.ts`
  - `workspace-resolver.test.ts`
  - `workspace-locking.integration.test.ts`
  - `workspace-provisioning.integration.test.ts`
  - `workspace-supervisor.integration.test.ts`
  - `workspace-mastra-gateway.integration.test.ts`
  - `workspace-mastra-gateway.e2e.test.ts`
  - and matching helper names

**Step 1: Add failing glob expectations if any**

Only if current test runner or helper scripts rely on names. Otherwise proceed directly with file renames.

**Step 2: Rename files and describe blocks**

Examples:

```text
mindspace-paths.test.ts
mindspace-resolver.test.ts
mindspace-locking.integration.test.ts
mindspace-provisioning.integration.test.ts
mindspace-supervisor.integration.test.ts
mindspace-mastra-gateway.integration.test.ts
mindspace-mastra-gateway.e2e.test.ts
```

Update `describe(...)` labels to match.

**Step 3: Re-run**

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

Expected: PASS.

### Task 5.2: Update Test Data, Truncation Lists, And Helpers

**Files:**

- `packages/platform/test/helpers/fixtures.ts`
- `packages/worker/test/helpers/test-db.ts`
- `packages/worker/test/helpers/test-firebase.ts`
- app/platform integration tests that truncate DB tables

**Step 1: Rename truncation lists**

Replace:

```sql
workspace_provisioning_jobs,
workspace_events,
workspace_locks,
workspace_bindings,
workspace_roots
```

with:

```sql
mindspace_provisioning_jobs,
mindspace_events,
mindspace_locks,
mindspace_bindings,
mindspace_roots
```

**Step 2: Rename helper names and default test identities**

Example:

```text
test.hono-workspace.local -> test.mastra-mindspace.local
```

**Step 3: Re-run**

```bash
pnpm test:integration
pnpm test:e2e
```

Expected: PASS.

## Phase 6: Living Docs, Analysis Docs, And Legacy Docs

### Task 6.1: Update Living Docs

**Files:**

- Modify: `.ai/knowledges/01_technical_architecture.md`
- Modify: `.ai/knowledges/02_adding_agents_and_workflows.md`
- Modify: `.ai/knowledges/usage_guide.md`
- Modify: `.ai/analyses/02_native_mastra_multi_agent_runtime_analysis.md`
- Modify: `.ai/analyses/03_workspace_scoped_mastra_usage_pattern.md`

**Content rules**

- Product/domain concept must say `mindspace`
- Repo/package identity must say `mastra-mindspace`
- Preserve explicit references to Mastra `Workspace` where technically correct
- Explain the terminology split clearly to prevent future regressions

**Step 1: Update top-level titles and body text**

Examples:

```text
hono-workspace -> mastra-mindspace
workspace-scoped -> mindspace-scoped (only when referring to the project-owned concept)
```

But preserve:

```text
Mastra Workspace
@mastra/core/workspace
mastra_workspaces
```

**Step 2: Re-run doc sanity**

```bash
git diff --check
rg -n --hidden --glob '!node_modules' --glob '!.git' '@hono-workspace|hono-workspace|workspace_roots|workspace_bindings|WORKSPACE_ROOT' .ai packages docs .env.example
```

Expected: only intentional external/library-owned or archived references remain, or zero if archives are also updated in this phase.

### Task 6.2: Update Archived Plans And Historical Docs That Would Mislead Future Work

**Files:**

- `docs/plans/2026-04-09-hono-workspace-implementation.md`
- `.ai/tasks/*` files that future coworkers are likely to read
- deployment completion docs that mention `hono-workspace-api`

**Rule**

Do not spend time rewriting deep historical context unless the old terminology would confuse future implementation. Use lightweight amendments where possible:

- add a top note saying “historical name `workspace` is now `mindspace`”
- update the most visible identifiers

If the archive is too large to safely rewrite, prefer an explanatory note at the top instead of risky full-text churn.

## Phase 7: Full Verification And Cleanup

### Task 7.1: Full Verification

Run:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:smoke
pnpm typecheck
git diff --check
```

Expected:

- all tests pass
- typecheck passes across packages
- no formatting or whitespace issues

### Task 7.2: Final Rename Audit

Run these targeted audits:

```bash
rg -n --hidden --glob '!node_modules' --glob '!.git' '@hono-workspace|hono-workspace' .
rg -n --hidden --glob '!node_modules' --glob '!.git' '\\bworkspace_roots\\b|\\bworkspace_bindings\\b|\\bworkspace_locks\\b|\\bworkspace_events\\b|\\bworkspace_provisioning_jobs\\b' .
rg -n --hidden --glob '!node_modules' --glob '!.git' '\\bWORKSPACE_ROOT\\b' .
rg -n --hidden --glob '!node_modules' --glob '!.git' 'packages/platform/src/workspace' .
```

Expected:

- zero project-owned matches
- remaining `workspace` matches should be only:
  - Mastra library imports/types
  - Vitest workspace config
  - intentionally preserved external docs/examples

### Task 7.3: Suggested Commit Grouping

Suggested logical commits:

```text
refactor: rename workspace schema to mindspace
refactor: rename workspace modules and symbols to mindspace
refactor: rename package scope to @mastra-mindspace
refactor: rename product routes and env vars to mindspace
test: align suites and fixtures with mindspace rename
docs: rename hono-workspace to mastra-mindspace
```

Do not include AI-assistance/co-author wording.

## Implementation Risks And Safeguards

### Risk 1: Breaking Mastra By Renaming Library-Owned `Workspace`

**Safeguard:** preserve `@mastra/core/workspace`, Mastra `Workspace`, and runtime `workspace` bindings unless a specific site is confirmed project-owned.

### Risk 2: Fresh DB Passes, Existing DB Fails

**Safeguard:** update both `001_initial.sql` and add a forward migration for existing environments.

### Risk 3: Imports Compile In One Package, Not Across Workspace

**Safeguard:** rename package scopes early and run `pnpm typecheck` after each major phase.

### Risk 4: Docs Drift From Implementation

**Safeguard:** treat living docs as part of the rename, not cleanup-afterthought work.

### Risk 5: Archived Docs Become Misleading

**Safeguard:** amend or annotate the most read historical docs instead of ignoring them.

## Handoff Notes

This is not a cosmetic rename. It is a contract migration.

The implementer should think in two vocabularies:

```text
project-owned:
  mindspace
  mindspace_roots
  MINDSPACE_ROOT
  @mastra-mindspace/*

library-owned:
  @mastra/core/workspace
  Workspace
  mastra_workspaces
  defineWorkspace(...)
```

If a change proposal blurs those two vocabularies, stop and re-evaluate before editing.
