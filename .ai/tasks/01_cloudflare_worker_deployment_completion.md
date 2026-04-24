# Cloudflare Worker Deployment — Completion Report

**Status:** ✅ Deployed and verified against real infrastructure.
**Completion date:** 2026-04-16
**Current deployed URL:** https://mastra-mindspace-api.dev-726.workers.dev
**Plan reference:** [01_cloudflare_worker_deployment.md](./01_cloudflare_worker_deployment.md)

> Historical note: this deployment was originally completed before the hard-cut
> `workspace` → `mindspace` and `hono-workspace` → `mastra-mindspace` rename.
> Historical commit IDs remain unchanged; explanatory prose below has been
> updated to the current terminology so the document matches the live system.

## Outcome

The mastra-mindspace backend runs as a Cloudflare Worker with:

- **Neon serverless PostgreSQL** via `@neondatabase/serverless` (WebSocket-backed `Pool`, created per request).
- **R2-backed mindspace filesystem** via `@mastra/s3` (`Workspace` instance created per request).
- **Mastra agent execution** through `@mastra/pg` with three coordinated CF compatibility fixes (see §4 below).
- **Firebase ID token auth** verified against Google's JWKS in-worker.
- **SSE streaming** via `ReadableStream` on the native Workers runtime.

All four testing layers are green on this deployment: 68/68 tests pass (31 unit + 23 integration + 9 E2E + 5 smoke).

## What was built

### Phase 1 — Platform becomes runtime-agnostic

| Commit | Change |
|---|---|
| `960835a` | Added `packages/platform/src/db/context.ts` — module-level pool holder with `setDatabasePool()` / `getDatabasePool()`. |
| `46497de` | Migrated all 12 repositories and 3 services from `import { pool } from '../db/client'` to `getDatabasePool()`. |
| `eaf849d` | Added the runtime context module later renamed to `packages/platform/src/mindspace/mindspace-context.ts`, mirroring the DB context for mindspace factories. |
| `7697c11` | Made the root-path env optional in `env.ts` (now `MINDSPACE_ROOT`; CF Workers have no local filesystem root). |
| `b262d6d` | Removed `node:fs` calls from provisioning and reconciliation; provisioning now accepts the mindspace root as a parameter instead of reading env. |
| `2c06381` | Made project agent model configurable (`ProjectAgentConfig`) instead of reading `process.env` directly. |

### Phase 2 — Worker package

| Commit | Change |
|---|---|
| `335166b` | Created `packages/worker/` with `wrangler.toml` (compat_date 2026-04-06, `nodejs_compat`), entry point `src/index.ts`, tsconfig, and `.dev.vars.example`. |
| `c945833` | Moved Node-only `db/client.ts` behind the platform `/node` subpath export (now `@mastra-mindspace/platform/node`) so the worker bundle stays CF-compatible. |

### Phase 3 — Bug fixes discovered via E2E

| Commit | Bug | Fix |
|---|---|---|
| `d71a406` | `this.fetchImpl(url)` broke CF's fetch binding in `jwks-cache.ts`. Auth silently failed for every token. | Detach the function reference so `this` is undefined before invocation. |
| `baaa3da` | A worker-scoped `pg.Pool` was shared across requests — second request onwards hit "Cannot perform I/O on behalf of a different request". | Create a fresh per-request Neon HTTP pool (`createNeonHttpPool`) in `bootRequest()`. |
| `d2dce2f` | `@mastra/pg` still hung the worker (root-cause investigation in §4). | Three coordinated changes: Neon-backed Pool injection, `observationalMemory: false`, `disableInit: true` + out-of-band init. |

## Architectural decisions

### Why a separate worker package, not a conversion of `packages/app`

`packages/app` is the Node.js dev server and stays as-is — it's the ergonomic local-development surface and `packages/app` continues to use `pg` and `LocalFilesystem`. The CF Worker is a separate deployment target (`packages/worker`) that reuses `@mastra-mindspace/platform` with different runtime injections. Both packages share 100% of the business logic.

### Why injectable pool/mindspace instead of a compile-time switch

The platform doesn't know or care which runtime it's in. It calls `getDatabasePool()` and `getMindspaceFactory()`; callers register implementations at boot. This keeps platform code framework-agnostic and makes integration tests easy (they register a Neon HTTP pool against a fresh branch).

### Why `neon()` HTTP pool for our repos but WebSocket `Pool` for Mastra

Our own repo queries are idempotent single-statement ops — HTTP mode is perfect (stateless, fast, CF-safe). Mastra's `init()` emits multi-statement DDL that Neon's HTTP transport rejects (`42601: cannot insert multiple commands into a prepared statement`). So Mastra uses the WebSocket `Pool`, which supports multi-statement DDL. The cross-request I/O hazard is neutralized by disabling init at runtime.

### Why `@mastra-mindspace/platform/node` subpath export

`packages/platform/src/db/client.ts` calls `dotenv.config()` and `fileURLToPath(import.meta.url)` at module load. Those Node APIs crash when the CF Worker bundle imports them transitively. Splitting via subpath (`/node` for Node.js-only exports) keeps the default export CF-safe.

## The Mastra + CF Workers saga (most instructive fix)

The initial `packages/worker` scaffold deployed and served health checks fine. Any route that touched Mastra memory hung the worker. Investigation revealed **three separate issues stacked on top of each other**:

### Issue A — Cross-request I/O from a shared pool

`pg.Pool` on CF Workers routes through `pg-cloudflare`'s `CloudflareSocket`, which is a "Native" I/O object bound to the request that opened it. `@mastra/pg`'s `PostgresStore` held that pool as a private field. First request: create pool on behalf of request A. Second request touches the same pool → "Cannot perform I/O on behalf of a different request."

