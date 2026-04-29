# ABOUTME: Implementation plan for resetting the deployed Mastra Mindspace environment to a fresh baseline
# ABOUTME: Establishes a clean database, intentional admin bootstrap flow, and proper handling for inaccessible project URLs

# Phase 15: Fresh Start Deployment And Access Reset Implementation Plan

> **For Claude:** Execute this as an environment-and-access reset task. Do not try to preserve old data, restore prior memberships, or maintain backward compatibility. The goal is a coherent fresh-start deployment where admin bootstrap, project membership, and inaccessible-project behavior are all intentional and explicit.

**Status**: Planning  
**Created**: 2026-04-25  
**Assigned**: Claude + coworker  
**Priority**: High  
**Estimated Effort**: 2-4 focused sessions  
**Dependencies**: Phase 14 root-entry routing, current deployed Cloudflare worker, current Neon project, current admin allowlist flow

## Goal
Reset the deployed `mastra-mindspace` environment to a clean baseline so that:

1. an allowlisted admin with no project memberships lands on `/admin/test`
2. the admin can create a fresh demo project and then enter chat
3. non-admin users with no projects see a true no-access state
4. stale or inaccessible project URLs fail cleanly instead of producing ambiguous UI or backend `500`s

## Architecture
This plan assumes old data is disposable. Instead of repairing or importing prior user/project state, we create a brand-new clean Neon database, migrate it to the current platform schema, initialize Mastra’s storage schema, point the deployed worker at it, and then validate the intended fresh-start operator workflow.

On top of that environment reset, this plan also fixes the remaining access/error contract bug: project-scoped routes for inaccessible projects should return a clean product-level authorization/not-found response, not `500`. This ensures stale URLs and cross-user project access behave predictably in the fresh-start system.

## Tech Stack
- Cloudflare Workers via `wrangler`
- Neon Postgres
- platform SQL migrations in `packages/platform`
- Mastra Postgres storage schema init via `initMastraSchema()`
- Firebase auth
- Hono app/worker surfaces
- Vitest unit/integration/E2E/smoke suites

---

## Current-State Findings

### 1. The deployed worker and the old app dataset have diverged
The current deployed worker was switched to a replacement database (`mindcloud_prod_fix_03`) that does **not** contain the legacy `test02@test.com` app user or its older organization/project relationships.

What this means today:
- admin allowlist can work
- root bootstrap can return `capabilities.canAccessAdminConsole: true`
- but `projects: []` for that account

### 2. The current replacement DB contains mostly synthetic smoke-created data
The replacement DB currently contains only a handful of users/projects, and those are largely synthetic test records. This is the opposite of a clean fresh-start environment because it still carries runtime noise, but not the old real app state.

### 3. The correct fresh-start admin entry is already conceptually defined
With Phase 14:
- `/` can route admin-only users to `/admin/test`
- `/admin/test` can create a project
- project bootstrap can upsert the user, add org/project memberships, and seed the project

So the missing piece is not product architecture. It is environment cleanliness and a final access/error contract cleanup.

### 4. Stale or inaccessible project URLs currently fail poorly
A project-scoped call like:

```text
GET /api/projects/:projectId/channels
```

can currently return `500` for an inaccessible project. That is incorrect. It should return a clean `403` or `404` according to the chosen product rule.

### 5. The fresh-start product contract should not depend on old data
The user explicitly does not want:
- data restoration
- backward compatibility
- preserving old project URLs as meaningful operator entry points

That means old project IDs and old memberships are not part of the target state.

## Executive Decisions

### Decision 1: Create a brand-new clean deployment database
Do not continue using:
- `mindcloud-test-01`
- `mindcloud_prod_fix_03`

as the fresh canonical environment.

Instead, create a new database dedicated to the fresh-start deployment.

### Decision 2: Use admin bootstrap as the canonical first-run workflow
The intended first operator flow is:

