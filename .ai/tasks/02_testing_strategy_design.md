# Testing Strategy Design — Cloudflare Worker Deployment

**Status:** Design approved 2026-04-16. Implementation plan to follow.

**Context:** The hono-workspace backend has been refactored for CF Workers and deployed at `https://hono-workspace-api.dev-726.workers.dev`. We need rigorous testing — unit, integration, E2E, and smoke — before treating the deployment as trustworthy. Several behaviors are code-ready but behavior-unverified on real infrastructure: `@mastra/pg` running on Workers, `@mastra/s3` against R2, Neon's WebSocket pool, SSE streaming.

## Goals

Verify the deployment works end-to-end now, and keep what's durable as an ongoing test suite. The tests must exercise the exact runtime surface a user would hit, not mocks.

## Non-goals

- Load testing. Not yet.
- Authorization testing across multiple users. Access control has unit-test coverage; E2E focuses on single-user happy path plus error responses.
- Contract tests between `packages/app` and `packages/worker`. They share `@hono-workspace/platform` — behavior parity is ensured by the platform tests.

## Test layers

Four layers, each with a specific target, isolation boundary, and CI cadence.

### 1. Unit

- **Location:** `packages/*/test/**/*.test.ts`, excluding `integration/` and `live/` subdirs.
- **Target:** In-process. No database, no network, no filesystem beyond stdio.
- **Existing state:** 20 tests passing. No changes needed.
- **Run:** `pnpm test:unit`
- **Speed:** <2 seconds.

### 2. Integration

- **Location:** `packages/platform/test/integration/*.integration.test.ts`
- **Target:** Real Postgres (Neon branch) via the platform layer — repositories, provisioning, locking, chat services with real Mastra memory. Does not go through the worker HTTP layer.
- **Existing state:** 8 tests exist but fail because the target Neon DB has no schema. Fix by migrating.
- **New coverage to add:**
  - `mastra/execute-agent.integration.test.ts` — verify `agent.generate()` actually returns text; this validates `@mastra/pg` end-to-end.
  - `chat/streamChannelReplyForPrincipal.integration.test.ts` — SSE stream yields events in the expected order.
- **Isolation:** Neon branching per test run (see Infrastructure below).
- **Parallelism:** `fileParallelism: false` — tests share one DB, must be sequential.
- **Run:** `pnpm test:integration`

### 3. E2E

- **Location:** `packages/worker/test/live/*.e2e.test.ts`
- **Target:** The worker as a black box. An orchestration script spawns `wrangler dev` on a random port and the tests fetch against `localhost:${port}`.
- **What gets tested** (the risky-to-verify flows):
  - Full happy path: `bootstrap-project` → `create channel` → `create post` → `send message` → verify model output arrives. This exercises Neon pool + `@mastra/pg` + `@mastra/s3` + OpenRouter simultaneously on Workers.
  - SSE streaming: `POST /messages/stream` yields `ack` → `token`* → `done` in order over a `ReadableStream`.
  - Unauthorized requests return 401; malformed tokens return 401.
- **Auth:** Real Firebase ID tokens, minted via Admin SDK + REST exchange (see Infrastructure).
- **Isolation:** Neon branch (reused from integration layer or fresh) + unique R2 prefix (`e2e-runs/${uuid}/`) + test users get deleted.
- **Orchestration:** `packages/worker/scripts/run-e2e.mjs` handles branch/prefix/user lifecycle and spawns wrangler — process tree cleanup on exit.
- **Run:** `pnpm test:e2e`

### 4. Smoke

- **Location:** `packages/worker/test/smoke/*.smoke.test.ts`
- **Target:** The deployed worker at `https://hono-workspace-api.dev-726.workers.dev` (configurable via `SMOKE_BASE_URL`).
- **Scenarios** (intentionally narrow):
  - `GET /health` returns 200.
  - `GET /ready` returns 200.
  - `GET /api/projects` without auth returns 401.
  - `GET /api/projects` with valid Firebase ID token returns 200.
  - `POST /api/dev/bootstrap-project` creates a real project + workspace + channel, verify shape, then clean up. This proves production DB and R2 writes work on every deploy.
