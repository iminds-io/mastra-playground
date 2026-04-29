# ABOUTME: Implementation plan for reducing signed-in root-route startup latency in Mastra Mindspace
# ABOUTME: Focuses on optimistic last-project routing, a bootstrap endpoint, and DB/index improvements grounded in the current codebase

# Phase 12: Root Bootstrap Latency Reduction Implementation Plan

> **For Claude:** Execute this as a startup-flow optimization task. Keep the architecture small, preserve current behavior, and favor perceived-speed wins over speculative rewrites.

**Status**: Planning  
**Created**: 2026-04-25  
**Assigned**: Claude + coworker  
**Priority**: High  
**Estimated Effort**: 2-3 focused sessions  
**Dependencies**: Current Task 11 shell, project settings migration (`004_project_settings_foundation.sql`), current auth middleware and project listing surface

## Goal
Reduce the signed-in root-route loading lag so users reach a project faster after auth restoration.

## Architecture
The current root flow uses the full project list as both the routing bootstrap and the sidebar data source. This plan separates those concerns. We will add a small authenticated session bootstrap endpoint, introduce optimistic client-side routing to the last opened project, and add the missing user-centric membership index to support the new hot path.

The result should be:

```text
signed-in user
  -> optimistic route to last known project when possible
  -> bootstrap response validates/falls back
  -> project list hydrates without blocking the first route transition
```

## Tech Stack
- React + custom router in `packages/web`
- Hono app/worker surfaces in `packages/app` and `packages/worker`
- Platform services in `packages/platform`
- Neon Postgres
- Firebase-authenticated principal flow
- Vitest unit/integration/E2E/smoke suites already present in the repo

---

## Current-State Summary

### Current signed-in root flow
The current app does this after auth restoration:

1. Firebase auth resolves a user in `packages/web/src/App.tsx`
2. `handleGetMe()` runs
3. `handleLoadProjects()` runs
4. `GET /api/projects` hits the worker/app
5. backend queries accessible projects
6. `PostAuthRouter` redirects to `/chat/:projectId` only after project fetch completes

Key files:
- `packages/web/src/App.tsx`
- `packages/web/src/PostAuthRouter.tsx`
- `packages/web/src/api.ts`
- `packages/worker/src/index.ts`
- `packages/app/src/server/factory.ts`
- `packages/platform/src/services/projects.ts`
- `packages/platform/src/db/repositories/projects.ts`

### Root cause of perceived lag
The problem is not one giant blocking function. It is the combination of:

- Firebase auth restoration
- token acquisition for `/api/projects`
- real network hop to worker
- Neon lookup for accessible projects
- using the full project list as the only route decision source

### Concrete backend inefficiency
`listProjectsForFirebaseUid()` is user-centric, but `project_memberships` currently only has:

```sql
create index if not exists project_memberships_project_lookup_idx
  on project_memberships(project_id, role);
```

There is no index optimized for:

```text
users.firebase_uid -> users.id -> project_memberships.user_id -> projects
```

### Existing architectural seam we should use
The repo already has:

- a clear authenticated worker/app boundary
- a small platform service layer
- a simple imperative frontend router

So we do **not** need a large routing rewrite. A focused bootstrap service plus client-side preference persistence fits the existing design.

## Executive Decisions

### Decision 1: Keep the current route model
Do not introduce a new routing library or SSR path. Keep the current custom router and improve the root-route bootstrap behavior.

### Decision 2: Add a dedicated bootstrap endpoint
Do not keep using the full project list fetch as the only root-routing gate. Add a single authenticated bootstrap endpoint that returns:

- current principal summary
- accessible projects
- server-selected preferred project id

### Decision 3: Add optimistic client-side last-project routing
Persist the last successful project route locally and use it to transition into chat faster. Validate it against bootstrap results and fall back cleanly.

### Decision 4: Keep `getMe()` out of the critical root path
`getMe()` is useful for UI state, but it should not be part of the initial routing dependency chain. Bootstrap should absorb the minimum identity info needed at startup.

