# Testing Implementation — Completion Report

**Status:** ✅ Four-layer test suite operational. 68/68 tests passing against real infrastructure.
**Completion date:** 2026-04-16
**Plan reference:** [03_testing_implementation_plan.md](./03_testing_implementation_plan.md)
**Design reference:** [02_testing_strategy_design.md](./02_testing_strategy_design.md)

## Outcome

| Layer | Files | Tests | Duration | Target |
|---|---|---|---|---|
| Unit | 14 | 31 | <1s | In-process |
| Integration | 15 | 23 | ~43s | Fresh Neon branch per run |
| E2E | 4 | 9 | ~20s | Spawned `wrangler dev` |
| Smoke | 3 | 5 | ~3s | Deployed worker (`hono-workspace-api.dev-726.workers.dev`) |
| **Total** | **36** | **68** | — | — |

Zero skips. Every test that exists actually runs.

## What was built

### Phase 0 — Preflight (commits `595bf71`, `ac90bab`, `541d2c6`)

- Renamed 14 test files from `*.test.ts` → `*.integration.test.ts` under `test/integration/` directories across `packages/platform` and `packages/app`. Unit tests under `test/unit/`, `test/db/`, `test/workspace/` keep the plain `.test.ts` suffix.
- Split vitest configs at the repo root:
  - `vitest.unit.config.ts` — excludes integration, live, smoke.
  - `vitest.integration.config.ts` — includes `**/integration/**/*.integration.test.ts` + globalSetup + `fileParallelism: false`.
- Added root scripts: `test:unit`, `test:integration`, `test:e2e`, `test:smoke`, `test:watch`.
- Documented testing env vars in `.env.example`.

### Phase 1 — Shared test helpers (commits `dc741b5`, `38230b1`, `6cc99f1`, `7a78dc6`, `4ac0c54`)

Under `packages/worker/test/helpers/`:

| File | Purpose | Tests |
|---|---|---|
| `test-db.ts` | Creates Neon branches via REST API, runs platform migrations, truncates tables, deletes branch. | 6 unit tests for pure helpers (`createTestBranchName`, `splitSqlStatements`, `rewriteDatabaseUrlHost`, `rewriteDatabaseUrlHostAndDatabase`). |
| `test-firebase.ts` | Creates Firebase test users via Admin SDK, exchanges custom tokens for ID tokens via the identitytoolkit REST API, deletes users on cleanup. | None (covered by E2E). |
| `test-r2.ts` | Lists and batch-deletes R2 objects under a given prefix via `@aws-sdk/client-s3`. | None (covered by E2E). |
| `live-smoke-utils.ts` | `findAvailablePort()` + `waitForServer()` utilities adapted from the iminds reference. | 4 unit tests. |
| `test-worker.ts` | `spawnWorker()` — launches `wrangler dev` on a free port with a scoped `.dev.vars.test`, returns base URL + cleanup handle. | None (covered by E2E). |

Added devDependencies to `packages/worker`: `firebase-admin`, `@aws-sdk/client-s3`, `dotenv`, `tsx`, `vitest`.

### Phase 2 — Integration layer (commits `ef1da3f`, `740b2f1`, `a16f187`, `98041d1`, `3540d9d`)

