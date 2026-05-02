# ABOUTME: Audit of .ai/knowledges/ docs against the live mastra-mindspace codebase
# ABOUTME: Identifies drift, root causes, batch-fix patterns, and a phased action plan

# Knowledge Docs Audit — 2026-05-03

**Date**: 2026-05-03
**Author**: Claude + Remy
**Status**: Final
**References**: [knowledges/01_technical_architecture.md, knowledges/02_adding_agents_and_workflows.md, knowledges/03_porting_and_reusing_mastra_mindspace.md, knowledges/usage_guide.md, packages/platform/src/mastra/agents/registry.ts, packages/platform/src/db/migrations/004_project_settings_foundation.sql, packages/platform/src/services/chat.ts, packages/worker/.dev.vars.example, .env.example]

---

## Executive Summary

Audited all 4 docs in `.ai/knowledges/` against the live codebase. Two are **ACCURATE** and two are **PARTIALLY_OUTDATED**. No doc is significantly misleading or obsolete — the project's architecture, package boundaries, factory patterns, and runtime split are described correctly throughout. Drift is concentrated in three places: (1) the `librarian` agent (added to the registry but not back-propagated into three docs), (2) the `004_project_settings_foundation` migration (added 3 tables, 3 repositories, 8 services, ~10 routes — none reflected in `01_technical_architecture.md`), and (3) two env-example files in `usage_guide.md` (root `.env.example` and `packages/worker/.dev.vars.example`) where the doc lists keys that aren't actually in the example files.

A **High-severity security finding** is included separately: the repo's local `.env` file contains real Neon, OpenRouter, and R2 production credentials. Not a doc issue per se, but surfaced because the audit found it.

| Verdict | Count | Docs |
|---------|-------|------|
| ACCURATE | 2 | `02_adding_agents_and_workflows.md`, `03_porting_and_reusing_mastra_mindspace.md` |
| PARTIALLY_OUTDATED | 2 | `01_technical_architecture.md`, `usage_guide.md` |
| SIGNIFICANTLY_OUTDATED | 0 | — |
| OBSOLETE | 0 | — |
| DEPRECATED | 0 | — |

---

## Per-Document Verdicts

| Doc | Verdict | Severity | Action | Top issues |
|-----|---------|----------|--------|------------|
| `01_technical_architecture.md` | PARTIALLY_OUTDATED | High | Update | Missing `librarian` agent; missing project-settings tables (`project_memberships`, `project_invitations`, `project_mind_configs`); platform-table count wrong (says 12, is 14); missing 3 repositories; missing 8 services; missing ~10 routes; "as of 2026-04-23" stale by 10 days |
| `02_adding_agents_and_workflows.md` | ACCURATE | Low | Minor patch | Registry example omits `librarian`; example violates its own kebab-vs-camelCase convention |
| `03_porting_and_reusing_mastra_mindspace.md` | ACCURATE | Low | Minor patch | Doesn't mention `packages/ui` in workspace breakdown; everything else verified |
| `usage_guide.md` | PARTIALLY_OUTDATED | High | Update | Worker `.dev.vars.example` claims (`MINDSPACE_ROOT=mindspaces`, `R2_BUCKET_NAME=mastra-mindspace`, `ADMIN_EMAILS=...`) don't match the actual file (`MINDSPACE_ROOT=workspaces`, no `R2_BUCKET_NAME`, no `ADMIN_EMAILS`); root `.env.example` doesn't contain claimed `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` lines; agent list omits `librarian`; SSE event list omits `thread_created` |

---

## Root Causes of Drift

Three systemic patterns explain ~90% of the issues:

### 1. The `librarian` agent was added without back-propagating into docs

The registry (`packages/platform/src/mastra/agents/registry.ts:38-43`) returns five agents — `projectAgent`, `librarian`, `summarizer`, `mindspaceReviewer`, `'mindspace-supervisor'` — but three docs list only four:

- `01_technical_architecture.md` §3 Key modules table omits it.
- `02_adding_agents_and_workflows.md` registry example (lines 99-125) omits it.
- `usage_guide.md` "Current code-defined agents" (lines 518-523) omits it.

Note: `registry-metadata.ts` *does* include `librarian` (correctly marked `exposed: false`), so the doc claim "read-capable agents are exposed" in `01_technical_architecture.md` is also inconsistent with reality.

### 2. Migration `004_project_settings_foundation.sql` cascaded into untracked changes

Adding this migration:
- Created 3 new tables (`project_memberships`, `project_invitations`, `project_mind_configs`)
- Added 3 repositories (`project-invitations.ts`, `project-mind-configs.ts`, `search.ts`)
- Added 8 services (`admin-access.ts`, `channel-event-emitter.ts`, `channel-events.ts`, `channel-seeding.ts`, `chat-timings.ts`, `search.ts`, `session-bootstrap.ts`, `settings.ts`)
- Mounted ~10 new routes (settings, members, invites, minds, search, session bootstrap, SSE channel events, posts/stream, dev/projects)

`01_technical_architecture.md` was last revised before the cascade and reflects the pre-migration state.

