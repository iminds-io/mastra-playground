# ABOUTME: Revised implementation plan for fully functional project settings in Mastra Mindspace
# ABOUTME: Replaces the earlier modal-first CRUD plan with a concrete project-membership, invitation, and mind-config strategy

# Phase 11i: Functional Settings Implementation Plan

> **For Claude:** Execute this as a backend-first product-settings task, not as a UI-only modal task.

**Status**: Revised Planning  
**Created**: 2026-04-23  
**Updated**: 2026-04-24  
**Assigned**: Claude + Remy  
**Priority**: High  
**Estimated Effort**: 3-5 focused sessions  
**Dependencies**: Phase 11b sidebar gear affordance, current settings shell in `packages/web`, current auth and project context model

## Goal
Implement a **fully functional project settings system** behind the existing settings modal. This includes:

1. project-scoped membership and roles
2. invitation-by-email workflow
3. editable project metadata
4. project-scoped mind configuration for known runtime agents
5. frontend integration against real APIs

This plan intentionally **does not** include a phase-1 “default public project” feature because the current product and runtime do not consume that concept anywhere else.

## Executive Decision
The previous settings plan is not concrete enough because it assumes settings can be built by adding CRUD endpoints on top of the current schema. That is not true.

The core issue is:

- `organization_memberships` currently grants access to **all** projects in an organization
- the UI and product expectation for settings is **project-scoped collaboration**
- invite/remove member operations are therefore under-specified unless we introduce **project-level membership**

So the first principle of this revised plan is:

```text
Settings are project-scoped product settings.
Therefore membership and invitation must be project-scoped too.
```

## Current-State Findings

### 1. Access is organization-scoped today
- [project-context.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/services/project-context.ts)
- [memberships.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/db/repositories/memberships.ts)

`loadProjectContext()` resolves project access by joining:

```text
users -> organization_memberships -> projects
```

That means an org member implicitly has access to every project in that org.

### 2. Invitations do not exist
- [users.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/db/repositories/users.ts)

Users are only created on sign-in via `upsertUser()`. There is no table or service for pending invitations.

### 3. Minds are runtime agents, not DB-defined personas
- [registry.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/mastra/agents/registry.ts)
- [project-agent.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/mastra/agents/project-agent.ts)
- [librarian.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/mastra/agents/librarian.ts)

The current “minds” in the UI are stubs. The runtime agents are code-defined. So settings must start as **configuration for known agents**, not arbitrary user-created DB agents.

### 4. The current settings modal is only a shell
- [SettingsModal.tsx](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/web/src/SettingsModal.tsx)

It renders tabs and static/stubbed content, but it is not backed by real settings contracts.

### 5. “Default public project” has no product consumer
There is no current route, bootstrap flow, landing page, or auth rule using this concept. It should not be forced into phase 1.

## Revised Scope

### In scope
- project metadata editing
- project archive action
- project-scoped member listing
- project-scoped invite/create membership
- project-scoped member removal
- project-scoped mind configuration for known agents
- frontend settings modal wired to real APIs

### Out of scope
- arbitrary user-created agents in DB
- full editor override UX in settings
- org-wide admin console
- default public project / public discoverability
- email delivery system for invitations

## Product Model

### A. Project Membership
Introduce a new table:

```text
project_memberships
  id
  project_id
  user_id
  role            -- owner | admin | member
  created_at
  updated_at
  unique(project_id, user_id)
```

This becomes the source of truth for project access.

### B. Project Invitations
Introduce:

```text
project_invitations
  id
  project_id
  email
  role
  invited_by_user_id
  status          -- pending | accepted | revoked
  created_at
  updated_at
```

Phase-1 behavior:
- “Invite by email” creates a pending invitation row
- if the invited email already belongs to a known user, also materialize `project_membership` immediately
- if not, the invitation remains pending until a future sign-in/acceptance flow consumes it

This is enough for a real product feature without requiring outbound email infrastructure yet.

### C. Project Mind Configs
Introduce:

```text
project_mind_configs
  id
  project_id
  agent_id              -- project-agent | librarian | summarizer | mindspace-reviewer | mindspace-supervisor
  display_name
  icon
  blurb
  enabled
  prompt_override       -- optional
  created_at
  updated_at
  unique(project_id, agent_id)
```

Important rule:
- this configures known runtime agents
- it does **not** create new agents dynamically

That keeps phase 1 aligned with the current Mastra architecture.

## Success Criteria

- [ ] project access is resolved from `project_memberships`, not inferred from org membership alone
- [ ] existing project owners are backfilled into `project_memberships`
- [ ] `GET /api/projects/:projectId/settings/general` returns real project metadata
- [ ] `PATCH /api/projects/:projectId/settings/general` updates the project name
- [ ] `POST /api/projects/:projectId/settings/archive` archives the project
- [ ] `GET /api/projects/:projectId/settings/members` returns memberships and pending invitations
- [ ] `POST /api/projects/:projectId/settings/members/invite` creates an invitation and grants membership immediately if the user already exists
- [ ] `DELETE /api/projects/:projectId/settings/members/:membershipId` removes a project member
- [ ] `GET /api/projects/:projectId/settings/minds` returns real per-project agent config rows
- [ ] `PATCH /api/projects/:projectId/settings/minds/:mindId` updates display/config fields
- [ ] the existing settings modal reads/writes these real APIs
- [ ] settings routes enforce project role checks
- [ ] unit/integration/frontend tests cover the new contracts
- [ ] `pnpm typecheck` passes