1. sign in as allowlisted admin
2. land on `/admin/test`
3. create a demo project
4. open `/chat/:projectId`

This should be treated as the official fresh-start path.

### Decision 3: Do not preload or seed fake project memberships for admin users
Admin allowlist and project membership remain separate concepts. The fresh-start admin should start with:

- `canAccessAdminConsole: true`
- `projects: []`

and create the first project intentionally.

### Decision 4: Inaccessible project routes must return product-level errors
Choose one:
- `403 Forbidden` for “project exists but you do not have access”
- `404 Not Found` for cloaked resources

Recommendation:
- use `403` for authenticated but unauthorized project access in the internal/product API

### Decision 5: Stop treating stale URLs as meaningful test paths
In the fresh-start system, manual testing should begin from:
- `/`
- `/admin/test`

not by browsing to leftover smoke-generated `/chat/:projectId` URLs.

## Success Criteria

- [ ] a brand-new Neon DB exists for the deployed worker
- [ ] platform migrations are applied to that DB
- [ ] Mastra schema is initialized on that DB
- [ ] deployed worker `DATABASE_URL` points to that DB
- [ ] admin allowlisted user gets:
  - `capabilities.canAccessAdminConsole: true`
  - `projects: []`
  - `preferredProjectId: null`
- [ ] admin user lands on `/admin/test` from `/`
- [ ] creating a demo project from `/admin/test` gives the admin a real project membership
- [ ] root bootstrap then returns that project in `projects`
- [ ] `/chat/:projectId` works for the newly created project
- [ ] inaccessible project-scoped routes return clean `403` or `404`, not `500`
- [ ] verification suite and live checks pass

## Out Of Scope

- importing old users, old memberships, or old projects
- preserving historical project URLs
- productionizing the admin console
- changing Firebase auth itself
- redesigning project bootstrap UX beyond what is needed for a coherent fresh start

## Recommended Sequencing

1. create the fresh deployment DB
2. migrate app schema
3. initialize Mastra schema
4. point deployed worker to the new DB
5. verify fresh bootstrap state for admin user
6. verify admin bootstrap-project flow
7. fix project-scoped unauthorized route handling
8. verify stale/inaccessible project URL behavior
9. run final smoke and live verification

---

## Phase 1: Provision A Brand-New Deployment Database

### Task 15.1: Create the fresh Neon database and characterize it

**Files**
- Modify: `.env` (only if you are intentionally repointing local operator commands)
- Docs: record the chosen DB name in the implementation notes or deployment checklist

**Intent**
Start from a truly clean baseline.

**Recommended database name**
Use a new name such as:

```text
mindcloud_fresh_prod_01
```

Do not reuse the existing replacement DB.

**Steps**
1. Create the new DB in the same Neon project.
2. Confirm:
   - current user can connect
   - `public` schema allows `CREATE`
3. Confirm the DB starts empty except system tables.

**Validation SQL**
```sql
select current_database(), current_user;

select n.nspname,
       pg_catalog.pg_get_userbyid(n.nspowner) as owner,
       has_schema_privilege(current_user, n.oid, 'CREATE') as can_create
from pg_namespace n
where n.nspname = 'public';
```

**Expected**
- `can_create = true`

**Commit**
No commit yet. This is environment setup.

### Task 15.2: Apply platform migrations to the fresh DB

**Files**
- No code change if migrations are already correct
- Use existing migration files in `packages/platform/src/db/migrations`

**Steps**
1. Point `DATABASE_URL` at the fresh DB for the migration command.
2. Run:

```bash
DATABASE_URL='<fresh-db-url>' pnpm --filter @mastra-mindspace/platform db:migrate
```

3. Verify:
   - `schema_migrations` contains the current repo migrations
   - core tables exist:
     - `users`
     - `organizations`
     - `organization_memberships`
     - `projects`
     - `project_memberships`
     - `project_invitations`
     - `project_mind_configs`
     - `project_channels`
     - `mindspace_roots`
     - `mindspace_bindings`

