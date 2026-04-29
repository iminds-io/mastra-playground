# ABOUTME: Implementation plan for fixing the root entry routing mismatch between project access, admin access, and bootstrap failure states
# ABOUTME: Separates true no-access from admin-only access and from bootstrap errors, with TDD-first changes across platform, app/worker, and web

# Phase 14: Root Entry Admin And No-Access Routing Implementation Plan

> **For Claude:** Execute this as an entry-state and access-model task. Do not treat this as a cosmetic UI tweak. Fix the root-route contract first, then wire the frontend to the new states, then verify member-only, admin-only, mixed-access, and bootstrap-failure behavior separately.

**Status**: Planning  
**Created**: 2026-04-25  
**Assigned**: Claude + coworker  
**Priority**: High  
**Estimated Effort**: 2-3 focused sessions  
**Dependencies**: Phase 12 bootstrap endpoint, admin project listing route, current `project_memberships` model, current `/admin/test` console

## Goal
Make the web app’s initial signed-in entry behave correctly for all current access modes:

1. project member with accessible projects
2. admin-allowlisted user with no project memberships
3. signed-in non-admin user with no project memberships
4. signed-in user when bootstrap fails

## Architecture
The current root route treats `projects.length === 0` as the only post-authentication dead-end state. That is wrong for the current system because admin access and project access are separate concepts. The fix is to extend the bootstrap contract to return explicit entry capabilities, then make the frontend root router distinguish between:

- member entry
- admin-only entry
- true no-access
- bootstrap error

The root route should keep preferring real project access. If the user has projects, route to chat. If the user has no projects but does have admin/dev access, route to `/admin/test`. Only show the no-access screen when the user has neither.

## Tech Stack
- React 19 in `packages/web`
- custom router in `packages/web/src/router.tsx`
- Hono app and worker surfaces
- platform session bootstrap service
- Neon Postgres
- Firebase auth
- Vitest unit/integration/E2E/smoke suites

---

## Current-State Findings

### 1. The root route only understands project access
`PostAuthRouter` in `packages/web/src/PostAuthRouter.tsx` shows:

```ts
if (projects.length === 0) {
  return "You don't have access to any projects yet..."
}
```

It has no concept of admin access.

### 2. Session bootstrap only returns projects
`getSessionBootstrapForPrincipal()` in `packages/platform/src/services/session-bootstrap.ts` only returns:

- `me`
- `projects`
- `preferredProjectId`

It does not return whether the signed-in principal can access admin/dev surfaces.

### 3. Admin access is implemented separately from project access
`/api/dev/projects` in `packages/worker/src/index.ts` and `packages/app/src/server/factory.ts` is guarded by `ADMIN_EMAILS`. That allowlist does not affect `project_memberships` or `/api/session/bootstrap`.

So today a user can be:

- admin-allowlisted
- but still have zero `project_memberships`

In that case:

- `/admin/test` should work
- `/` currently shows a misleading no-access screen

### 4. Root bootstrap failures are hidden as no-access
In `packages/web/src/App.tsx`, `handleBootstrapSession()` reports failures into the `admin` error scope:

```ts
reportScopedError('admin', error)
```

But `PostAuthRouter` does not render bootstrap errors at all. If bootstrap fails and `projects` stays empty, the app falls through to the same no-access screen.

### 5. Admin and membership are currently valid separate concepts
This is not a “data bug” alone. It is a product-entry mismatch:

- project-member entry exists
- admin entry exists
- but the root route only models the project-member path

## Executive Decisions

### Decision 1: Do not broaden project access semantics
Do not make `/api/session/bootstrap` fabricate projects for admin users. Project access should remain driven by `project_memberships`.

### Decision 2: Extend bootstrap with explicit entry capabilities
The frontend should not infer admin state by separately probing `/api/dev/projects` from the root route. The bootstrap endpoint should explicitly tell the root router whether admin fallback is allowed.

### Decision 3: Root entry should prefer project access, then admin fallback
Correct precedence:

1. if accessible projects exist, route to chat
2. else if the user can access the admin/dev console, route to `/admin/test`
3. else show true no-access