## Recommended Sequencing

1. schema migration and backfill
2. repository layer
3. project access migration in `loadProjectContext()`
4. settings service
5. worker/app settings routes
6. frontend API client
7. modal general tab
8. modal members tab
9. modal minds tab
10. final verification

## Phase 1: Schema and Access Foundation

### Task 1.1: Add migration `004_project_settings_foundation.sql`

**Create**
- `packages/platform/src/db/migrations/004_project_settings_foundation.sql`

**Migration contents**

1. create `project_memberships`
2. create `project_invitations`
3. create `project_mind_configs`
4. backfill `project_memberships` from existing owner/admin relationships:
   - every `(project, organization membership)` pair currently implied should become an explicit `project_membership`
5. seed `project_mind_configs` for every active project with known agents:
   - `project-agent`
   - `librarian`
   - `summarizer`
   - `mindspace-reviewer`
   - `mindspace-supervisor`

**Required SQL shape**

```sql
create table if not exists project_memberships (...);
create table if not exists project_invitations (...);
create table if not exists project_mind_configs (...);
create unique index ...;
insert into project_memberships ...
insert into project_mind_configs ...
```

### Task 1.2: Add schema integration test

**Create**
- `packages/platform/test/integration/settings-schema.integration.test.ts`

Verify:
- new tables exist
- uniqueness works
- seeded mind configs exist after bootstrap/migration fixture setup

## Phase 2: Repository Layer

### Task 2.1: Project repositories

**Modify**
- [projects.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/db/repositories/projects.ts)

Add:
- `getProjectById()`
- `getProjectDetail()`
- `updateProjectName()`
- `archiveProject()`

### Task 2.2: Project membership repositories

**Modify**
- [memberships.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/db/repositories/memberships.ts)

Add:
- `listProjectMemberships(projectId)`
- `getProjectMembership(projectId, userId)`
- `addProjectMembership({ projectId, userId, role })`
- `removeProjectMembership({ membershipId, projectId })`

Do **not** remove the existing organization membership helpers. They still matter for org ownership/bootstrap.

### Task 2.3: User lookup helpers

**Modify**
- [users.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/db/repositories/users.ts)

Add:
- `getUserByEmail(email)`
- `listUsersByProject(projectId)` only if needed by the UI, otherwise keep it out

### Task 2.4: Invitation repositories

**Create**
- `packages/platform/src/db/repositories/project-invitations.ts`

Add:
- `createProjectInvitation()`
- `listProjectInvitations()`
- `revokeProjectInvitation()`
- `acceptProjectInvitationsForEmail()` for future sign-in consumption

### Task 2.5: Mind config repositories

**Create**
- `packages/platform/src/db/repositories/project-mind-configs.ts`

Add:
- `listProjectMindConfigs()`
- `updateProjectMindConfig()`
- `getProjectMindConfigById()`

### Task 2.6: Repository tests

**Create**
- `packages/platform/test/unit/settings-repositories.test.ts`

Cover:
- insert/list/update/remove behaviors
- membership uniqueness
- invitation status transitions
- per-project mind config uniqueness

## Phase 3: Project Access Migration

### Task 3.1: Migrate `loadProjectContext()`

**Modify**
- [project-context.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/platform/src/services/project-context.ts)

Change project access resolution from:

```text
users -> organization_memberships -> projects
```

to:

```text
users -> project_memberships -> projects
```

Return:
- `actorUserId`
- `organizationId`
- `projectId`
- `role`
- `resourceId`

### Task 3.2: Add focused project-context integration coverage

**Modify or create**
- `packages/platform/test/integration/project-context.integration.test.ts`

Verify:
- a user without project membership is denied
- owner/admin/member roles resolve correctly
- archived projects are denied

## Phase 4: Settings Service

### Task 4.1: Create `services/settings.ts`

**Create**
- `packages/platform/src/services/settings.ts`

Responsibilities:

- `getProjectGeneralSettingsForPrincipal()`
- `updateProjectGeneralSettingsForPrincipal()`
- `archiveProjectForPrincipal()`
- `listProjectSettingsMembersForPrincipal()`
- `inviteProjectMemberForPrincipal()`
- `removeProjectMemberForPrincipal()`
- `listProjectMindConfigsForPrincipal()`
- `updateProjectMindConfigForPrincipal()`

### Access rules

- `member`: read settings only
- `admin`: mutate project metadata, members, and minds
- `owner`: same as admin, plus cannot remove the last owner