## Success Criteria

- [ ] signed-in root routing no longer depends solely on waiting for the full `/api/projects` flow before any chat route navigation happens
- [ ] app persists and reuses the last successful project id
- [ ] invalid/stale cached project ids fall back safely
- [ ] worker/app expose `GET /api/session/bootstrap`
- [ ] bootstrap returns `me`, `projects`, and `preferredProjectId`
- [ ] `project_memberships(user_id, project_id)` index exists
- [ ] root loading copy is updated from stale `workspaces` wording
- [ ] unit/integration/frontend coverage exists for bootstrap and fallback behavior
- [ ] `pnpm typecheck` passes
- [ ] relevant unit/integration tests pass

## Out Of Scope

- preloading channels, feed, or settings in the root bootstrap payload
- replacing Firebase auth restoration
- SSR/edge-rendered shell work
- redesigning the current project switcher/sidebar behavior
- introducing a global cache framework

## Recommended Sequencing

1. DB index improvement
2. bootstrap service contract
3. worker/app bootstrap routes
4. frontend API client
5. last-project persistence utility
6. root-route/bootstrap behavior change
7. loading copy cleanup
8. verification

---

## Phase 1: Data-Path Improvement

### Task 12.1: Add user-centric membership lookup index

**Files**
- Modify: `packages/platform/src/db/migrations/004_project_settings_foundation.sql`
- Test: `packages/platform/test/integration/schema.integration.test.ts`

**Intent**
Support the hot path for listing projects by authenticated user.

**Required change**
Add:

```sql
create index if not exists project_memberships_user_lookup_idx
  on project_memberships(user_id, project_id);
```

**Why here**
This index belongs with the `project_memberships` foundation migration that introduced the table.

**TDD steps**
1. Update `schema.integration.test.ts` to assert the new index exists.
2. Run the schema integration test and confirm failure.
3. Add the index to the migration.
4. Re-run the schema integration test and confirm pass.

**Run**
```bash
pnpm test:integration -- --run packages/platform/test/integration/schema.integration.test.ts
```

**Commit suggestion**
```bash
git commit -m "perf: add user lookup index for project memberships"
```

---

## Phase 2: Backend Bootstrap Contract

### Task 12.2: Add session bootstrap service

**Files**
- Create: `packages/platform/src/services/session-bootstrap.ts`
- Modify: `packages/platform/src/services/projects.ts`
- Modify: `packages/platform/src/index.ts`
- Test: `packages/platform/test/unit/session-bootstrap.test.ts`

**Intent**
Create one service that returns the initial signed-in session payload for the web app.

**Required contract**

```ts
export type SessionBootstrapResult = {
  me: {
    uid: string;
    email: string | null;
    name: string | null;
  };
  projects: AccessibleProjectSummary[];
  preferredProjectId: string | null;
};
```

**Rules**
- `projects` comes from the existing accessible-project logic
- `preferredProjectId` is the first active project in the returned list, or `null`
- no channel/feed/settings preloading

**Implementation notes**
- do not duplicate the project mapping logic; reuse `listAccessibleProjectsForPrincipal()`
- keep service small and deterministic

**TDD steps**
1. Add unit tests for:
   - no projects -> `preferredProjectId = null`
   - one or more projects -> first project id returned
   - `me` payload is shaped correctly
2. Run failing unit tests.
3. Implement `session-bootstrap.ts`.
4. Re-run tests.

**Run**
```bash
pnpm test:unit -- --run packages/platform/test/unit/session-bootstrap.test.ts
```

**Commit suggestion**
```bash
git commit -m "feat: add session bootstrap service"
```

### Task 12.3: Add worker/app bootstrap route

**Files**
- Modify: `packages/worker/src/index.ts`
- Modify: `packages/app/src/server/factory.ts`
- Test: `packages/app/test/integration/authenticated-routes.integration.test.ts`
- Test: `packages/worker/test/live/auth.e2e.test.ts`

**Intent**
Expose the new bootstrap contract from both runtime surfaces.

