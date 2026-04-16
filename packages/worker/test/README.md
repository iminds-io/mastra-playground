# Testing

Four layers, run independently.

## Quick reference

```bash
pnpm test:unit           # Fast, no infra. Runs on every save.
pnpm test:integration    # Real Neon branch + real @mastra/pg in Node.
pnpm test:e2e            # Spawns wrangler dev, hits it with real Firebase tokens.
pnpm test:smoke          # Hits the deployed worker at SMOKE_BASE_URL.
```

## Required environment variables

All read from the repo root `.env` (gitignored). See `.env.example` for the canonical list.

| Variable | Required for |
|----------|--------------|
| `NEON_API_KEY`, `NEON_PROJECT_ID` | integration, e2e |
| `DATABASE_URL`, `DATABASE_URL_POOLED` | integration (used as parent for branching) |
| `GOOGLE_APPLICATION_CREDENTIALS` | e2e, smoke |
| `FIREBASE_PROJECT_ID`, `FIREBASE_TOKEN` | e2e, smoke |
| `OPENROUTER_API_KEY` | integration (Mastra tests), e2e |
| `R2_*` (ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET_NAME) | e2e |
| `SMOKE_BASE_URL` | smoke |
| `SMOKE_REQUIRES_MIGRATED_DB=true` | smoke (opts into DB-writing smoke tests) |

Tests that require an unavailable var use `describe.skipIf(...)` and silently pass-through, so missing creds don't crash CI.

## How the layers isolate themselves

- **Integration** creates a Neon branch in `globalSetup`, runs migrations (into `neondb` because the parent's custom DB is owned by a different role), sets `DATABASE_URL` to it, deletes the branch in teardown.
- **E2E** does the same plus a unique R2 prefix (`e2e-runs/${uuid}/`), writes `.dev.vars.test`, spawns wrangler dev, kills it and cleans up on exit.
- **Smoke** creates Firebase test users for auth; created users are deleted in `afterAll`.

## Known blockers

### @mastra/pg + CF Workers

The `PostgresStore` from `@mastra/pg` creates its own internal `pg.Pool` which doesn't work correctly inside CF Workers (even with `nodejs_compat`). Concretely:

- The bootstrap path (only touches our Neon-HTTP-backed platform repositories) works.
- Any route that touches Mastra memory (posts, messages, streaming) hangs.

This is documented as a separate blocker. The following E2E tests are skipped until resolved:
- `happy-path.e2e.test.ts` → "worker happy path (Mastra)" describe block
- `streaming.e2e.test.ts` (entire file)

The SSE stream ordering and Mastra persistence ARE verified at the integration layer
(`platform/test/integration/stream-channel-reply.integration.test.ts`,
`platform/test/integration/execute-agent.integration.test.ts`) against real Mastra running in Node.js
— so we know the application logic is correct, and the remaining gap is purely the CF Workers + `@mastra/pg` compatibility issue.

### Production DB schema

The deployed worker's `DATABASE_URL` points to `mindcloud-test-01`, which has not yet
had platform migrations applied. As a result, smoke tests that query production tables
are gated on `SMOKE_REQUIRES_MIGRATED_DB=true`. Run migrations against production
(as the owning role `cl-admin-01`) to unblock the full smoke suite.

## Cleanup discipline

The E2E test harness treats cleanup failures as test failures. Keep an eye on
`console.neon.tech` (branches), Firebase Auth (users), and R2 (`e2e-runs/` prefix) if you're seeing
test runs pile up. All leaks eventually get garbage-collected, but loud fast feedback is better than
silent slow waste.

## Troubleshooting

- **`timed out waiting for http://127.0.0.1:.../health`** — the wrangler dev process probably crashed. Check `[wrangler]` prefixed lines above this error for the real issue.
- **`Neon createBranch failed: 401`** — `NEON_API_KEY` is wrong or expired. Regenerate at https://console.neon.tech.
- **`signInWithCustomToken failed: 400`** — `FIREBASE_TOKEN` (the web API key) is wrong, or the service account project doesn't match.
- **`OPENROUTER_API_KEY is required...`** — model-dependent integration tests skipped on CI by default. Set the env var locally to run them.
- **`permission denied for schema public`** — happens when migrating the parent's custom DB from a role that doesn't own it. Our `test-db.ts` targets the default `neondb` DB (owned by `neondb_owner`) to sidestep this.
- **`Cannot perform I/O on behalf of a different request`** — a Neon `Pool` or other CF resource is being shared across requests. The worker must create I/O objects fresh per-request.

## Adding a new E2E test

1. Create `packages/worker/test/live/<name>.e2e.test.ts`.
2. Import helpers from `../helpers/test-firebase` for auth, use `process.env.WORKER_BASE_URL` for the target.
3. Track any created Firebase users in an `afterAll` cleanup array.
4. Run `pnpm test:e2e` — the orchestrator handles everything else.