### Additional invariants

- cannot invite duplicate active membership
- cannot downgrade/remove the last owner
- cannot update unknown `agent_id`
- archive should be blocked if already archived

### Task 4.2: Service tests

**Create**
- `packages/platform/test/unit/settings-service.test.ts`

Cover:
- read vs write role gating
- duplicate invite behavior
- existing-user immediate membership grant
- last-owner protection
- mind-config update validation

## Phase 5: Settings Routes

### Task 5.1: Worker routes

**Modify**
- [packages/worker/src/index.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/worker/src/index.ts)

Add:
- `GET /api/projects/:projectId/settings/general`
- `PATCH /api/projects/:projectId/settings/general`
- `POST /api/projects/:projectId/settings/archive`
- `GET /api/projects/:projectId/settings/members`
- `POST /api/projects/:projectId/settings/members/invite`
- `DELETE /api/projects/:projectId/settings/members/:membershipId`
- `GET /api/projects/:projectId/settings/minds`
- `PATCH /api/projects/:projectId/settings/minds/:mindId`

### Task 5.2: App routes parity

**Modify**
- [packages/app/src/server/factory.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/app/src/server/factory.ts)

Keep Node/Hono dev server in sync with Worker behavior.

### Task 5.3: Route integration tests

**Create**
- `packages/app/test/integration/settings-routes.integration.test.ts`

Verify:
- auth required
- project membership required
- admin/owner mutation gating
- expected response shapes for all settings routes

## Phase 6: Frontend API Contract

### Task 6.1: Extend `api.ts`

**Modify**
- [packages/web/src/api.ts](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/web/src/api.ts)

Add:
- `getProjectSettingsGeneral()`
- `updateProjectSettingsGeneral()`
- `archiveProject()`
- `listProjectSettingsMembers()`
- `inviteProjectMember()`
- `removeProjectMember()`
- `listProjectMindConfigs()`
- `updateProjectMindConfig()`

Also add concrete frontend types:
- `ProjectSettingsGeneral`
- `ProjectSettingsMember`
- `ProjectInvitation`
- `ProjectMindConfig`

## Phase 7: General Tab

### Goal
Replace the current readonly shell with a real form.

### UI behavior
- editable name input
- readonly slug
- readonly created date
- readonly status
- save button
- archive button

### Files
- [SettingsModal.tsx](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/web/src/SettingsModal.tsx)
- optional extraction to `SettingsGeneralTab.tsx`

### Tests
- successful save
- archive confirmation path
- disabled state while saving
- inline error handling

## Phase 8: Members Tab

### Goal
Back the members tab with real data and invite/remove actions.

### UI behavior
- list active memberships
- list pending invitations separately
- invite by email + role selector
- remove member action

### Required product decisions already locked by this plan
- invites are project-scoped
- existing users receive membership immediately and still keep an invitation record optional only if needed
- no email sending yet; this is control-plane state and access provisioning

### Tests
- invite existing user
- invite unknown email creates pending invitation
- remove member
- cannot remove last owner

## Phase 9: Minds Tab

### Goal
Make minds real per-project configs for known agents.

### UI behavior
- list seeded configs
- editable display name
- editable icon
- editable blurb
- enable/disable toggle
- optional prompt override textarea

### Important rule
This tab edits **project-specific presentation/configuration** for known agents. It does not create arbitrary new agents.

### Runtime follow-up
If later desired, `project-agent` / `librarian` instructions can read project mind config at execution time. That runtime consumption is optional for phase 1, but the config contract should support it.

## Phase 10: Final Frontend Integration

### Task 10.1: App wiring

**Modify**
- [App.tsx](/Users/pureicis/dev/mastra-playground/mastra-mindspace/packages/web/src/App.tsx)

Add:
- settings modal data loading on open
- optimistic refresh after mutations
- scoped error handling per tab

### Task 10.2: Component extraction if needed

Recommended split if the modal becomes dense:
- `SettingsGeneralTab.tsx`
- `SettingsMembersTab.tsx`
- `SettingsMindsTab.tsx`

## Verification Plan

### Unit
- repository tests
- service tests
- frontend tab component tests

### Integration
- app route tests
- project-context access tests
- schema integration tests

### Frontend
- modal open/close
- general tab save/archive
- members invite/remove
- minds edit/toggle

### Repo-wide
- `pnpm typecheck`
- targeted vitest for new settings files
- `git diff --check`

## Recommended Commit Boundaries

1. schema + repository foundation
2. project-context migration + settings service
3. app/worker settings routes + integration tests
4. frontend API + general tab
5. members tab
6. minds tab + final App integration

## Final Recommendation

Do **not** execute the old `11i` plan as written.

Execute this revised plan instead, because it matches the actual architecture:

- project-scoped collaboration
- real invite flow
- real role gating
- real mind config without pretending agents are already DB-native

That makes the settings feature coherent with the rest of `mastra-mindspace`, instead of shipping a modal that suggests capabilities the platform still cannot support.