**Expected**
- no app rows yet
- schema only

### Task 15.3: Initialize Mastra schema on the fresh DB

**Files**
- No code change if `initMastraSchema()` is already correct

**Steps**
1. Run:

```bash
DATABASE_URL='<fresh-db-url>' \
pnpm exec tsx -e "import { initMastraSchema } from './packages/platform/src/mastra/storage.ts'; (async()=>{ await initMastraSchema(process.env.DATABASE_URL!); })();"
```

2. Verify `mastra_*` tables exist.

**Expected**
- app schema and Mastra schema are both provisioned before any live traffic

---

## Phase 2: Repoint The Deployed Worker

### Task 15.4: Point deployed `DATABASE_URL` at the fresh DB

**Files**
- Cloudflare Worker secret only
- Optional local `.env` update for operator convenience

**Steps**
1. Set the worker secret:

```bash
printf '%s' '<fresh-db-url>' | pnpm --filter @mastra-mindspace/worker exec wrangler secret put DATABASE_URL
```

2. Keep `ADMIN_EMAILS` configured for the intended admin accounts.

3. Redeploy:

```bash
pnpm --filter @mastra-mindspace/worker run deploy
```

**Validation**
```bash
curl -i https://mastra-mindspace-api.dev-726.workers.dev/health
```

Expected:
- `200 OK`

### Task 15.5: Verify the fresh-start bootstrap state for the admin account

**Intent**
Confirm the environment is truly fresh and the root-entry contract is coherent before creating any project.

**Steps**
1. Use a real Firebase token for the allowlisted admin account.
2. Call:

```bash
curl -i https://mastra-mindspace-api.dev-726.workers.dev/api/session/bootstrap \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>"
```

**Expected**
```json
{
  "me": { ... },
  "capabilities": {
    "canAccessAdminConsole": true
  },
  "projects": [],
  "preferredProjectId": null
}
```

This is the intended fresh-start state for an admin before bootstrapping the first project.

---

## Phase 3: Validate The Canonical Admin Bootstrap Flow

### Task 15.6: Verify root routing for the fresh admin user

**Files**
- No code change if Phase 14 already behaves correctly

**Steps**
1. Open:
   - local frontend against deployed worker, or deployed frontend if available
2. Sign in as the allowlisted admin
3. Start from `/`

**Expected**
- user lands on `/admin/test`
- not on a no-access screen
- not on a broken project route

### Task 15.7: Create the first project through `/admin/test`

**Intent**
Make the first project creation path the authoritative fresh-start workflow.

**Steps**
1. In `/admin/test`, click `Create Demo Project`
2. Verify backend response succeeds
3. Then click `Open Chat Mindspace`

**Expected backend effects**
- `users` row created or updated for the admin principal
- `organization_memberships` row created
- `projects` row created
- `project_memberships` row created
- `project_mind_configs` seeded
- `mindspace_roots` / `mindspace_bindings` provisioned
- default `project_channels` row created

**Validation SQL**
```sql
select id, email, firebase_uid from users where firebase_uid = '<admin-firebase-uid>';

select count(*) from project_memberships pm
join users u on u.id = pm.user_id
where u.firebase_uid = '<admin-firebase-uid>';
```

### Task 15.8: Verify bootstrap after first project creation

**Steps**
1. Call bootstrap again with the same admin token.

**Expected**
```json
{
  "capabilities": { "canAccessAdminConsole": true },
  "projects": [
    { "id": "<new-project-id>", ... }
  ],
  "preferredProjectId": "<new-project-id>"
}
```

2. Verify the frontend root route now goes to `/chat/:projectId`.

---

## Phase 4: Fix Inaccessible Project URL Behavior

### Task 15.9: Add failing tests for unauthorized project-scoped routes

**Files**
- Test: `packages/platform/test/integration/...` or existing route/service integration files
- Test: `packages/worker/test/live/...`