- **Gating:** `describe.skipIf(!process.env.SMOKE_BASE_URL)` — safe default; tests no-op unless configured.
- **Run:** `pnpm test:smoke`

## Infrastructure

Four shared helpers live in `packages/worker/test/helpers/`. They're consumed by E2E and smoke; the integration suite uses only `test-db.ts`.

### `test-db.ts` — Neon branch management

Uses the Neon REST API (`https://console.neon.tech/api/v2/projects/${projectId}/branches`) via `fetch()`. No new dependencies.

```
createTestBranch({ parent: 'main' }): Promise<{ branchId, connectionString }>
runMigrations(connectionString): Promise<void>            // executes packages/platform/src/db/migrations/*.sql
truncateAllTables(connectionString): Promise<void>        // used between integration tests
deleteTestBranch(branchId): Promise<void>
```

Requires `NEON_API_KEY` and `NEON_PROJECT_ID` env vars. Branch name encodes a timestamp + suffix for debuggability.

### `test-firebase.ts` — Firebase test users

Uses `firebase-admin` (new devDep) with the service account at `/Users/pureicis/dev/mastra-playground/mindmap-aff6a-firebase-adminsdk-fbsvc-5dc138eabb.json` (path passed via `GOOGLE_APPLICATION_CREDENTIALS`). For ID tokens, exchanges custom tokens via the Firebase REST API.

```
createTestUser({ uid? }): Promise<{ uid, idToken }>
  // Flow:
  //   1. admin.auth().createUser({ uid })
  //   2. admin.auth().createCustomToken(uid)
  //   3. POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken
  //      with { token: customToken, returnSecureToken: true } → idToken
deleteTestUser(uid): Promise<void>
```

Requires `FIREBASE_API_KEY` (web API key, already in `.env`) for the REST exchange.

### `test-r2.ts` — R2 prefix cleanup

Uses `@aws-sdk/client-s3` (new devDep — S3Filesystem uses it internally but tests need direct access). Given a prefix, lists + deletes all objects under it.

```
cleanupPrefix(prefix): Promise<{ deletedCount }>
```

Honors the worker's existing R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`).

### `test-worker.ts` — wrangler dev lifecycle (E2E only)

Mirrors the pattern in `mind-worker-v1/scripts/run-live-smoke.mjs`:

```
spawnWorker({ envOverrides }): Promise<{ baseUrl, cleanup }>
  // Flow:
  //   1. findAvailablePort()
  //   2. Write .dev.vars.test with branch URL + test R2 prefix + existing secrets
  //   3. child_process.spawn('pnpm', ['exec', 'wrangler', 'dev', '--port', port, '--vars', ...])
  //   4. waitForServer(`http://localhost:${port}/health`, timeoutMs=60_000)
  //   5. Return { baseUrl, cleanup } — cleanup kills process tree + removes .dev.vars.test
```

## Orchestration scripts

### `packages/worker/scripts/run-e2e.mjs`

End-to-end orchestrator. Runs outside vitest so it can manage lifecycle:

```
1. Create Neon branch → connection string
2. Run migrations on branch
3. Generate unique R2 prefix (e2e-runs/${uuid}/)
4. Write .dev.vars.test with branch URL, prefix, existing secrets
5. Spawn wrangler dev on random port
6. Wait for /health to return 200
7. Spawn vitest subprocess with:
     WORKER_BASE_URL=http://localhost:${port}
     TEST_R2_PREFIX=${prefix}
     --config vitest.live.config.ts
8. On exit (normal or signal):
     - Kill wrangler process tree
     - Delete .dev.vars.test
     - Clean up R2 prefix
     - Delete Firebase test users (tests track what they create in a file)
     - Delete Neon branch