### 3. Env-example files diverged from the doc

`usage_guide.md` describes the env file contents from memory rather than as a literal mirror. The root `.env.example` omits `OPENROUTER_*` keys the doc claims are present, and `packages/worker/.dev.vars.example` differs in three places. Anyone copy-pasting from the doc into a fresh checkout will hit confusion.

---

## Batch-Fix Patterns

These are the search-and-replace / additive changes that resolve the majority of the issues:

### Add `librarian` everywhere agents are enumerated

- `01_technical_architecture.md` §3 Key modules → add row for `mastra/agents/librarian` (read-capable, `exposed: false`).
- `02_adding_agents_and_workflows.md:99-125` registry snippet → include `librarian` alongside `summarizer` and `mindspaceReviewer`.
- `usage_guide.md:518-523` agent list → add `librarian`.

Also reconcile the "read-capable agents are exposed" claim in `01_technical_architecture.md` — change to "selected read-capable agents are exposed (e.g. `summarizer`, `mindspaceReviewer`); `librarian` is read-capable but `exposed: false`."

### Update `01_technical_architecture.md` for the `004_project_settings_foundation` cascade

Add to the relevant tables/lists:

- **Tables** — add `project_memberships`, `project_invitations`, `project_mind_configs`. Update the "12 tables" count to 14 product tables (15 with `schema_migrations`). Recheck the doc's "39 tables total (12 + 27)" claim against the actual Mastra-managed table count after this fix.
- **Repositories** — add `project-invitations.ts`, `project-mind-configs.ts`, `search.ts`.
- **Services** — add `admin-access.ts`, `channel-event-emitter.ts`, `channel-events.ts`, `channel-seeding.ts`, `chat-timings.ts`, `search.ts`, `session-bootstrap.ts`, `settings.ts`.
- **HTTP API surface** — add: `GET /api/projects/:projectId/channels/:channelId/events` (SSE), `GET/PATCH /api/projects/:projectId/settings/general`, `POST /api/projects/:projectId/settings/archive`, `GET /api/projects/:projectId/settings/members`, `POST /api/projects/:projectId/settings/members/invite`, `DELETE /api/projects/:projectId/settings/members/:membershipId`, `GET/PATCH /api/projects/:projectId/settings/minds[/:mindId]`, `GET /api/session/bootstrap`, `GET /api/dev/projects`, `GET /api/projects/:projectId/search`, `POST /api/projects/:projectId/channels/:channelId/posts/stream`.
- **Directory map at §13** — add `registry-metadata.ts` under `mastra/`; add `build-agent.ts`, `librarian.ts`, `model.ts` under `mastra/agents/`.

### Resync `usage_guide.md` env examples to the actual files

Either edit the doc to match the files, or edit the files to match the doc. Concrete diffs to make them match the live state:

| Doc claim | Real file | Fix |
|-----------|-----------|-----|
| Root `.env.example` contains `OPENROUTER_API_KEY=...` and `OPENROUTER_MODEL=openai/gpt-4.1-mini` (doc 59-67) | Not present in `.env.example` | Add the keys to `.env.example` (preferred — they are required for runtime) OR remove from doc |
| Root `.env.example` has `ADMIN_EMAILS=admin@example.com` (doc 59-67) | Has `ADMIN_EMAILS=` (empty) | Add example value to `.env.example` (`admin@example.com`) |
| `packages/worker/.dev.vars.example` has `MINDSPACE_ROOT=mindspaces` (doc 96-110) | Has `MINDSPACE_ROOT=workspaces` | Pick one canonical value across both files and update the other |
| `packages/worker/.dev.vars.example` has `R2_BUCKET_NAME=mastra-mindspace` (doc 96-110) | Line missing | Add to `.dev.vars.example` |
| `packages/worker/.dev.vars.example` has `ADMIN_EMAILS=admin@example.com` (doc 96-110) | Line missing | Add to `.dev.vars.example` |

### Add missing SSE event to `usage_guide.md`

`packages/platform/src/services/chat.ts:69` includes `thread_created` in the streaming event union — add to the event list at `usage_guide.md:425-430`.

### Refresh stale "as of" date in `01_technical_architecture.md`

Footer says "Reflects the current worktree as of 2026-04-23." Update to today after applying the fixes.

### Minor: convention example fix in `02_adding_agents_and_workflows.md`