**Intent**
Do not let stale or cross-user project URLs return `500`.

**Behavior to lock**
- authenticated user requests project-scoped route for a project they do not belong to
- response should be `403` (recommended) or `404`
- never `500`

**Routes to cover**
- at minimum:
  - `GET /api/projects/:projectId/channels`
- optionally:
  - `GET /api/projects/:projectId/settings/general`
  - `POST /api/projects/:projectId/summarize`

**TDD steps**
1. Write failing integration/live tests that prove an unauthorized project call returns `500` today.
2. Run the tests and confirm failure.
3. Identify the exact service/repository layer where the uncaught access miss occurs.

### Task 15.10: Implement clean unauthorized-project error shaping

**Files**
- Likely modify:
  - `packages/platform/src/services/project-context.ts`
  - `packages/platform/src/services/access-control.ts`
  - route error mapping in app/worker if needed

**Intent**
Return a product-level access error instead of a generic internal server error.

**Recommendation**
- use `403 Forbidden` for authenticated access to a project outside the caller’s membership

**TDD steps**
1. Implement the smallest change to make the new unauthorized-project test pass.
2. Re-run the focused tests.
3. Confirm no authorized flows regress.

---

## Phase 5: Final Verification

### Task 15.11: Full verification suite

**Run**
```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:smoke
git diff --check
```

### Task 15.12: Manual verification matrix

**Admin fresh-start path**
1. sign in as allowlisted admin
2. `/` -> `/admin/test`
3. create demo project
4. open chat
5. refresh `/`
6. confirm `/` now routes to chat

**Non-admin no-access path**
1. sign in as non-allowlisted, no-project user
2. `/` -> no-access screen

**Inaccessible URL path**
1. sign in as user A
2. open project URL for user B’s project
3. confirm clean `403`/`404` behavior and non-broken UI

### Task 15.13: Live API checks

**Checks**
```bash
curl -i https://mastra-mindspace-api.dev-726.workers.dev/health
curl -i https://mastra-mindspace-api.dev-726.workers.dev/api/session/bootstrap \
  -H "Authorization: Bearer <ADMIN_FIREBASE_ID_TOKEN>"
curl -i https://mastra-mindspace-api.dev-726.workers.dev/api/dev/projects \
  -H "Authorization: Bearer <ADMIN_FIREBASE_ID_TOKEN>"
```

After first project creation, also verify:
```bash
curl -i https://mastra-mindspace-api.dev-726.workers.dev/api/projects/<projectId>/channels \
  -H "Authorization: Bearer <ADMIN_FIREBASE_ID_TOKEN>"
```

---

## Risks And Mitigations

### Risk 1: Test suites pollute the fresh shared environment
Mitigation:
- prefer isolated Neon branches for integration/E2E
- keep the fresh deployed DB for operator/manual use

### Risk 2: Admin user remains bootstrap-only without real membership after project creation
Mitigation:
- verify `bootstrapProjectForPrincipal()` creates both org and project memberships
- validate with SQL after the first bootstrap action

### Risk 3: Inaccessible routes still 500 in some endpoints
Mitigation:
- add targeted route tests, not just one manual probe
- centralize access-miss handling

### Risk 4: Confusion between admin capability and membership persists
Mitigation:
- keep the Phase 14 admin-console explanation
- keep the root route semantics strict and explicit

---

## Definition Of Done

- deployed worker points at a brand-new clean DB
- fresh admin bootstrap state is intentional and verified
- first project can be created entirely through `/admin/test`
- project membership exists after bootstrap
- `/chat/:projectId` works for the newly created project
- inaccessible project URLs fail cleanly, not with `500`
- full verification suite passes

---

## Recommended Commit Sequence

1. `fix: return clean unauthorized errors for inaccessible projects`
2. `docs: document fresh-start deployment baseline`

Environment changes (new DB, worker secret updates, deploy) are operational and not represented only by commits.

