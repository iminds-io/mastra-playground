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
| `DATABASE_URL` | integration (used as parent for branching) |
| `GOOGLE_APPLICATION_CREDENTIALS` | e2e, smoke |
| `FIREBASE_PROJECT_ID`, `FIREBASE_TOKEN` | e2e, smoke |
| `OPENROUTER_API_KEY` | integration (Mastra tests), e2e |
| `R2_*` (ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET_NAME) | e2e |
| `SMOKE_BASE_URL` | smoke |
| `SMOKE_REQUIRES_MIGRATED_DB=true` | smoke (opt in to DB-writing smoke tests) |

Tests that require an unavailable var use `describe.skipIf(...)` and silently skip, so missing creds don't crash CI.

## How the layers isolate themselves

- **Integration** creates a Neon branch in `globalSetup`, runs platform migrations, runs Mastra's DDL via `initMastraSchema()`, sets `DATABASE_URL` to the branch, deletes the branch in teardown.
- **E2E** does the same plus a unique R2 prefix (`e2e-runs/${uuid}/`), writes `.dev.vars.test`, spawns wrangler dev, kills it and cleans up on exit.
- **Smoke** creates Firebase test users for auth; created users are deleted in `afterAll`. Smoke writes persist in the deployed worker's DB — see bootstrap.smoke.test.ts note.

## Cleanup discipline

Cleanup failures fail the test run. Keep an eye on `console.neon.tech` (branches), Firebase Auth (users), and R2 (`e2e-runs/` prefix) for leaks.

## Mastra on Cloudflare Workers

Using `@mastra/pg` on CF Workers required three coordinated fixes (see commit `d2dce2f`):

1. **Pool injection**: use `@neondatabase/serverless`'s `Pool` (extends `pg.Pool`) instead of letting `PostgresStore` construct its own. pg's CF transport creates a `CloudflareSocket` that cannot cross request boundaries.
2. **`observationalMemory: false`**: Mastra Memory's default observational async buffering schedules writes past the request lifetime. On CF Workers, those late writes touch the shared pool and cause "Cannot perform I/O on behalf of a different request" errors.
3. **`disableInit: true` + out-of-band init**: `PostgresStore.init()` runs DDL including `ALTER TABLE`. Two concurrent requests would race and deadlock on `mastra_scorers`. We disable init at runtime and call `initMastraSchema()` once via the E2E orchestrator (and once in the production migration workflow).

## Production migration

The deployed worker's DATABASE_URL targets `mindcloud-test-01` (owned by `cl-admin-01`), while the runtime connects as `neondb_owner`. To apply schema updates:

```bash
# 1. Rotate cl-admin-01 via the Neon REST API and capture the returned password
node - <<'NODE'
const fs = require('fs');
const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    }),
);

const branchId = 'br-jolly-meadow-an0q0lyo'; // production
const response = await fetch(
  `https://console.neon.tech/api/v2/projects/${env.NEON_PROJECT_ID}/branches/${branchId}/roles/cl-admin-01/reset_password`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.NEON_API_KEY}` },
  },
);

if (!response.ok) {
  throw new Error(await response.text());
}

const data = await response.json();
console.log(data.role.password);
NODE

# 2. Run platform migrations
DATABASE_URL='postgresql://cl-admin-01:<pw>@<host>/mindcloud-test-01?sslmode=require&channel_binding=require' \
  pnpm --filter @mastra-mindspace/platform db:migrate

# 3. Init Mastra schema (one-time; disableInit: true prevents runtime init)
DATABASE_URL='postgresql://cl-admin-01:<pw>@<host>/mindcloud-test-01?sslmode=require&channel_binding=require' \
  pnpm --filter @mastra-mindspace/platform exec node --import tsx -e "
  import { initMastraSchema } from './src/index.ts';
  await initMastraSchema(process.env.DATABASE_URL);
  "
```

## Troubleshooting

- **`timed out waiting for http://127.0.0.1:.../health`** — the wrangler dev process probably crashed. Check `[wrangler]` prefixed lines above this error for the real issue.
- **`Neon createBranch failed: 401`** — `NEON_API_KEY` is wrong or expired. Regenerate at https://console.neon.tech.
- **`signInWithCustomToken failed: 400`** — `FIREBASE_TOKEN` (the web API key) is wrong, or the service account project doesn't match.
- **`OPENROUTER_API_KEY is required...`** — model-dependent integration tests skipped on CI by default. Set the env var locally to run them.
- **`permission denied for schema public`** — happens when migrating the parent's custom DB from a role that doesn't own it. Our `test-db.ts` targets the default `neondb` DB (owned by `neondb_owner`) to sidestep this. For production migrations, run as `cl-admin-01`.
- **`deadlock detected` during Mastra DDL** — two concurrent requests triggered `PostgresStore.init()`. Ensure `disableInit: true` and run `initMastraSchema()` once out-of-band.
- **`cannot perform I/O on behalf of a different request`** — a pool or WebSocket is being shared across CF requests. Create I/O objects fresh per-request.

## Adding a new E2E test

1. Create `packages/worker/test/live/<name>.e2e.test.ts`.
2. Import helpers from `../helpers/test-firebase` for auth, use `process.env.WORKER_BASE_URL` for the target.
3. Track any created Firebase users in an `afterAll` cleanup array.
4. Run `pnpm test:e2e` — the orchestrator handles everything else.