The doc states (convention #7, line 52): "Registry keys should match agent/workflow ids unless there is a documented legacy exception." The example then uses kebab-case id `'my-agent'` (line 75) registered under camelCase key `myAgent` (lines 103, 123). Either change the example id to `myAgent` or change the key to `'my-agent'` so the example follows its own rule.

### Minor: `packages/ui` mention in `03_porting_and_reusing_mastra_mindspace.md`

Add `packages/ui` to the Layer 3 / forking-checklist breakdown (line 266-268, 411).

---

## Consolidation Recommendations

No merges or drops needed. The four docs cover distinct, complementary slices:

- `01_technical_architecture.md` — system reference (what's where, why)
- `02_adding_agents_and_workflows.md` — how-to recipe for primitives
- `03_porting_and_reusing_mastra_mindspace.md` — strategy for forking/extracting
- `usage_guide.md` — operational runbook (commands, env, routes, troubleshooting)

There's some overlap between `01` (system reference) and `usage_guide.md` (route table) — both list `/api/*` endpoints. Worth considering a shared single source of truth for the route surface (e.g., move the canonical route table to `usage_guide.md` and have `01` link to it), but this is an optimization, not a fix.

---

## Security

These items came up during the audit and are worth raising even though they are not "doc drift":

### High — repo `.env` contains live secrets

`/Users/pureicis/dev/mastra-playground/mastra-mindspace/.env` (gitignored, present on disk) contains live credentials for production-shaped systems. Values intentionally redacted from this document; refer to the file directly. Categories present:

- `DATABASE_URL` and `DATABASE_URL_POOLED` — Neon Postgres connection strings (production-shaped DB name, real password)
- `NEON_API_KEY` — Neon control-plane API key
- `OPENROUTER_API_KEY` — OpenRouter LLM provider key
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — Cloudflare R2 credentials
- `FIREBASE_TEST_PASSWORD` — password for the Firebase test user (real value, not a placeholder)

Recommendation: confirm `.env` has never been committed (`.gitignore` excludes it; verify with `git log --all --full-history -- .env`); if there's any chance it has leaked via backups, screen-shares, or shared workstations, rotate the Neon, OpenRouter, and R2 keys. Do not paste raw values into commits, PRs, or logs — refer by variable name.

### Low — hardcoded fallback identifiers

- `packages/app/src/server/factory.ts:650` falls back to Firebase project id `'mindmap-aff6a'` when env is unset.
- `packages/app/src/server/factory.ts:654` falls back to local DB url `postgres://postgres:postgres@localhost:5432/hono_workspace`.

These are dev defaults, not secrets, but they pin a production-ish identifier into source. Consider failing closed instead.

### Informational — public Worker URL in doc

`01_technical_architecture.md` §3 references `https://mastra-mindspace-api.dev-726.workers.dev`. Public, not a secret, but worth being deliberate about whether the doc should expose it.

---

## Phased Action Plan

### Phase 1 — Quick wins (~30 min)

These are pure additions/string fixes with no decisions required:

- [ ] Add `librarian` to the agent enumeration in `01_technical_architecture.md` §3, `02_adding_agents_and_workflows.md` registry example, and `usage_guide.md`.
- [ ] Add `thread_created` SSE event to `usage_guide.md:425-430`.
- [ ] Add `registry-metadata.ts`, `build-agent.ts`, `librarian.ts`, `model.ts` to `01_technical_architecture.md` §13 directory map.
- [ ] Update "as of 2026-04-23" footer in `01_technical_architecture.md` after Phase 2 completes.
- [ ] Add `packages/ui` mention in `03_porting_and_reusing_mastra_mindspace.md` Layer 3 breakdown.
- [ ] Fix the kebab/camelCase inconsistency in `02_adding_agents_and_workflows.md` example.

### Phase 2 — Reflect the `004_project_settings_foundation` cascade in `01_technical_architecture.md` (~1-2 h)

- [ ] Add 3 tables, update count from 12 to 14 product tables.
- [ ] Recompute the "39 total tables" figure against actual Mastra-managed table count.
- [ ] Add 3 repositories.
- [ ] Add 8 services.
- [ ] Add ~10 routes to the HTTP API surface table.
- [ ] Reconcile "read-capable agents are exposed" against `librarian` having `exposed: false`.

### Phase 3 — Resync env examples (~30 min, requires a decision)

Decide canonical values, then update *both* the docs and the `.env.example` / `.dev.vars.example` files in lockstep:

- [ ] Decide canonical `MINDSPACE_ROOT` value (`workspaces` vs `mindspaces`).
- [ ] Add `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, populated `ADMIN_EMAILS=admin@example.com` to root `.env.example` (or remove from doc).
- [ ] Add `R2_BUCKET_NAME` and `ADMIN_EMAILS` to `packages/worker/.dev.vars.example` (or remove from doc).

### Phase 4 — Security hygiene (separate from the doc work, but discovered during audit)

- [ ] Confirm `.env` has never been committed; if any doubt, rotate Neon / OpenRouter / R2 keys.
- [ ] Decide whether the production-shaped fallbacks in `packages/app/src/server/factory.ts:650, 654` should fail closed instead of defaulting.

---

## Appendix: Verification Method

Audit was run via 4 parallel subagents, one per doc, each with the full verification checklist from the `auditing-knowledge-docs` skill (file paths via Glob, imports via Grep, schema names against `packages/platform/src/db/migrations/`, route definitions against `packages/app/src/server/factory.ts` and `packages/worker/src/index.ts`, package versions against per-package `package.json`, env vars against `.env.example` and `packages/worker/.dev.vars.example`). All "Verified Accurate" claims in each agent's report were spot-checked against actual code; only the "Issues Found" rows are aggregated above as fixable drift.