- Created `packages/platform/test/integration/setup.ts` — vitest globalSetup that creates a Neon branch, runs platform migrations, runs `initMastraSchema()`, sets `process.env.DATABASE_URL`, and deletes the branch on teardown.
- Created `packages/platform/test/integration/setup-env.ts` — setupFiles entry that loads `.env` in each vitest worker (globalSetup doesn't propagate env vars to workers).
- Fixed `test-db.ts` for Neon v2 API — the branch create response no longer returns `connection_uris`; we rewrite the parent DATABASE_URL's host to the new endpoint's pooled host. Also targets the default `neondb` database (owned by `neondb_owner`) to sidestep permission issues with the custom DB.
- Added 2 new integration tests:
  - `execute-agent.integration.test.ts::with real Mastra PG` — bypasses the pre-existing mock, runs `createMastra()` against the Neon branch, calls OpenRouter, asserts that Mastra's tables populate.
  - `stream-channel-reply.integration.test.ts` — iterates the SSE async generator and asserts `ack → token(s) → done` ordering.
- After the Mastra+CF fix (commit `d2dce2f`), updated globalSetup to also run `initMastraSchema()` so integration tests have both schemas on their branch.

### Phase 3 — E2E layer (commits `fae29e6`, `b7fe8e4`, `d71a406`, `baaa3da`, `6dcf778`)

- Created `packages/worker/vitest.live.config.ts` and `vitest.smoke.config.ts` with separate include globs and timeouts.
- Created `packages/worker/scripts/run-e2e.mjs` — orchestrator that:
  1. Creates a Neon branch + runs migrations + runs `initMastraSchema()`.
  2. Generates a unique R2 prefix (`e2e-runs/${uuid}/`).
  3. Writes a scoped `.dev.vars.test` with the branch URL, test R2 prefix, and `.env` secrets.
  4. Spawns `wrangler dev` on a free port with `--env-file .dev.vars.test`.
  5. Polls `/health` until the worker is ready.
  6. Spawns vitest with `WORKER_BASE_URL` and `TEST_R2_PREFIX` set.
  7. Cleans up: kills wrangler process tree, removes `.dev.vars.test`, purges R2 prefix, deletes Neon branch. Cleanup failures mark the run as failed.
- Four E2E test files under `packages/worker/test/live/`:
  - `health.e2e.test.ts` — `/health`, `/ready` (2 tests).
  - `auth.e2e.test.ts` — rejects no-auth / malformed / invalid tokens, accepts a real Firebase ID token (4 tests).
  - `happy-path.e2e.test.ts` — bootstrap + list channels + create channel (non-Mastra) + bootstrap + post + agent.generate (Mastra) (2 tests).
  - `streaming.e2e.test.ts` — SSE event ordering (1 test).

### Phase 4 — Smoke layer (commits `8eb04d1`)

- Three smoke test files under `packages/worker/test/smoke/`:
  - `health.smoke.test.ts` — public endpoints (2 tests).
  - `auth.smoke.test.ts` — unauthed 401 + authed 200 (2 tests).
  - `bootstrap.smoke.test.ts` — writes a real project to production DB (1 test).
- `SMOKE_REQUIRES_MIGRATED_DB=true` gate controls whether smoke tests that write to production DB run. Set in `.env` after production DB migration.
- `vitest.smoke.config.ts` loads `.env` via `setupFiles: ['test/smoke/setup-env.ts']`.

### Phase 5 — Documentation (commits `c814e03`, `58be2cf`)

- `packages/worker/test/README.md` — layer overview, env var matrix, isolation strategy, Mastra+CF fix summary, production migration playbook, troubleshooting guide.

## Bugs found during testing (all are fixed in the code under test, not the test harness)

### 1. `this`-binding broken on fetch in Firebase JWKS cache (commit `d71a406`)

`GoogleSecureTokenKeyStore.getCertificates()` called `this.fetchImpl(GOOGLE_SECURE_TOKEN_CERTS_URL)`. On CF Workers, the global `fetch` throws "Illegal invocation" if called as a method. Auth silently failed for every request with a real token because the middleware swallowed the error.

**Fix:** Detach the reference (`const doFetch = this.fetchImpl; await doFetch(url)`) and log the error explicitly instead of swallowing.

Found by: `auth.e2e.test.ts` when it sent a real Firebase token and got 401.

### 2. `pg.Pool` shared across CF requests (commit `baaa3da`)

The initial worker boot function cached a Neon WebSocket `Pool` at worker scope. Second request onwards: "Cannot perform I/O on behalf of a different request."

**Fix:** Switched the worker's own repository queries to a per-request HTTP-backed Neon adapter (`createNeonHttpPool`). Mastra's pool is also per-request but uses WebSocket mode (needed for DDL and transactions — see fix #3).

Found by: `happy-path.e2e.test.ts` when it made two sequential requests to `/api/projects/.../channels`.

### 3. `@mastra/pg` stacking of three bugs (commit `d2dce2f`)

See [01_cloudflare_worker_deployment_completion.md §4](./01_cloudflare_worker_deployment_completion.md#the-mastra--cf-workers-saga-most-instructive-fix) for the detailed root-cause chain. Short version:

- `pg.Pool`'s CF socket can't cross requests → inject `@neondatabase/serverless` Pool.
- Mastra Memory schedules async writes past the request → `observationalMemory: false`.
- Concurrent `PostgresStore.init()` deadlocks on `ALTER TABLE mastra_scorers` → `disableInit: true` + new `initMastraSchema()` helper called out-of-band.

Found by: `happy-path.e2e.test.ts::worker happy path (Mastra)` test timing out.

## Infrastructure patterns worth preserving

### Neon branching via REST API

The `packages/worker/test/helpers/test-db.ts` helper hits the Neon v2 API directly via `fetch()` — no new dependencies, clean cleanup. Per-test-run branches give stronger isolation than a shared test DB with truncation.

**Gotcha** discovered during implementation: Neon v2 no longer returns `connection_uris` in the branch-create response. The helper extracts the endpoint host and rewrites the parent `DATABASE_URL` host to the new branch's pooled endpoint. Database is set to the default `neondb` because `neondb_owner` doesn't own `mindcloud-test-01`.

### Firebase custom-token → ID-token exchange

`packages/worker/test/helpers/test-firebase.ts` uses `firebase-admin` (`createUser()` + `createCustomToken()`) then calls Firebase's `accounts:signInWithCustomToken` REST endpoint to exchange the custom token for a real ID token. The worker verifies this token via its normal JWKS flow — no test-only code paths in production.

### Orchestrator pattern for E2E

`packages/worker/scripts/run-e2e.mjs` adapts the iminds `run-live-smoke.mjs` pattern for our Mastra stack. It's a plain `.mjs` script run via `node --import tsx` (so it can import the `.ts` helpers). It sets up everything, runs vitest as a subprocess with the right env, then cleans up whether vitest passes or fails.

### Graceful skip via `describe.skipIf`

Tests that require optional credentials (`OPENROUTER_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `SMOKE_BASE_URL`) check the env and silently skip. CI can run partial suites without crashing.

## Deviations from the original plan

| Plan said | Actual |
|---|---|
| "Use `wrangler dev --var-file`" | Flag is actually `--env-file`. Also pnpm intercepts `--env-file` unless you use `pnpm exec -- wrangler ...`. Also wrangler rejects absolute paths — must pass a relative filename. |
| "15–20 tasks" | 21 tasks in the plan; completed with some merging (e.g., Tasks 1.3+1.4 done together). |
| "Bundle size: 30MB devDep concern" | `@aws-sdk/client-s3` ended up being fine. Deployed bundle is still 12.8 MiB (3.1 MiB gzip). |
| "Plan's happy-path E2E was initially full Mastra flow" | Temporarily reduced to non-Mastra scope while the hang was being investigated. Expanded back to full Mastra flow once fixes landed. |
| "Plan described `waitUntil` as Fix 3 for the worker" | Not needed once `observationalMemory: false` + `disableInit: true` are applied — there's no background work to wait on. |

## Open items / known caveats

1. **Mastra production schema drift** — `initMastraSchema()` must be re-run against production after any `@mastra/pg` version bump, because the schema is now managed out-of-band. The README documents the command; a production migration wrapper is a future task.
2. **Integration test latency** — each integration run provisions a Neon branch (~5-15s). Across CI, this is fine. For local iteration, consider a `NEON_REUSE_BRANCH` env flag as noted in the design doc.
3. **Firebase test user cleanup** — `afterAll` deletes users, but test crashes between `createTestUser` and `afterAll` can leak. Users follow the naming pattern `test-<uuid>@test.hono-workspace.local` for a weekly GC script.
4. **Smoke-created production projects accumulate** — `bootstrap.smoke.test.ts` deletes the Firebase user but there's no DELETE endpoint for projects. A cleanup script matching Firebase UIDs under `users.firebase_uid LIKE 'test-%'` would reclaim these.
5. **Latent `migrate.ts` transaction bug** — documented in the deployment completion doc.

## Commits (25 related to testing, chronological)

```
cfaf1f7 docs: add testing strategy design for CF Worker deployment
efa4636 docs: relocate task docs under .ai/tasks with numeric prefix
bea9013 docs: add testing implementation plan
595bf71 chore: rename integration tests with .integration.test.ts suffix
ac90bab chore: split unit and integration vitest configs
541d2c6 chore: document testing env vars in .env.example
dc741b5 chore: add test devDependencies to worker package
38230b1 feat: add Neon branch test helper
6cc99f1 feat: add Firebase test user helper
7a78dc6 feat: add R2 prefix cleanup helper
4ac0c54 feat: add wrangler dev lifecycle helper for E2E tests
ef1da3f feat: wire Neon branch globalSetup into integration config
740b2f1 fix: adapt test-db helper to Neon v2 API and integration env loading
a16f187 test: verify Mastra PG storage end-to-end against Neon
98041d1 test: verify SSE stream event ordering against real Mastra
8e04f41 chore: add @neondatabase/serverless as platform devDependency
fae29e6 feat: add E2E and smoke vitest configs for worker package
b7fe8e4 feat: add E2E orchestrator script with branch/R2/worker lifecycle
6dcf778 test: placeholder SSE E2E test pending @mastra/pg CF Workers fix
8eb04d1 test: smoke tests for deployed worker (health, auth, bootstrap)
c814e03 docs: testing README with layer overview, blockers, and troubleshooting
001ae3b test: all four testing layers verified end-to-end
3540d9d test: init Mastra schema in integration globalSetup
58be2cf docs: update testing README — Mastra+CF blocker resolved, prod migration workflow
```

Plus 3 bug-fix commits co-owned with the deployment work (`d71a406`, `baaa3da`, `d2dce2f`).