**Route**

```text
GET /api/session/bootstrap
```

**Response**

```json
{
  "me": { "uid": "...", "email": "...", "name": "..." },
  "projects": [...],
  "preferredProjectId": "..."
}
```

**TDD steps**
1. Add app integration tests for authenticated bootstrap response shape.
2. Add worker live E2E coverage for the route.
3. Run tests and confirm failure.
4. Add route wiring to app and worker.
5. Re-run tests.

**Run**
```bash
pnpm test:integration -- --run packages/app/test/integration/authenticated-routes.integration.test.ts
pnpm test:e2e -- --run packages/worker/test/live/auth.e2e.test.ts
```

**Commit suggestion**
```bash
git commit -m "feat: add session bootstrap route"
```

---

## Phase 3: Frontend Bootstrap Flow

### Task 12.4: Add frontend bootstrap client

**Files**
- Modify: `packages/web/src/api.ts`
- Test: `packages/web/src/api.test.ts`

**Intent**
Give the frontend one API function for initial signed-in bootstrap.

**Required function**

```ts
export async function getSessionBootstrap(user: AuthUser)
```

**TDD steps**
1. Add failing API unit tests for request path and response typing.
2. Implement `getSessionBootstrap()`.
3. Re-run API tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/api.test.ts
```

**Commit suggestion**
```bash
git commit -m "feat: add web session bootstrap client"
```

### Task 12.5: Add last-project persistence utility

**Files**
- Create: `packages/web/src/lastProject.ts`
- Test: `packages/web/src/lastProject.test.ts`

**Intent**
Isolate localStorage behavior so `App.tsx` and `PostAuthRouter.tsx` stay readable.

**Required API**

```ts
getLastProjectId(): string | null
setLastProjectId(projectId: string): void
clearLastProjectId(): void
```

**Rules**
- tolerate unavailable/invalid storage
- never throw into the UI

**TDD steps**
1. Add unit tests for get/set/clear and storage failure tolerance.
2. Implement the utility.
3. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/lastProject.test.ts
```

**Commit suggestion**
```bash
git commit -m "feat: add last project persistence utility"
```

### Task 12.6: Replace root startup flow with bootstrap + optimistic routing

**Files**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/PostAuthRouter.tsx`
- Test: `packages/web/src/App.test.tsx`
- Test: `packages/web/src/PostAuthRouter.test.tsx`

**Intent**
Reduce perceived latency by routing sooner and removing root dependence on separate `getMe()` + `listAccessibleProjects()` sequencing.

**Behavior changes**

#### On authenticated app start
- call `getSessionBootstrap(user)`
- update `projects`
- update `meName` from bootstrap instead of `getMe()` for root startup
- determine route target:
  - if local `lastProjectId` exists and matches returned projects, navigate there
  - else if `preferredProjectId` exists, navigate there
  - else show no-project screen

#### On successful route/project changes
- persist `lastProjectId`

#### Failure behavior
- if bootstrap fails, show the existing scoped auth/admin error path
- if `lastProjectId` is stale, ignore it and fall back

**Important implementation rule**
- do not navigate speculatively to an unknown cached project before bootstrap validation in this first pass
- use bootstrap to validate the cached id, then navigate immediately after payload arrival

This is slightly less aggressive than “blind optimistic navigation,” but safer and still materially simpler than today because it collapses two startup requests into one and removes the special root dependency on `/api/projects`.

**TDD steps**
1. Add App/PostAuthRouter tests for:
   - cached project id present and valid -> navigates there
   - cached project id stale -> falls back to preferred project id
   - no cached id -> uses preferred project id
   - no projects -> shows no-access state
2. Run failing tests.
3. Implement bootstrap startup flow.
4. Re-run tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/App.test.tsx packages/web/src/PostAuthRouter.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: streamline signed-in bootstrap routing"
```

### Task 12.7: Remove stale loading copy and tighten root-state UX