### Decision 4: Bootstrap failure must render as its own state
The root route must distinguish:

- zero projects because the user truly has no access
- zero projects because bootstrap failed

Those are not the same user experience and not the same remediation path.

### Decision 5: Keep `/admin/test` dev-only
This task should not turn the dev admin console into a production product surface. The fix is about correct entry routing and messaging, not productizing `/admin/test`.

## Success Criteria

- [ ] `/api/session/bootstrap` returns explicit admin-entry capability
- [ ] signed-in users with accessible projects still route to `/chat/:projectId`
- [ ] signed-in admin-only users route to `/admin/test` instead of the no-access screen
- [ ] signed-in non-admin users with no projects still see the no-access screen
- [ ] bootstrap failures render a distinct error state with retry
- [ ] admin access logic is centralized, not duplicated inconsistently
- [ ] unit/integration/frontend tests cover all four entry states
- [ ] `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, and `pnpm test:smoke` pass

## Out Of Scope

- redesigning the admin console UX beyond what is needed for entry correctness
- changing the underlying auth provider
- changing the meaning of `project_memberships`
- making `/admin/test` available in production builds
- changing channel/thread chat behavior

## Recommended Sequencing

1. define and test the new bootstrap response contract
2. centralize admin allowlist evaluation
3. extend app and worker bootstrap routes
4. update frontend API typing and root-state model
5. update `PostAuthRouter` to render explicit entry states
6. update `App.tsx` bootstrap handling and retry behavior
7. verify root behavior in frontend tests
8. verify live/dev worker behavior with integration and smoke coverage

---

## Phase 1: Define The Entry-State Contract

### Task 14.1: Add explicit admin-entry capability to session bootstrap

**Files**
- Modify: `packages/platform/src/services/session-bootstrap.ts`
- Create: `packages/platform/src/services/admin-access.ts`
- Test: `packages/platform/test/unit/session-bootstrap.test.ts`
- Test: `packages/platform/test/unit/admin-access.test.ts`

**Intent**
Make bootstrap return the data the root route actually needs.

**Target response shape**

```ts
type SessionBootstrapResult = {
  me: {
    uid: string;
    email: string | null;
    name: string | null;
  };
  projects: AccessibleProjectSummary[];
  preferredProjectId: string | null;
  capabilities: {
    canAccessAdminConsole: boolean;
  };
};
```

**Implementation notes**
- `canAccessAdminConsole` should be computed from the same normalized allowlist logic used by `/api/dev/projects`
- the service should not query `/api/dev/projects`
- keep bootstrap pure: it reports capabilities, it does not change project access semantics

**TDD steps**
1. Add a failing unit test for allowlist normalization and membership:
   - mixed-case emails
   - comma-separated strings
   - empty values
2. Add a failing unit test for bootstrap:
   - member user with projects and admin access false
   - admin-only user with zero projects and admin access true
3. Run the tests and confirm failure.
4. Implement `admin-access.ts` and extend `session-bootstrap.ts`.
5. Re-run the tests.

**Run**
```bash
pnpm exec vitest run \
  packages/platform/test/unit/admin-access.test.ts \
  packages/platform/test/unit/session-bootstrap.test.ts
```

**Commit suggestion**
```bash
git commit -m "feat: add explicit admin capability to session bootstrap"
```

### Task 14.2: Reuse the same admin capability logic in app and worker routes

**Files**
- Modify: `packages/app/src/server/factory.ts`
- Modify: `packages/worker/src/index.ts`
- Test: `packages/app/test/integration/authenticated-routes.integration.test.ts`
- Test: `packages/worker/test/live/auth.e2e.test.ts`

**Intent**
Remove drift between bootstrap capability evaluation and `/api/dev/projects` route gating.

**Implementation notes**
- import and reuse the shared allowlist helper
- app bootstrap route should pass the capability into `getSessionBootstrapForPrincipal(...)`
- worker bootstrap route should do the same
- `/api/dev/projects` should also use the shared helper to avoid silent divergence

**TDD steps**
1. Add failing integration coverage for:
   - `/api/session/bootstrap` returns `capabilities.canAccessAdminConsole = true` for allowlisted email
   - `/api/session/bootstrap` returns `false` for non-allowlisted email
2. Add failing integration coverage that `/api/dev/projects` still returns `403` when not allowlisted.
3. Run the tests and confirm failure.
4. Implement shared capability plumbing in both route surfaces.
5. Re-run the tests.

**Run**
```bash
pnpm exec vitest run \
  packages/app/test/integration/authenticated-routes.integration.test.ts