```

Cleanup is wired to `process.on('exit')` and signal handlers so Ctrl-C doesn't leak infrastructure.

## Vitest configurations

Three configs in `packages/worker/`:

- **`vitest.config.ts`** — integration tests. `include: ['test/integration/**/*.integration.test.ts']`, `fileParallelism: false`, hook timeout 30s.
- **`vitest.live.config.ts`** — E2E tests. `include: ['test/live/**/*.e2e.test.ts']`, hook timeout 60s, test timeout 30s.
- **`vitest.smoke.config.ts`** — smoke tests. `include: ['test/smoke/**/*.smoke.test.ts']`, test timeout 20s.

`packages/platform/` keeps its existing `vitest.config.ts` (unit+integration combined); we split by renaming integration files to `*.integration.test.ts` and adding a separate `vitest.integration.config.ts`.

## Package.json scripts

Root:

```json
{
  "test": "pnpm run test:unit && pnpm run test:integration",
  "test:unit": "vitest run --exclude '**/integration/**' --exclude '**/live/**' --exclude '**/smoke/**'",
  "test:integration": "pnpm --filter @hono-workspace/platform test:integration",
  "test:e2e": "pnpm --filter @hono-workspace/worker test:e2e",
  "test:smoke": "pnpm --filter @hono-workspace/worker test:smoke"
}
```

Worker:

```json
{
  "test:e2e": "node scripts/run-e2e.mjs",
  "test:smoke": "vitest run --config vitest.smoke.config.ts"
}
```

Platform:

```json
{
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

## Environment variables

Added to `.env` (gitignored):

```
# Neon branching
NEON_API_KEY=<get from Neon console>
NEON_PROJECT_ID=<the Neon project containing mindcloud-test-01>

# Firebase Admin (path to the service account JSON outside the repo)
GOOGLE_APPLICATION_CREDENTIALS=/Users/pureicis/dev/mastra-playground/mindmap-aff6a-firebase-adminsdk-fbsvc-5dc138eabb.json
FIREBASE_API_KEY=<already in .env as FIREBASE_TOKEN — reuse>

# Smoke test target (optional; off by default so unprepared runs skip)
SMOKE_BASE_URL=https://hono-workspace-api.dev-726.workers.dev
```

The E2E and integration layers read `R2_*`, `OPENROUTER_API_KEY`, and Firebase vars from the existing `.env`.

## Cleanup discipline

Aggressive — tests fail if cleanup fails. This matches the decision to keep infrastructure clean, and it prevents cost surprises (Neon branches accrue, Firebase users accumulate, R2 objects pile up).

Implementation approach:
- Every test creating a resource records it in a per-run manifest file (`/tmp/hono-workspace-e2e-${runId}.json`).
- `afterAll` hooks read the manifest and delete each resource, collecting errors.
- If any cleanup errors, the test run fails even if test assertions passed.
- `run-e2e.mjs` runs a final cleanup pass outside vitest for defense in depth.

## Deviations from iminds patterns (worth calling out)

1. **Neon branching instead of single DB + truncate.** iminds uses a single `DATABASE_URL` and truncates. We use branches for stronger isolation. Cost: a few extra seconds per run, one API token. Benefit: zero interference between concurrent local runs, clean audit trail. The integration layer still truncates between tests within a single branch, because creating a branch per test file would be too slow.

2. **Firebase Admin + REST exchange.** iminds uses `signInWithPassword` against a pre-provisioned test account. We mint users on demand via Admin SDK, which gives us better isolation (no shared test account) at the cost of a dependency on the `signInWithCustomToken` REST endpoint.

3. **No GitHub Actions config in this plan.** CI setup is a follow-up. Scripts are written to work anywhere — local, CI, Docker — using only env vars.

## Open questions the implementation plan will resolve

- Exact shape of `run-e2e.mjs` flags (e.g., `--skip-branch-creation` to reuse a branch across multiple test runs during local iteration).
- How to surface worker logs during E2E failures (pipe wrangler stdout to a file, dump last 100 lines on failure).
- Whether integration tests should run against a fresh Neon branch per invocation (strict) or reuse a stable test branch (fast local iteration). Proposed: configurable via `NEON_REUSE_BRANCH` env var, default to fresh.