**Files**
- Modify: `packages/web/src/PostAuthRouter.tsx`
- Test: `packages/web/src/PostAuthRouter.test.tsx`

**Intent**
Align the language with the renamed product model and the new bootstrap behavior.

**Required copy changes**
- replace `Loading your workspaces...`
- preferred copy:
  - `Loading your projects...`
  - or `Opening your mindspace...`

Recommendation:
- use `Opening your mindspace...` when bootstrap is in flight and a preferred target is expected
- use `Loading your projects...` only if that state is truly list-focused

Keep the no-access copy project-oriented.

**TDD steps**
1. Update the snapshot/assertion in `PostAuthRouter.test.tsx`.
2. Change the copy.
3. Re-run the test.

**Run**
```bash
pnpm exec vitest run packages/web/src/PostAuthRouter.test.tsx
```

**Commit suggestion**
```bash
git commit -m "chore: update root loading copy for mindspace startup"
```

---

## Phase 4: Verification

### Task 12.8: Run focused verification

**Run**
```bash
pnpm exec vitest run \
  packages/web/src/api.test.ts \
  packages/web/src/App.test.tsx \
  packages/web/src/PostAuthRouter.test.tsx \
  packages/web/src/lastProject.test.ts

pnpm test:unit -- --run packages/platform/test/unit/session-bootstrap.test.ts

pnpm test:integration -- --run \
  packages/platform/test/integration/schema.integration.test.ts \
  packages/app/test/integration/authenticated-routes.integration.test.ts

pnpm test:e2e -- --run packages/worker/test/live/auth.e2e.test.ts

pnpm typecheck
git diff --check
```

### Task 12.9: Optional smoke extension

If the bootstrap route is deployed in the same session, add a smoke test for:

- `GET /api/session/bootstrap` with authenticated flow

**Files**
- Modify: `packages/worker/test/smoke/auth.smoke.test.ts`

This is optional for the implementation task itself, but recommended before claiming the startup flow is fully live-verified.

---

## Testing Notes

### Unit coverage
- session bootstrap service
- localStorage helper
- frontend route-target selection logic

### Integration coverage
- schema index presence
- bootstrap route payload shape in app surface

### E2E coverage
- worker route behavior under real auth harness

### Manual verification
After implementation:

1. sign in on `/`
2. confirm root routing reaches chat without the previous long spinner path
3. refresh on `/`
4. confirm the same project opens again
5. remove that user’s access to the cached project or simulate stale cache
6. confirm fallback to another accessible project or no-access state

---

## Risks And Mitigations

### Risk: stale cached project id causes a broken route
Mitigation:
- validate cached id against bootstrap results before routing

### Risk: bootstrap endpoint becomes a dumping ground
Mitigation:
- keep payload intentionally minimal: `me`, `projects`, `preferredProjectId`
- do not add channels/settings/feed data

### Risk: root flow still feels slow over remote worker + Neon
Mitigation:
- new bootstrap endpoint removes one request boundary
- membership lookup index improves the hot query
- this phase is the correct baseline before considering more aggressive caching

---

## Follow-On Opportunities

These are explicitly **not** part of Phase 12, but become reasonable after it lands:

1. server-side `preferredProjectId` personalization
   - persist most recently used project per user
2. lightweight bootstrap cache with SWR-style revalidation
3. chat-route-level skeletons while sidebar/project list hydrates
4. deployed smoke coverage for signed-in root bootstrap specifically

---

## Recommended Commit Sequence

1. `perf: add user lookup index for project memberships`
2. `feat: add session bootstrap service`
3. `feat: add session bootstrap route`
4. `feat: add web session bootstrap client`
5. `feat: add last project persistence utility`
6. `feat: streamline signed-in bootstrap routing`
7. `chore: update root loading copy for mindspace startup`

## Final Handoff Summary

This plan improves startup speed by changing the current root flow from:

```text
auth restored -> full project list fetch -> route
```

to:

```text
auth restored -> bootstrap response -> validated preferred route
```

while also preparing the query path and client behavior for a faster, more stable first route transition.