```

**Commit suggestion**
```bash
git commit -m "refactor: centralize admin access evaluation"
```

---

## Phase 2: Fix The Frontend Root-State Model

### Task 14.3: Extend frontend bootstrap types and root state

**Files**
- Modify: `packages/web/src/api.ts`
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/api.test.ts`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Preserve the backend bootstrap capability on the client and stop treating the root route as “projects only”.

**Implementation notes**
- extend `SessionBootstrap` typing in `api.ts`
- add client state for:
  - `canAccessAdminConsole`
  - `bootstrapError`
- on successful bootstrap:
  - update `projects`
  - update `bootstrapTargetProjectId`
  - update `canAccessAdminConsole`
  - clear any prior bootstrap error
- on bootstrap failure:
  - store a root-visible error state
  - do not silently collapse into no-access

**Important detail**
`handleBootstrapSession()` currently reports errors under `'admin'`. That is wrong for root routing. Add a dedicated scope, such as:

```ts
reportScopedError('session', error)
```

or explicit root bootstrap error state if that reads cleaner.

**TDD steps**
1. Add failing API typing test or compile expectation for `capabilities.canAccessAdminConsole`.
2. Add failing `App.test.tsx` coverage that bootstrap success updates the admin capability state.
3. Add failing `App.test.tsx` coverage that bootstrap failure creates a retryable root error state.
4. Run tests and confirm failure.
5. Implement the minimal state changes.
6. Re-run tests.

**Run**
```bash
pnpm exec vitest run \
  packages/web/src/api.test.ts \
  packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: track root bootstrap capabilities and failures"
```

### Task 14.4: Replace the current PostAuthRouter dead-end logic with explicit entry states

**Files**
- Modify: `packages/web/src/PostAuthRouter.tsx`
- Test: `packages/web/src/PostAuthRouter.test.tsx`

**Intent**
Model the actual entry-state matrix instead of one empty-project fallback.

**Target behavior**

1. `isLoading === true`
- show loading screen: `Opening your mindspace...`

2. `bootstrapError`
- show a dedicated error card:
  - “We couldn’t load your mindspace entry.”
  - retry button
  - sign out button

3. `projects.length > 0 && targetProjectId`
- navigate to `/chat/:projectId`

4. `projects.length === 0 && canAccessAdminConsole === true`
- navigate to `/admin/test`

5. `projects.length === 0 && canAccessAdminConsole === false`
- show the true no-access card

**Implementation notes**
- do not navigate to `/admin/test` while still loading
- do not show the no-access screen when an error exists
- keep the component focused on entry decisions; do not add API logic here

**TDD steps**
1. Add failing tests for:
   - project-member user navigates to `/chat/:projectId`
   - admin-only user navigates to `/admin/test`
   - non-admin zero-project user sees no-access
   - bootstrap error renders dedicated retry UI