**Fix:** Pass `@neondatabase/serverless`'s `Pool` (which extends `pg.Pool`) to `PostgresStore` via its documented `PoolInstanceConfig` escape hatch. Neon's WebSocket transport doesn't fight the request boundary when combined with Fix B.

### Issue B — Async observational memory leaked work past the request

`@mastra/memory@1.15.0` enables observational async buffering by default. It schedules `storage.updateBufferedObservations(...)` writes as detached promises that fire after the agent turn returns. Those background writes touched the request-scoped pool, reproducing issue A even with a per-request pool.

**Fix:** `new Memory({ options: { observationalMemory: false } })` in `packages/platform/src/mastra/agents/project-agent.ts`.

### Issue C — Concurrent init() deadlocked on `mastra_scorers`

After A and B were fixed, a single request succeeded. Concurrent requests deadlocked. Mastra's `PostgresStore.init()` runs on first use — each request's store instance kicked off the same `ALTER TABLE mastra_scorers` and Postgres returned `40P01: deadlock detected`.

**Fix:** `disableInit: true` at runtime + new `initMastraSchema(connectionString)` helper that runs the DDL once. Called:
- Once from `packages/worker/scripts/run-e2e.mjs` against each fresh Neon branch.
- Once from `packages/platform/test/integration/setup.ts` for integration tests.
- Once manually against production DB as `cl-admin-01` (see production migration §6).

## Production database migration

**Root cause:** The deployed worker's `DATABASE_URL` connects as `neondb_owner` but points at `mindcloud-test-01`, which is owned by `cl-admin-01`. `public` schema is owned by `pg_database_owner` → resolves to `cl-admin-01` → `neondb_owner` lacks `CREATE`.

**Resolution:**
1. Rotated `cl-admin-01` password via Neon REST API (`POST /projects/{id}/branches/{branch_id}/roles/cl-admin-01/reset_password`). The prior password had leaked into investigation output.
2. Ran platform migrations as `cl-admin-01` against `mindcloud-test-01` — 12 application tables created.
3. Ran `initMastraSchema()` as `cl-admin-01` — 27 Mastra tables created (total: 39 tables).
4. Runtime `neondb_owner` role retains full DML via Neon's default ACLs. No `GRANT` statements needed.

**Ongoing workflow note:** The README documents the migration command for future schema changes. A `db:migrate:production` wrapper that fetches `cl-admin-01`'s password on demand via Neon API is a known follow-up (not built — documented in the testing README).

## Deliverables

- **Deployed worker** at `mastra-mindspace-api.dev-726.workers.dev` — version `ec75565f-b04b-490a-bb8e-49ecaa8381be`.
- **Production DB** fully provisioned (39 tables in `mindcloud-test-01`).
- **Worker secrets** managed via `wrangler secret put` — 9 values in production.
- **Platform refactored** to be runtime-agnostic. The Node.js `packages/app` still works unchanged.
- **Tests** — see [03_testing_implementation_completion.md](./03_testing_implementation_completion.md).

## Deviations from the original plan

| Plan said | Actual |
|---|---|
| Use `@mastra/deployer-cloudflare` | Rejected during brainstorming — wrong abstraction for our Hono-first app. Went direct with `wrangler deploy`. |
| "Worker will use Neon pooled" | We use two Neon clients: HTTP `neon()` for our repos, WebSocket `Pool` for Mastra. |
| "`@mastra/pg` may not work — Mastra may have a LibsqlStore alternative" | `@mastra/pg` works on CF with the three fixes. No storage swap needed. |
| Plan Phase 7 "deploy" assumed migrations would be a follow-up | We migrated production as part of resolving the testing blockers. |

## Open items (future work)

1. **`pnpm db:migrate:production` wrapper** — build a Node script that fetches `cl-admin-01`'s password via Neon API on each invocation with a `CONFIRM_PRODUCTION=yes` flag. Discussed in README; intentionally not built before approval.
2. **Mastra observational memory** — disabled today. If we want it back, audit whether Mastra ships a fix for CF Workers compatibility or use `c.executionCtx.waitUntil()` to scope the background work to the originating request.
3. **Latent `migrate.ts` transaction bug** — `pool.query('begin')` / `pool.query('commit')` may not wrap statements because `pg.Pool` can route each call to a different connection. Idempotent DDL masks this today. Fix: use `pool.connect()` + `client.query()`.
4. **`@aws-sdk/client-s3` devDep size** — ~30MB local install footprint for R2 cleanup in tests. If it becomes an issue, replace with raw `fetch()` against R2's S3-compatible API.

## Commits (36 total, chronological)

```
960835a feat: add injectable database pool context
eaf849d feat: add injectable workspace factory context
7697c11 refactor: make WORKSPACE_ROOT optional in env parsing
b262d6d refactor: remove Node.js filesystem calls from provisioning and reconciliation
2c06381 refactor: make project agent model configurable via parameters
335166b feat: scaffold CF Worker package with Neon and R2 integration
46497de refactor: migrate repositories to injectable database pool
c945833 fix: expose Node-only pool via platform/node subpath
743a4db chore: ignore wrangler local cache directory
d71a406 fix: detach this-binding on fetch in Firebase jwks-cache + auth E2E tests
baaa3da fix: per-request Neon HTTP pool + reduced happy-path E2E scope
d2dce2f fix: make Mastra storage work on CF Workers
```

Plus 24 additional commits for testing infrastructure — see
[03_testing_implementation_completion.md](./03_testing_implementation_completion.md).