2. Run the tests and confirm failure.
3. Implement the new props and branching behavior.
4. Re-run the tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/PostAuthRouter.test.tsx
```

**Commit suggestion**
```bash
git commit -m "feat: separate root entry states for admin, no-access, and bootstrap error"
```

---

## Phase 3: Improve Admin/Test And Root Flow Coherence

### Task 14.5: Make `/admin/test` explicitly explain the access model

**Files**
- Modify: `packages/web/src/AdminConsole.tsx`
- Test: `packages/web/src/AdminConsole.test.tsx`

**Intent**
Reduce future confusion by making the admin console explain that admin listing and project membership are different concerns.

**Recommended copy**
- near the project list or header:
  - `Admin project listing is separate from project membership. Opening chat still depends on project access.`

This is not the root fix, but it is valuable operator guidance.

**TDD steps**
1. Add failing render test for the explanatory copy.
2. Run the test and confirm failure.
3. Implement the minimal UI copy.
4. Re-run the test.

**Run**
```bash
pnpm exec vitest run packages/web/src/AdminConsole.test.tsx
```

**Commit suggestion**
```bash
git commit -m "docs: clarify admin console versus project access"
```

### Task 14.6: Ensure the root route does not accidentally preserve stale empty state

**Files**
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx`

**Intent**
Protect against state drift where a prior empty-project render survives a later successful bootstrap.

**Checks to add**
- signed-out -> signed-in transition clears prior root error state
- successful bootstrap clears previous no-access/error state
- route changes do not overwrite a valid bootstrap result with stale empty state

**TDD steps**
1. Add failing tests for:
   - failed bootstrap followed by successful bootstrap
   - signed-out reset followed by sign-in bootstrap
2. Run the tests and confirm failure.
3. Implement the minimal state reset logic.
4. Re-run the tests.

**Run**
```bash
pnpm exec vitest run packages/web/src/App.test.tsx
```

**Commit suggestion**
```bash
git commit -m "fix: harden root bootstrap state transitions"
```

---

## Phase 4: Verification

### Task 14.7: Full local verification

**Run**
```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:smoke
git diff --check
```

**Expected**
- all commands pass

### Task 14.8: Manual verification matrix

**Local frontend**
- `http://localhost:5173/`
- `http://localhost:5173/admin/test`

**Cases**

1. **Project member**
- sign in with a user that has `project_memberships`
- expected: `/` routes into `/chat/:projectId`

2. **Admin-only user**
- sign in with a user in `ADMIN_EMAILS` but with no project memberships
- expected: `/` routes to `/admin/test`

3. **Non-admin, no-project user**
- sign in with a user that has no project memberships and is not in `ADMIN_EMAILS`
- expected: no-access screen

4. **Bootstrap failure**
- temporarily point local frontend at a broken backend target or induce bootstrap failure in a controlled test
- expected: dedicated error state with retry, not the generic no-access card

### Task 14.9: Live deployment verification

**Checks**
- `GET /api/session/bootstrap` returns `capabilities.canAccessAdminConsole`
- allowlisted admin test user:
  - `/api/dev/projects` => `200`
  - `/` => `/admin/test` when no projects
- normal member user:
  - `/` => `/chat/:projectId`

**Suggested commands**
```bash
curl -i https://mastra-mindspace-api.dev-726.workers.dev/api/session/bootstrap \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>"

curl -i https://mastra-mindspace-api.dev-726.workers.dev/api/dev/projects \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>"
```

---

## Risks And Mitigations

### Risk 1: Admin users with projects should still enter chat
Mitigation:
- keep strict precedence:
  - projects first
  - admin fallback second

### Risk 2: Root error state could regress the Phase 12 fast bootstrap path
Mitigation:
- keep `targetProjectId` logic intact
- add explicit tests for cached-project bootstrap success

### Risk 3: Drift between app and worker route logic
Mitigation:
- centralize allowlist evaluation
- test both surfaces

### Risk 4: Confusing product semantics remain hidden
Mitigation:
- add explicit admin-vs-membership explanation in the dev console
- keep root no-access copy specific to true no-access only

---

## Definition Of Done

- bootstrap response includes `capabilities.canAccessAdminConsole`
- root route no longer conflates admin-only access with no access
- root route no longer hides bootstrap failures as no access
- admin-only users can reach `/admin/test` directly from `/`
- project members still route directly into chat
- tests cover all four entry states
- full verification suite passes

---

## Recommended Commit Sequence

1. `feat: add admin capability to session bootstrap`
2. `refactor: centralize admin access evaluation`
3. `feat: separate root entry states`
4. `docs: clarify admin console access model`
5. `fix: harden root bootstrap state transitions`

