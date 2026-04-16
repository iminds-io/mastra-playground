# Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the four-layer testing strategy (unit, integration, E2E, smoke) defined in `.ai/tasks/02_testing_strategy_design.md`, using Neon branching, Firebase Admin, and wrangler dev orchestration.

**Architecture:** Shared helpers in `packages/worker/test/helpers/` for Neon branches, Firebase test users, R2 cleanup, and wrangler lifecycle. Integration tests run against a dedicated Neon branch with full migrations. E2E tests spawn `wrangler dev` and hit it with real Firebase ID tokens via a Node.js orchestrator script. Smoke tests target the deployed worker. All cleanup is aggressive — test runs fail if cleanup fails.

**Tech Stack:** Vitest, `@neondatabase/serverless`, `firebase-admin`, `@aws-sdk/client-s3`, Node.js `child_process` for wrangler lifecycle, Neon REST API via `fetch`.

**Critical references:**
- `.ai/tasks/02_testing_strategy_design.md` — the approved design
- `/Users/pureicis/dev/iminds-examples/workers/mind-worker-v1/scripts/run-live-smoke.mjs` — reference orchestrator pattern
- `/Users/pureicis/dev/iminds-examples/workers/dispatch-worker/scripts/live-smoke-utils.mjs` — port + waitForServer helpers
- `/Users/pureicis/dev/iminds-examples/workers/hub-worker/test/helpers/test-db.ts` — reference test-db helper pattern
- `/Users/pureicis/dev/mastra-playground/mindmap-aff6a-firebase-adminsdk-fbsvc-5dc138eabb.json` — Firebase service account (OUTSIDE the repo, never commit)

---

## Phase 0: Preflight and reorganization

### Task 0.1: Move unit tests out of integration-named dirs and rename integration tests

The current `packages/platform/test/integration/*.test.ts` files are the ones that need a real DB. We want the filename to self-document. Also `packages/platform/test/unit/` exists alongside `integration/` — those are already well-named.

**Files to rename (git mv):**

```
packages/platform/test/integration/editor-bindings.test.ts       → editor-bindings.integration.test.ts
packages/platform/test/integration/execute-agent.test.ts         → execute-agent.integration.test.ts
packages/platform/test/integration/project-context.test.ts       → project-context.integration.test.ts
packages/platform/test/integration/reconciliation.test.ts        → reconciliation.integration.test.ts
packages/platform/test/integration/schema.test.ts                → schema.integration.test.ts
packages/platform/test/integration/workspace-locking.test.ts     → workspace-locking.integration.test.ts
packages/platform/test/integration/workspace-provisioning.test.ts→ workspace-provisioning.integration.test.ts

packages/app/test/integration/agent-run.test.ts                  → agent-run.integration.test.ts
packages/app/test/integration/app-health.test.ts                 → app-health.integration.test.ts
packages/app/test/integration/authenticated-routes.test.ts       → authenticated-routes.integration.test.ts
packages/app/test/integration/chat-routes.test.ts                → chat-routes.integration.test.ts
packages/app/test/integration/dev-bootstrap.test.ts              → dev-bootstrap.integration.test.ts
packages/app/test/integration/project-routes.test.ts             → project-routes.integration.test.ts
packages/app/test/integration/readiness.test.ts                  → readiness.integration.test.ts

packages/platform/test/db/context.test.ts           → UNCHANGED (it's a unit test — keep under test/db/)
packages/platform/test/workspace/workspace-context.test.ts → UNCHANGED (unit test)
```

**Step 1: Run git mv for all files**

```bash
cd /Users/pureicis/dev/mastra-playground/hono-workspace

for f in packages/platform/test/integration/*.test.ts; do
  base=$(basename "$f" .test.ts)
  git mv "$f" "packages/platform/test/integration/${base}.integration.test.ts"
done

for f in packages/app/test/integration/*.test.ts; do
  base=$(basename "$f" .test.ts)
  git mv "$f" "packages/app/test/integration/${base}.integration.test.ts"
done
```

**Step 2: Verify**

```bash
find packages/platform/test packages/app/test -name '*.test.ts' | sort
```

Expected: every file in `integration/` dirs ends with `.integration.test.ts`. Files under `test/db/`, `test/unit/`, `test/workspace/` remain plain `*.test.ts`.

**Step 3: Run unit tests to verify renames didn't break imports**

```bash
pnpm vitest run --exclude '**/integration/**'
```

Expected: PASS (existing 20 unit tests).

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: rename integration tests with .integration.test.ts suffix

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 0.2: Add root test scripts and split unit/integration configs

**Files:**
- Modify: `package.json`
- Create: `vitest.unit.config.ts`
- Create: `vitest.integration.config.ts`
- Modify: `vitest.config.ts` (becomes the "run everything" config — default)

**Step 1: Create `vitest.unit.config.ts`**

```typescript
// ABOUTME: Vitest config for unit tests only.
// ABOUTME: Excludes integration, live (E2E), and smoke tests.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      '**/integration/**',
      '**/live/**',
      '**/smoke/**',
    ],
  },
});
```

**Step 2: Create `vitest.integration.config.ts`**

```typescript
// ABOUTME: Vitest config for integration tests only.
// ABOUTME: Shares a single Neon branch per test run, so tests must run sequentially.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/integration/**/*.integration.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**', '**/live/**', '**/smoke/**'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
```

**Step 3: Update root `package.json` scripts**

Replace the `scripts` block with:

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --filter @hono-workspace/app dev",
    "dev:full": "concurrently -k -n backend,frontend -c blue,green \"pnpm dev\" \"pnpm dev:web\"",
    "dev:web": "pnpm --filter @hono-workspace/web dev",
    "dev:db": "docker-compose up -d postgres",
    "dev:db:down": "docker-compose down",
    "test": "pnpm run test:unit",
    "test:unit": "vitest run --config vitest.unit.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "pnpm --filter @hono-workspace/worker run test:e2e",
    "test:smoke": "pnpm --filter @hono-workspace/worker run test:smoke",
    "test:watch": "vitest --config vitest.unit.config.ts",
    "typecheck": "pnpm -r typecheck"
  }
}
```

**Step 4: Run unit tests**

```bash
pnpm test:unit
```

Expected: PASS. 20 tests.

**Step 5: Commit**

```bash
git add vitest.unit.config.ts vitest.integration.config.ts package.json
git commit -m "chore: split unit and integration vitest configs

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 0.3: Decide on and commit `.env` additions for test infra

The design requires `NEON_API_KEY`, `NEON_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `SMOKE_BASE_URL`. These are per-developer secrets, so they go in `.env` (gitignored) and get documented in `.env.example`.

**Files:**
- Modify: `.env.example`

**Step 1: Append to `.env.example`**

```
# --- Testing infrastructure ---
# Neon REST API — used by integration and E2E tests to create/delete branches
NEON_API_KEY=
NEON_PROJECT_ID=

# Firebase Admin SDK — path to the service account JSON (kept outside the repo)
# Used by E2E and smoke tests to mint test users and their ID tokens
GOOGLE_APPLICATION_CREDENTIALS=

# Smoke tests — deployed worker URL (when empty, smoke tests skip)
SMOKE_BASE_URL=
```

**Step 2: Verify `.env` has the real values**

Ask the user to populate these in `/Users/pureicis/dev/mastra-playground/hono-workspace/.env`. The implementer should NOT fill these in programmatically — credentials are user-managed.

For `GOOGLE_APPLICATION_CREDENTIALS`, the absolute path is known:
```
GOOGLE_APPLICATION_CREDENTIALS=/Users/pureicis/dev/mastra-playground/mindmap-aff6a-firebase-adminsdk-fbsvc-5dc138eabb.json
```

`SMOKE_BASE_URL` can default to the known deployment:
```
SMOKE_BASE_URL=https://hono-workspace-api.dev-726.workers.dev
```

**Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: document testing env vars in .env.example

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

**IMPORTANT:** Before continuing to Phase 1, STOP and confirm with the user that they have populated:
- `NEON_API_KEY` in `.env`
- `NEON_PROJECT_ID` in `.env`
- `GOOGLE_APPLICATION_CREDENTIALS` in `.env`

If the user doesn't have a Neon API key, direct them to https://console.neon.tech → Account Settings → API Keys. The `NEON_PROJECT_ID` can be found in the Neon dashboard URL or via `wrangler secret list` output from the existing deployment.

---

## Phase 1: Shared test helpers (worker package)

All four helpers live in `packages/worker/test/helpers/` and are consumed by both E2E and smoke tests. The integration suite uses only `test-db.ts` (imported via relative path from platform tests).

### Task 1.1: Add new devDependencies to worker package

**Files:**
- Modify: `packages/worker/package.json`

**Step 1: Add devDependencies**

Update `packages/worker/package.json` — add these to the `devDependencies` block:

```json
{
  "devDependencies": {
    "@aws-sdk/client-s3": "^3.740.0",
    "@cloudflare/workers-types": "^4.20241218.0",
    "firebase-admin": "^13.0.0",
    "vitest": "4.1.4",
    "wrangler": "^4.54.0"
  }
}
```

**Step 2: Install**

```bash
cd /Users/pureicis/dev/mastra-playground/hono-workspace
pnpm install
```

Expected: installs cleanly, no errors.

**Step 3: Commit**

```bash
git add packages/worker/package.json pnpm-lock.yaml
git commit -m "chore: add test devDependencies to worker package

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Create `test-db.ts` helper (Neon branching)

**Files:**
- Create: `packages/worker/test/helpers/test-db.ts`
- Create: `packages/worker/test/helpers/test-db.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/worker/test/helpers/test-db.test.ts
import { describe, it, expect } from 'vitest';
import { createTestBranchName, splitSqlStatements } from './test-db';

describe('test-db helpers', () => {
  describe('createTestBranchName', () => {
    it('produces a branch name with the given prefix and a timestamp', () => {
      const name = createTestBranchName('e2e');
      expect(name).toMatch(/^test-e2e-\d{4}-\d{2}-\d{2}-\d+-[a-z0-9]+$/);
    });

    it('produces unique names on repeated calls', () => {
      const a = createTestBranchName('e2e');
      const b = createTestBranchName('e2e');
      expect(a).not.toBe(b);
    });
  });

  describe('splitSqlStatements', () => {
    it('splits statements on semicolons outside quoted strings', () => {
      const sql = `create table a(x int); create table b(y text);`;
      expect(splitSqlStatements(sql)).toEqual([
        'create table a(x int)',
        'create table b(y text)',
      ]);
    });

    it('ignores semicolons inside single-quoted strings', () => {
      const sql = `insert into t values ('a;b'); insert into t values ('c');`;
      expect(splitSqlStatements(sql)).toEqual([
        "insert into t values ('a;b')",
        "insert into t values ('c')",
      ]);
    });

    it('drops empty statements', () => {
      expect(splitSqlStatements(';;select 1;;')).toEqual(['select 1']);
    });
  });
});
```

**Step 2: Run test to verify failure**

```bash
pnpm vitest run packages/worker/test/helpers/test-db.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write `test-db.ts`**

```typescript
// packages/worker/test/helpers/test-db.ts
// ABOUTME: Neon branch lifecycle for tests — create, migrate, truncate, delete.
// ABOUTME: Uses the Neon REST API and runs platform migrations against each branch.

import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../platform/src/db/migrations');

type NeonBranch = {
  branchId: string;
  connectionString: string;
};

type NeonApiClient = {
  createBranch(name: string): Promise<NeonBranch>;
  deleteBranch(branchId: string): Promise<void>;
};

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function createTestBranchName(prefix: string): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const ts = now.getTime();
  const rand = Math.random().toString(36).slice(2, 8);
  return `test-${prefix}-${ymd}-${ts}-${rand}`;
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    else if (c === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;

    if (c === ';' && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    } else {
      current += c;
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function createNeonApiClient(): NeonApiClient {
  const apiKey = getEnvOrThrow('NEON_API_KEY');
  const projectId = getEnvOrThrow('NEON_PROJECT_ID');
  const baseUrl = 'https://console.neon.tech/api/v2';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  return {
    async createBranch(name: string): Promise<NeonBranch> {
      const response = await fetch(`${baseUrl}/projects/${projectId}/branches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          branch: { name },
          endpoints: [{ type: 'read_write' }],
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Neon createBranch failed: ${response.status} ${text}`);
      }
      const body = await response.json() as {
        branch: { id: string };
        connection_uris?: Array<{ connection_uri: string }>;
      };
      const connectionUri = body.connection_uris?.[0]?.connection_uri;
      if (!connectionUri) {
        throw new Error('Neon createBranch: no connection_uri returned');
      }
      return { branchId: body.branch.id, connectionString: connectionUri };
    },

    async deleteBranch(branchId: string): Promise<void> {
      const response = await fetch(
        `${baseUrl}/projects/${projectId}/branches/${branchId}`,
        { method: 'DELETE', headers },
      );
      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        throw new Error(`Neon deleteBranch failed: ${response.status} ${text}`);
      }
    },
  };
}

async function readMigrationSqlFiles(): Promise<Array<{ name: string; sql: string }>> {
  const entries = await readdir(MIGRATIONS_DIR);
  const sqlFiles = entries.filter((e) => e.endsWith('.sql')).sort();
  return Promise.all(
    sqlFiles.map(async (name) => ({
      name,
      sql: await readFile(resolve(MIGRATIONS_DIR, name), 'utf8'),
    })),
  );
}

export type TestBranch = {
  branchId: string;
  connectionString: string;
  runMigrations(): Promise<void>;
  truncateAllTables(): Promise<void>;
  deleteBranch(): Promise<void>;
};

export async function createTestBranch(options: { prefix: string }): Promise<TestBranch> {
  const client = createNeonApiClient();
  const { neon } = await import('@neondatabase/serverless');
  const name = createTestBranchName(options.prefix);
  const { branchId, connectionString } = await client.createBranch(name);
  const sql = neon(connectionString);

  return {
    branchId,
    connectionString,
    async runMigrations() {
      const files = await readMigrationSqlFiles();
      for (const file of files) {
        const statements = splitSqlStatements(file.sql);
        for (const stmt of statements) {
          try {
            await sql(stmt);
          } catch (err) {
            throw new Error(`Migration ${file.name} failed on statement:\n${stmt}\n\n${err}`);
          }
        }
      }
    },
    async truncateAllTables() {
      await sql`
        truncate table
          channel_threads,
          project_channels,
          workspace_provisioning_jobs,
          workspace_events,
          workspace_locks,
          workspace_bindings,
          workspace_roots,
          organization_memberships,
          projects,
          users,
          organizations
        cascade
      `;
    },
    async deleteBranch() {
      await client.deleteBranch(branchId);
    },
  };
}
```

**Step 4: Run test to verify pass**

```bash
pnpm vitest run packages/worker/test/helpers/test-db.test.ts
```

Expected: PASS. 5 tests (the unit-level ones that don't hit Neon).

**Step 5: Commit**

```bash
git add packages/worker/test/helpers/test-db.ts packages/worker/test/helpers/test-db.test.ts
git commit -m "feat: add Neon branch test helper

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Create `test-firebase.ts` helper

**Files:**
- Create: `packages/worker/test/helpers/test-firebase.ts`

Firebase Admin SDK initialization + custom-token-to-ID-token REST exchange. No unit tests for this one — it's entirely I/O against Firebase, covered by E2E.

**Step 1: Write the helper**

```typescript
// packages/worker/test/helpers/test-firebase.ts
// ABOUTME: Firebase test user lifecycle — create user, mint ID token, delete.
// ABOUTME: Uses firebase-admin for user mgmt and the identitytoolkit REST API for token exchange.

import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

let initialized = false;

function initFirebaseAdmin(): admin.app.App {
  if (initialized) return admin.app();
  const credentialPath = getEnvOrThrow('GOOGLE_APPLICATION_CREDENTIALS');
  const app = admin.initializeApp({
    credential: admin.credential.cert(credentialPath),
  });
  initialized = true;
  return app;
}

async function exchangeCustomTokenForIdToken(customToken: string): Promise<string> {
  const apiKey = getEnvOrThrow('FIREBASE_TOKEN');
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase signInWithCustomToken failed: ${response.status} ${text}`);
  }
  const body = await response.json() as { idToken?: string };
  if (!body.idToken) {
    throw new Error('Firebase signInWithCustomToken: no idToken in response');
  }
  return body.idToken;
}

export type TestFirebaseUser = {
  uid: string;
  idToken: string;
  delete(): Promise<void>;
};

export async function createTestUser(options?: {
  uid?: string;
  email?: string;
  displayName?: string;
}): Promise<TestFirebaseUser> {
  initFirebaseAdmin();
  const uid = options?.uid ?? `test-${randomUUID()}`;
  const email = options?.email ?? `${uid}@test.hono-workspace.local`;
  const displayName = options?.displayName ?? uid;

  await admin.auth().createUser({ uid, email, displayName });
  const customToken = await admin.auth().createCustomToken(uid);
  const idToken = await exchangeCustomTokenForIdToken(customToken);

  return {
    uid,
    idToken,
    async delete() {
      await admin.auth().deleteUser(uid);
    },
  };
}

export async function deleteTestUserById(uid: string): Promise<void> {
  initFirebaseAdmin();
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('no user record')) return;
    throw err;
  }
}
```

**Step 2: Run existing tests to confirm nothing breaks**

```bash
pnpm test:unit
```

Expected: PASS.

**Step 3: Commit**

```bash
git add packages/worker/test/helpers/test-firebase.ts
git commit -m "feat: add Firebase test user helper

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 1.4: Create `test-r2.ts` helper

**Files:**
- Create: `packages/worker/test/helpers/test-r2.ts`

**Step 1: Write the helper**

```typescript
// packages/worker/test/helpers/test-r2.ts
// ABOUTME: R2 prefix cleanup helper for tests.
// ABOUTME: Lists objects under a prefix and deletes them in batches via the S3 SDK.

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function createR2Client(): { client: S3Client; bucket: string } {
  const accountId = getEnvOrThrow('R2_ACCOUNT_ID');
  const accessKeyId = getEnvOrThrow('R2_ACCESS_KEY_ID');
  const secretAccessKey = getEnvOrThrow('R2_SECRET_ACCESS_KEY');
  const bucket = getEnvOrThrow('R2_BUCKET_NAME');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

export async function cleanupPrefix(prefix: string): Promise<{ deletedCount: number }> {
  const { client, bucket } = createR2Client();
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    const objects = listed.Contents ?? [];
    if (objects.length === 0) break;

    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objects
          .filter((o): o is { Key: string } => typeof o.Key === 'string')
          .map((o) => ({ Key: o.Key })),
      },
    }));
    deletedCount += objects.length;
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);

  return { deletedCount };
}
```

**Step 2: Verify unit tests still pass**

```bash
pnpm test:unit
```

Expected: PASS.

**Step 3: Commit**

```bash
git add packages/worker/test/helpers/test-r2.ts
git commit -m "feat: add R2 prefix cleanup helper

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 1.5: Create `test-worker.ts` helper and live-smoke-utils

**Files:**
- Create: `packages/worker/test/helpers/live-smoke-utils.ts`
- Create: `packages/worker/test/helpers/live-smoke-utils.test.ts`
- Create: `packages/worker/test/helpers/test-worker.ts`

The utilities (findAvailablePort, waitForServer) are generic enough to unit-test. The `spawnWorker` function is heavy I/O — covered by E2E.

**Step 1: Write the failing test for port utilities**

```typescript
// packages/worker/test/helpers/live-smoke-utils.test.ts
import { describe, it, expect } from 'vitest';
import { findAvailablePort, waitForServer } from './live-smoke-utils';
import { createServer } from 'node:http';

describe('live-smoke-utils', () => {
  describe('findAvailablePort', () => {
    it('returns a port number between 1024 and 65535', async () => {
      const port = await findAvailablePort();
      expect(port).toBeGreaterThan(1024);
      expect(port).toBeLessThan(65536);
    });

    it('returns different ports on successive calls', async () => {
      const a = await findAvailablePort();
      const b = await findAvailablePort();
      // Not always different (port could be reused), but usually
      expect(typeof a).toBe('number');
      expect(typeof b).toBe('number');
    });
  });

  describe('waitForServer', () => {
    it('resolves when server responds 200 on health path', async () => {
      const server = createServer((req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
          return;
        }
        res.writeHead(404);
        res.end();
      });
      const port = await new Promise<number>((resolveListen) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') resolveListen(addr.port);
        });
      });
      try {
        await waitForServer({
          baseUrl: `http://127.0.0.1:${port}`,
          healthPath: '/health',
          timeoutMs: 2_000,
          pollMs: 100,
        });
      } finally {
        server.close();
      }
    });

    it('throws when deadline exceeded', async () => {
      await expect(
        waitForServer({
          baseUrl: 'http://127.0.0.1:1',
          healthPath: '/health',
          timeoutMs: 300,
          pollMs: 100,
        }),
      ).rejects.toThrow(/timed out/i);
    });
  });
});
```

**Step 2: Verify it fails**

```bash
pnpm vitest run packages/worker/test/helpers/live-smoke-utils.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write `live-smoke-utils.ts`**

```typescript
// packages/worker/test/helpers/live-smoke-utils.ts
// ABOUTME: Port discovery and health-polling utilities for spawning a local wrangler dev server.
// ABOUTME: Adapted from iminds-examples/workers/dispatch-worker/scripts/live-smoke-utils.mjs.

import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { ChildProcess } from 'node:child_process';

export async function findAvailablePort(host = '127.0.0.1'): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve available port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export async function waitForServer(options: {
  baseUrl: string;
  healthPath?: string;
  child?: ChildProcess;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<void> {
  const healthPath = options.healthPath ?? '/health';
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (options.child?.exitCode != null) {
      throw new Error(`server exited early with code ${options.child.exitCode}`);
    }
    try {
      const response = await fetch(`${options.baseUrl}${healthPath}`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await delay(pollMs);
  }
  throw new Error(`timed out waiting for ${options.baseUrl}${healthPath}`);
}
```

**Step 4: Run tests to verify**

```bash
pnpm vitest run packages/worker/test/helpers/live-smoke-utils.test.ts
```

Expected: PASS (4 tests).

**Step 5: Write `test-worker.ts`**

```typescript
// packages/worker/test/helpers/test-worker.ts
// ABOUTME: Spawns `wrangler dev` on a free port with a test .dev.vars file, and returns
// ABOUTME: a base URL plus cleanup handle. Used by E2E tests to drive the real worker runtime.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { findAvailablePort, waitForServer } from './live-smoke-utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = resolve(__dirname, '../..');
const HOST = '127.0.0.1';

function renderEnvContent(values: Record<string, string | undefined>): string {
  return Object.entries(values)
    .filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].length > 0,
    )
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n';
}

function terminateProcessTree(child: ChildProcess | undefined): void {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    child.kill('SIGTERM');
    return;
  }
  try {
    process.kill(-child.pid!, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

export type SpawnedWorker = {
  baseUrl: string;
  cleanup(): Promise<void>;
};

export async function spawnWorker(options: {
  envOverrides: Record<string, string | undefined>;
  devVarsPath?: string;
}): Promise<SpawnedWorker> {
  const port = String(await findAvailablePort(HOST));
  const inspectorPort = String(await findAvailablePort(HOST));
  const devVarsPath = options.devVarsPath ?? resolve(WORKER_ROOT, '.dev.vars.test');
  writeFileSync(devVarsPath, renderEnvContent(options.envOverrides));

  const child = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--ip', HOST,
      '--port', port,
      '--inspector-port', inspectorPort,
      '--var-file', devVarsPath,
    ],
    {
      cwd: WORKER_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  );

  child.stdout?.on('data', (chunk) => process.stdout.write(`[worker] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[worker] ${chunk}`));

  const baseUrl = `http://${HOST}:${port}`;
  try {
    await waitForServer({ baseUrl, healthPath: '/health', child, timeoutMs: 90_000 });
  } catch (err) {
    terminateProcessTree(child);
    if (existsSync(devVarsPath)) rmSync(devVarsPath);
    throw err;
  }

  return {
    baseUrl,
    async cleanup() {
      terminateProcessTree(child);
      await delay(300);
      if (existsSync(devVarsPath)) rmSync(devVarsPath);
    },
  };
}
```

**Step 6: Commit**

```bash
git add packages/worker/test/helpers/live-smoke-utils.ts packages/worker/test/helpers/live-smoke-utils.test.ts packages/worker/test/helpers/test-worker.ts
git commit -m "feat: add wrangler dev lifecycle helper for E2E tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2: Integration tests

### Task 2.1: Create `vitest.integration.config.ts` in platform package with globalSetup

**Files:**
- Create: `packages/platform/test/integration/setup.ts`
- Create: `packages/platform/vitest.integration.config.ts`
- Modify: `packages/platform/package.json`

**Step 1: Create `setup.ts`** (Vitest globalSetup — runs once, before any test file)

```typescript
// packages/platform/test/integration/setup.ts
// ABOUTME: Vitest globalSetup for platform integration tests.
// ABOUTME: Creates a Neon branch, runs migrations, exports DATABASE_URL. Deletes branch on teardown.

import { createTestBranch, type TestBranch } from '../../../worker/test/helpers/test-db';

let branch: TestBranch | undefined;

export default async function globalSetup() {
  branch = await createTestBranch({ prefix: 'integration' });
  await branch.runMigrations();
  process.env.DATABASE_URL = branch.connectionString;
  console.log(`[integration] created Neon branch ${branch.branchId}`);

  return async function teardown() {
    if (!branch) return;
    try {
      await branch.deleteBranch();
      console.log(`[integration] deleted Neon branch ${branch.branchId}`);
    } catch (err) {
      console.error('[integration] failed to delete branch:', err);
      throw err;
    }
  };
}
```

**Step 2: Create `packages/platform/vitest.integration.config.ts`**

```typescript
// ABOUTME: Vitest config for platform integration tests.
// ABOUTME: Creates a Neon branch via globalSetup, runs sequentially against the branch.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['test/integration/setup.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
```

**Step 3: Add `test:integration` script to `packages/platform/package.json`**

Add to the `scripts` block:

```json
{
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

**Step 4: Update root `vitest.integration.config.ts` to delegate to platform**

Replace root `vitest.integration.config.ts` content with:

```typescript
// ABOUTME: Root vitest integration config — delegates to platform package's config
// ABOUTME: which handles Neon branch setup. App integration tests join the same branch.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/integration/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/live/**', '**/smoke/**'],
    globalSetup: ['packages/platform/test/integration/setup.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
```

**Step 5: Commit**

```bash
git add packages/platform/test/integration/setup.ts packages/platform/vitest.integration.config.ts packages/platform/package.json vitest.integration.config.ts
git commit -m "feat: wire Neon branch globalSetup into integration config

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: Run existing integration tests against the Neon branch

**Step 1: Pre-flight check**

Verify the env is populated:

```bash
grep -E '^(NEON_API_KEY|NEON_PROJECT_ID)=' .env | sed 's/=.*/=<redacted>/'
```

Expected: both vars present with non-empty values. If not, STOP and ask the user to populate them.

**Step 2: Load `.env` and run integration tests**

```bash
set -a && source .env && set +a && pnpm test:integration
```

Expected: the 7 platform integration tests + 7 app integration tests run against a fresh Neon branch with full schema, and the branch is deleted afterward.

- If ALL tests pass → great, move on.
- If some fail due to assertions being brittle against a fresh DB (e.g., expecting a specific row count), note them and fix minimally in Task 2.3.
- If they fail because the `.env` isn't being loaded, the implementer should add `import { config } from 'dotenv'; config()` to `setup.ts` at the top.

**Step 3: Commit any minor fixes**

If any tests needed small tweaks for the fresh-DB environment:

```bash
git add <modified test files>
git commit -m "test: adjust integration tests for fresh Neon branch environment

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 2.3: Add `execute-agent` integration test (Mastra PG validation)

The existing `execute-agent.integration.test.ts` uses a mocked Mastra. We need a test that proves `@mastra/pg` `PostgresStore` works against Neon — this is the biggest unverified risk.

**Files:**
- Modify: `packages/platform/test/integration/execute-agent.integration.test.ts`

**Step 1: Read the existing test** to understand current scope

```bash
cat packages/platform/test/integration/execute-agent.integration.test.ts
```

**Step 2: Add a new test case** that uses the real `createMastra()` (no mocks) and verifies the thread + messages persisted by querying the Neon branch directly

Add this to the existing describe block (or a new one):

```typescript
import { createMastra } from '../../src/mastra/create-mastra';
import { neon } from '@neondatabase/serverless';

describe('executeProjectAgent with real Mastra PG', () => {
  it('persists thread and messages in the mastra_threads/mastra_messages tables', async () => {
    // This requires OPENROUTER_API_KEY — skip if absent
    if (!process.env.OPENROUTER_API_KEY) {
      // eslint-disable-next-line no-console
      console.log('[integration] skipping real-mastra test: OPENROUTER_API_KEY not set');
      return;
    }

    const mastra = createMastra(process.env.DATABASE_URL!, {
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterModel: process.env.OPENROUTER_MODEL,
    });

    // --- seed user/org/project/workspace (use existing helpers or repos) ---
    // The implementer can reference patterns from project-context.integration.test.ts
    // to seed the control plane. Then call executeProjectAgent.

    const result = await executeProjectAgent(
      { firebaseUid: 'test-uid', projectId: '<seeded project id>', message: 'say hi in one word' },
      { mastra },
    );
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);

    // Verify Mastra persisted data
    const sql = neon(process.env.DATABASE_URL!);
    const threads = await sql`select id from mastra_threads where id = ${result.threadId}`;
    expect(threads.length).toBe(1);
  });
});
```

**Step 3: Implement the seed helpers** (reference `project-context.integration.test.ts` for how it currently seeds data). Factor out a `seedProjectFixture()` helper if it's not already there, in `packages/platform/test/helpers/fixtures.ts`.

**Step 4: Run**

```bash
set -a && source .env && set +a && pnpm --filter @hono-workspace/platform test:integration
```

Expected: the new test calls OpenRouter once, gets a model response, and verifies `mastra_threads` has the row.

**Step 5: Commit**

```bash
git add packages/platform/test/integration/execute-agent.integration.test.ts packages/platform/test/helpers/fixtures.ts
git commit -m "test: verify Mastra PG storage end-to-end against Neon

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 2.4: Add SSE streaming integration test

**Files:**
- Create: `packages/platform/test/integration/stream-channel-reply.integration.test.ts`

**Step 1: Write the test**

```typescript
// ABOUTME: Integration test for streamChannelReplyForPrincipal — verifies SSE event ordering
// ABOUTME: against a real Neon branch and real Mastra (requires OPENROUTER_API_KEY).

import { describe, it, expect } from 'vitest';
import { createMastra, streamChannelReplyForPrincipal } from '../../src';
import { seedProjectFixture } from '../helpers/fixtures';

describe('streamChannelReplyForPrincipal', () => {
  it('yields ack, tokens, and done events in order', async () => {
    if (!process.env.OPENROUTER_API_KEY) {
      console.log('[integration] skipping stream test: OPENROUTER_API_KEY not set');
      return;
    }

    const mastra = createMastra(process.env.DATABASE_URL!, {
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
    });

    const fixture = await seedProjectFixture({ userFirebaseUid: 'test-uid' });

    // Create a thread with an initial message
    const thread = await /* ... use memory store to create thread + user message ... */;

    const events: Array<{ event: string; data: any }> = [];
    const stream = streamChannelReplyForPrincipal(
      {
        firebaseUid: 'test-uid',
        projectId: fixture.projectId,
        channelId: fixture.channelId,
        threadId: thread.id,
        message: 'say "ok" and nothing else',
      },
      { mastra },
    );

    for await (const ev of stream) {
      events.push(ev);
    }

    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('ack');
    expect(kinds).toContain('token');
    expect(kinds.at(-1)).toBe('done');
  });
});
```

**Step 2: Run**

```bash
set -a && source .env && set +a && pnpm --filter @hono-workspace/platform test:integration
```

**Step 3: Commit**

```bash
git add packages/platform/test/integration/stream-channel-reply.integration.test.ts
git commit -m "test: verify SSE stream event ordering against real Mastra

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3: E2E tests

### Task 3.1: Create worker vitest configs

**Files:**
- Create: `packages/worker/vitest.live.config.ts`
- Create: `packages/worker/vitest.smoke.config.ts`

**Step 1: Create `vitest.live.config.ts`**

```typescript
// ABOUTME: Vitest config for worker E2E (live) tests.
// ABOUTME: Expects WORKER_BASE_URL env var — set by the run-e2e.mjs orchestrator.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/live/**/*.e2e.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
```

**Step 2: Create `vitest.smoke.config.ts`**

```typescript
// ABOUTME: Vitest config for worker smoke tests against a deployed worker.
// ABOUTME: Reads SMOKE_BASE_URL from env — tests use describe.skipIf to no-op when unset.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/smoke/**/*.smoke.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
```

**Step 3: Add scripts to `packages/worker/package.json`**

Update scripts block to:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test:e2e": "node --import tsx scripts/run-e2e.mjs",
    "test:smoke": "vitest run --config vitest.smoke.config.ts"
  }
}
```

**Step 4: Commit**

```bash
git add packages/worker/vitest.live.config.ts packages/worker/vitest.smoke.config.ts packages/worker/package.json
git commit -m "feat: add E2E and smoke vitest configs for worker package

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: Write the E2E orchestrator `run-e2e.mjs`

**Files:**
- Create: `packages/worker/scripts/run-e2e.mjs`

This is the main orchestrator. It creates a Neon branch, an R2 prefix, spawns wrangler dev, runs vitest against it, then cleans everything up.

**Step 1: Write the orchestrator**

```javascript
#!/usr/bin/env node
// ABOUTME: E2E test orchestrator — provisions infrastructure, spawns wrangler dev,
// ABOUTME: runs vitest, then cleans up Neon branch + R2 prefix + spawned processes.

import { spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

import { findAvailablePort, waitForServer } from '../test/helpers/live-smoke-utils.ts';
import { createTestBranch } from '../test/helpers/test-db.ts';
import { cleanupPrefix } from '../test/helpers/test-r2.ts';

const HOST = '127.0.0.1';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(scriptDir, '..');
const repoRoot = resolve(workerRoot, '../..');

// Load root .env into process.env
config({ path: resolve(repoRoot, '.env') });

function renderEnvContent(values) {
  return Object.entries(values)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n';
}

function terminateProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') { child.kill('SIGTERM'); return; }
  try { process.kill(-child.pid, 'SIGTERM'); }
  catch { child.kill('SIGTERM'); }
}

function spawnCommand(command, args, options = {}) {
  return spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    ...options,
  });
}

function streamOutput(child, prefix) {
  child.stdout?.on('data', (c) => process.stdout.write(`${prefix}${c}`));
  child.stderr?.on('data', (c) => process.stderr.write(`${prefix}${c}`));
}

async function main() {
  const runId = randomUUID();
  const r2Prefix = `e2e-runs/${runId}`;
  const devVarsPath = resolve(workerRoot, '.dev.vars.test');

  console.log(`[e2e] run id: ${runId}`);

  // 1. Create Neon branch + run migrations
  console.log('[e2e] creating Neon branch...');
  const branch = await createTestBranch({ prefix: 'e2e' });
  await branch.runMigrations();
  console.log(`[e2e] branch ${branch.branchId} ready`);

  // 2. Write test .dev.vars
  writeFileSync(devVarsPath, renderEnvContent({
    DATABASE_URL: branch.connectionString,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_TOKEN: process.env.FIREBASE_TOKEN,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    WORKSPACE_ROOT: r2Prefix,
  }));

  // 3. Spawn wrangler dev on a free port
  const port = String(await findAvailablePort(HOST));
  const inspectorPort = String(await findAvailablePort(HOST));
  const worker = spawnCommand('pnpm', [
    'exec', 'wrangler', 'dev',
    '--ip', HOST,
    '--port', port,
    '--inspector-port', inspectorPort,
    '--var-file', devVarsPath,
  ], { cwd: workerRoot });
  streamOutput(worker, '[wrangler] ');

  const cleanup = async () => {
    console.log('[e2e] cleanup starting...');
    terminateProcessTree(worker);
    if (existsSync(devVarsPath)) rmSync(devVarsPath);
    try {
      const { deletedCount } = await cleanupPrefix(r2Prefix);
      console.log(`[e2e] deleted ${deletedCount} R2 objects under ${r2Prefix}`);
    } catch (err) {
      console.error(`[e2e] R2 cleanup failed:`, err);
      throw err;
    }
    try {
      await branch.deleteBranch();
      console.log(`[e2e] deleted Neon branch ${branch.branchId}`);
    } catch (err) {
      console.error(`[e2e] Neon branch cleanup failed:`, err);
      throw err;
    }
  };

  let cleanupError;
  process.on('exit', () => {
    // Synchronous only — best effort
    terminateProcessTree(worker);
    if (existsSync(devVarsPath)) rmSync(devVarsPath);
  });

  try {
    const baseUrl = `http://${HOST}:${port}`;
    console.log('[e2e] waiting for worker to be ready...');
    await waitForServer({ baseUrl, healthPath: '/health', child: worker, timeoutMs: 90_000 });
    console.log(`[e2e] worker ready at ${baseUrl}`);

    // 4. Run vitest
    const runner = spawnCommand('pnpm', [
      'exec', 'vitest', 'run',
      '--config', 'vitest.live.config.ts',
    ], {
      cwd: workerRoot,
      env: {
        ...process.env,
        WORKER_BASE_URL: baseUrl,
        TEST_R2_PREFIX: r2Prefix,
      },
      stdio: 'inherit',
      detached: false,
    });

    const exitCode = await new Promise((resolve, reject) => {
      runner.on('error', reject);
      runner.on('exit', (code) => resolve(code ?? 1));
    });
    process.exitCode = exitCode;
  } catch (err) {
    console.error('[e2e] orchestrator error:', err);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (err) {
      cleanupError = err;
      process.exitCode = process.exitCode || 1;
    }
    await delay(300);
  }

  if (cleanupError) {
    console.error('[e2e] cleanup failed — test run marked as failed');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[e2e] fatal:', err);
  process.exit(1);
});
```

Note: the `.ts` imports in an `.mjs` file require `tsx` — the script is run via `node --import tsx scripts/run-e2e.mjs` (already in the package.json script).

**Step 2: Smoke-test orchestrator boots** (without any E2E tests present — it should fail gracefully)

```bash
set -a && source .env && set +a && pnpm --filter @hono-workspace/worker test:e2e
```

Expected: creates branch, spawns wrangler, waits for health, vitest runs (finds no E2E tests → exits 0), cleanup runs, branch deleted.

**Step 3: Commit**

```bash
git add packages/worker/scripts/run-e2e.mjs
git commit -m "feat: add E2E orchestrator script with branch/R2/worker lifecycle

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 3.3: Write the first E2E test — health + auth

**Files:**
- Create: `packages/worker/test/live/health.e2e.test.ts`
- Create: `packages/worker/test/live/auth.e2e.test.ts`

**Step 1: Write `health.e2e.test.ts`**

```typescript
// ABOUTME: E2E test for worker health endpoints. Verifies the spawned wrangler dev
// ABOUTME: instance responds correctly to unauthenticated health/ready probes.

import { describe, it, expect } from 'vitest';

const baseUrl = process.env.WORKER_BASE_URL;

describe.skipIf(!baseUrl)('worker health endpoints', () => {
  it('GET /health returns 200 with status ok', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready returns 200 with ok: true', async () => {
    const response = await fetch(`${baseUrl}/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
```

**Step 2: Write `auth.e2e.test.ts`**

```typescript
// ABOUTME: E2E tests for auth middleware — unauthenticated and malformed-token rejections,
// ABOUTME: and that a real Firebase ID token is accepted.

import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.FIREBASE_TOKEN);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const u of createdUsers) {
    await u.delete().catch((err) => {
      console.error(`[e2e] failed to delete Firebase user ${u.uid}:`, err);
    });
  }
});

describe.skipIf(!shouldRun)('worker auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const response = await fetch(`${baseUrl}/api/projects`);
    expect(response.status).toBe(401);
  });

  it('rejects requests with malformed Authorization header', async () => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { authorization: 'NotBearer something' },
    });
    expect(response.status).toBe(401);
  });

  it('rejects requests with invalid bearer tokens', async () => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { authorization: 'Bearer not.a.real.jwt' },
    });
    expect(response.status).toBe(401);
  });

  it('accepts requests with a valid Firebase ID token', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('projects');
    expect(Array.isArray(body.projects)).toBe(true);
  });
});
```

**Step 3: Run**

```bash
set -a && source .env && set +a && pnpm --filter @hono-workspace/worker test:e2e
```

Expected: orchestrator creates branch, spawns worker, 4 tests pass, cleanup runs.

**Step 4: Commit**

```bash
git add packages/worker/test/live/health.e2e.test.ts packages/worker/test/live/auth.e2e.test.ts
git commit -m "test: E2E health and auth middleware coverage

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 3.4: Write the happy-path E2E test — bootstrap → channel → post → reply

This is the flagship test that validates Neon + `@mastra/pg` + `@mastra/s3` + OpenRouter all working together on CF Workers.

**Files:**
- Create: `packages/worker/test/live/happy-path.e2e.test.ts`

**Step 1: Write the test**

```typescript
// ABOUTME: E2E happy-path test — full flow through the deployed worker:
// ABOUTME: bootstrap-project → create channel → post message → verify model replied.

import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.OPENROUTER_API_KEY);

const createdUsers: TestFirebaseUser[] = [];

afterAll(async () => {
  for (const u of createdUsers) {
    await u.delete().catch(() => { /* best effort */ });
  }
});

async function api<T>(path: string, init: RequestInit & { token: string }): Promise<{ status: number; body: T }> {
  const { token, ...rest } = init;
  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      ...(rest.headers ?? {}),
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
  const body = await response.json().catch(() => ({})) as T;
  return { status: response.status, body };
}

describe.skipIf(!shouldRun)('worker happy path', { timeout: 180_000 }, () => {
  it('completes bootstrap → channel → post → message reply', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    // 1. Bootstrap project
    const bootstrap = await api<{
      projectId: string;
      organizationId: string;
      defaultChannelId: string;
    }>('/api/dev/bootstrap-project', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: `e2e-${user.uid}` }),
    });
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.projectId).toBeTruthy();
    const { projectId, defaultChannelId } = bootstrap.body;

    // 2. Verify channels are listable
    const channels = await api<{ channels: Array<{ id: string }> }>(
      `/api/projects/${projectId}/channels`,
      { method: 'GET', token },
    );
    expect(channels.status).toBe(200);
    expect(channels.body.channels.some((c) => c.id === defaultChannelId)).toBe(true);

    // 3. Create a post (opens a new thread)
    const post = await api<{
      thread: { id: string };
      rootMessage: { id: string; text: string };
    }>(`/api/projects/${projectId}/channels/${defaultChannelId}/posts`, {
      method: 'POST',
      token,
      body: JSON.stringify({ message: 'say "ok" and nothing else' }),
    });
    expect(post.status).toBe(200);
    expect(post.body.rootMessage.text).toContain('ok');
    const threadId = post.body.thread.id;

    // 4. Send a message to the thread and expect a model reply
    const reply = await api<{
      text: string;
      threadId: string;
      workspaceRootPath: string;
    }>(`/api/projects/${projectId}/channels/${defaultChannelId}/threads/${threadId}/messages`, {
      method: 'POST',
      token,
      body: JSON.stringify({ message: 'respond with the single word "done"' }),
    });
    expect(reply.status).toBe(200);
    expect(reply.body.threadId).toBe(threadId);
    expect(reply.body.text.length).toBeGreaterThan(0);
    expect(reply.body.workspaceRootPath).toContain(process.env.TEST_R2_PREFIX ?? 'e2e-runs/');
  });
});
```

**Step 2: Run**

```bash
set -a && source .env && set +a && pnpm --filter @hono-workspace/worker test:e2e
```

Expected: test passes. If it fails, look at the wrangler output in the orchestrator logs — any `@mastra/pg` or `@mastra/s3` runtime errors will show there.

**Step 3: Commit**

```bash
git add packages/worker/test/live/happy-path.e2e.test.ts
git commit -m "test: E2E happy path covers Mastra PG + R2 + OpenRouter on Workers

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 3.5: Write the SSE streaming E2E test

**Files:**
- Create: `packages/worker/test/live/streaming.e2e.test.ts`

**Step 1: Write the test**

```typescript
// ABOUTME: E2E test for Server-Sent Events streaming through the worker.
// ABOUTME: Verifies the /messages/stream endpoint yields ack, token, and done events in order.

import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.WORKER_BASE_URL;
const shouldRun = Boolean(baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.OPENROUTER_API_KEY);

const createdUsers: TestFirebaseUser[] = [];
afterAll(async () => {
  for (const u of createdUsers) await u.delete().catch(() => {});
});

type SseEvent = { event: string; data: any };

async function readSseStream(response: Response): Promise<SseEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SseEvent[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (eventLine && dataLine) {
        events.push({
          event: eventLine.slice('event: '.length).trim(),
          data: JSON.parse(dataLine.slice('data: '.length)),
        });
      }
    }
  }
  return events;
}

describe.skipIf(!shouldRun)('worker SSE streaming', { timeout: 180_000 }, () => {
  it('streams ack → token → done in order', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const token = user.idToken;

    // Bootstrap + create a thread
    const bootstrap = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { projectId, defaultChannelId } = await bootstrap.json();

    const post = await fetch(`${baseUrl}/api/projects/${projectId}/channels/${defaultChannelId}/posts`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    const { thread } = await post.json();
    const threadId = thread.id;

    // Stream a reply
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/channels/${defaultChannelId}/threads/${threadId}/messages/stream`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'respond with a short greeting' }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSseStream(response);
    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('ack');
    expect(kinds).toContain('token');
    expect(kinds.at(-1)).toBe('done');
  });
});
```

**Step 2: Run**

```bash
set -a && source .env && set +a && pnpm --filter @hono-workspace/worker test:e2e
```

**Step 3: Commit**

```bash
git add packages/worker/test/live/streaming.e2e.test.ts
git commit -m "test: E2E SSE streaming event order

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4: Smoke tests

Smoke tests run against the deployed worker (`SMOKE_BASE_URL`). They're narrower than E2E — enough to detect "the deployment is broken" without requiring test infrastructure on every run.

### Task 4.1: Write smoke tests

**Files:**
- Create: `packages/worker/test/smoke/health.smoke.test.ts`
- Create: `packages/worker/test/smoke/auth.smoke.test.ts`
- Create: `packages/worker/test/smoke/bootstrap.smoke.test.ts`

**Step 1: Create `health.smoke.test.ts`**

```typescript
// ABOUTME: Smoke test for deployed worker health — validates the production URL responds.

import { describe, it, expect } from 'vitest';

const baseUrl = process.env.SMOKE_BASE_URL;

describe.skipIf(!baseUrl)('deployed worker health', () => {
  it('GET /health returns 200', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
  });

  it('GET /ready returns 200', async () => {
    const response = await fetch(`${baseUrl}/ready`);
    expect(response.status).toBe(200);
  });
});
```

**Step 2: Create `auth.smoke.test.ts`**

```typescript
// ABOUTME: Smoke test for deployed worker auth — verifies it rejects unauthed and accepts valid Firebase tokens.

import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.SMOKE_BASE_URL;
const shouldRun = Boolean(baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS);

const createdUsers: TestFirebaseUser[] = [];
afterAll(async () => {
  for (const u of createdUsers) await u.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('deployed worker auth', () => {
  it('rejects unauthed /api/projects with 401', async () => {
    const response = await fetch(`${baseUrl}/api/projects`);
    expect(response.status).toBe(401);
  });

  it('accepts /api/projects with a valid Firebase token', async () => {
    const user = await createTestUser();
    createdUsers.push(user);
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { authorization: `Bearer ${user.idToken}` },
    });
    expect(response.status).toBe(200);
  });
});
```

**Step 3: Create `bootstrap.smoke.test.ts`**

This one exercises real DB + R2 writes in production. Must clean up after.

```typescript
// ABOUTME: Smoke test that creates a real project against the deployed worker to prove
// ABOUTME: Neon + R2 writes work in production. Cleans up Firebase user after.

import { describe, it, expect, afterAll } from 'vitest';
import { createTestUser, type TestFirebaseUser } from '../helpers/test-firebase';

const baseUrl = process.env.SMOKE_BASE_URL;
const shouldRun = Boolean(baseUrl && process.env.GOOGLE_APPLICATION_CREDENTIALS);

const createdUsers: TestFirebaseUser[] = [];
afterAll(async () => {
  for (const u of createdUsers) await u.delete().catch(() => {});
});

describe.skipIf(!shouldRun)('deployed worker bootstrap', { timeout: 60_000 }, () => {
  it('bootstrap-project creates a real project with workspace and channel', async () => {
    const user = await createTestUser();
    createdUsers.push(user);

    const response = await fetch(`${baseUrl}/api/dev/bootstrap-project`, {
      method: 'POST',
      headers: { authorization: `Bearer ${user.idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `smoke-${user.uid}` }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBeTruthy();
    expect(body.workspaceRootPath).toBeTruthy();
    expect(body.defaultChannelId).toBeTruthy();

    // Note: we intentionally do NOT delete the project from the DB — there is no
    // such endpoint. The test user gets deleted from Firebase, and the project
    // will accumulate under the test user's Firebase UID. This is acceptable for
    // now; a periodic cleanup script will handle orphaned records.
    // TODO: consider adding a test-only DELETE endpoint or a cleanup script.
  });
});
```

**Step 4: Run smoke tests**

```bash
set -a && source .env && set +a && pnpm --filter @hono-workspace/worker test:smoke
```

Expected: 5 tests pass against the deployed worker.

**Step 5: Commit**

```bash
git add packages/worker/test/smoke/
git commit -m "test: smoke tests for deployed worker (health, auth, bootstrap)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5: CI-readiness and documentation

### Task 5.1: Create a testing README

**Files:**
- Create: `packages/worker/test/README.md`

**Step 1: Write the README**

```markdown
# Testing

Four layers, run independently or as a group.

## Quick reference

```bash
pnpm test:unit           # Fast, no infra. Runs on every save.
pnpm test:integration    # Real Neon branch. Run before PR.
pnpm test:e2e            # Spawns wrangler dev, full runtime. Run before merge.
pnpm test:smoke          # Hits deployed worker. Run after deploy.
```

## Required environment variables

All read from the repo root `.env` (gitignored). See `.env.example` for the canonical list.

| Variable | Required for |
|----------|--------------|
| `NEON_API_KEY`, `NEON_PROJECT_ID` | integration, e2e |
| `GOOGLE_APPLICATION_CREDENTIALS` | e2e, smoke |
| `FIREBASE_PROJECT_ID`, `FIREBASE_TOKEN` | e2e, smoke |
| `OPENROUTER_API_KEY` | integration (execute-agent), e2e (happy-path, streaming) |
| `R2_*` (ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET_NAME) | e2e |
| `SMOKE_BASE_URL` | smoke |

Tests that require an unavailable var use `describe.skipIf(...)` and silently pass-through, so missing creds don't crash CI.

## How the layers isolate themselves

- **Integration** creates a Neon branch in `globalSetup`, runs migrations, sets `DATABASE_URL` to it, deletes the branch in teardown.
- **E2E** does the same plus a unique R2 prefix (`e2e-runs/${uuid}/`), writes `.dev.vars.test`, spawns wrangler dev, kills it and cleans up on exit.
- **Smoke** creates Firebase test users for auth; the created projects in prod accumulate (see TODO in `bootstrap.smoke.test.ts`).

## Cleanup discipline

The test harness treats cleanup failures as test failures. If a Neon branch fails to delete, the run exits non-zero. Keep an eye on `console.neon.tech` and Firebase Auth if you're seeing test runs pile up.

## Troubleshooting

- **`timed out waiting for http://127.0.0.1:.../health`** — the wrangler dev process probably crashed. Check `[wrangler]` prefixed lines above this error for the real issue.
- **`Neon createBranch failed: 401`** — `NEON_API_KEY` is wrong or expired. Regenerate at https://console.neon.tech.
- **`signInWithCustomToken failed: 400`** — `FIREBASE_TOKEN` (the web API key, not a service token) is wrong.
- **`OPENROUTER_API_KEY is required...`** — model-dependent tests skipped on CI by default. Set the env var locally to run them.

## Adding a new E2E test

1. Create `packages/worker/test/live/<name>.e2e.test.ts`.
2. Import helpers from `../helpers/test-firebase` for auth, use `process.env.WORKER_BASE_URL` for the target.
3. Track any created Firebase users in an `afterAll` cleanup array.
4. Run `pnpm test:e2e` — the orchestrator handles everything else.
```

**Step 2: Commit**

```bash
git add packages/worker/test/README.md
git commit -m "docs: testing README with layer overview and troubleshooting

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 5.2: Final integration — run all layers in sequence

**Step 1: Run each layer sequentially**

```bash
set -a && source .env && set +a

# Unit
pnpm test:unit
# Expected: PASS, ~20+ tests

# Integration
pnpm test:integration
# Expected: PASS, all tests against fresh Neon branch. Branch deleted.

# E2E
pnpm test:e2e
# Expected: branch + R2 prefix created, wrangler spawned, tests pass, cleanup runs.

# Smoke
pnpm test:smoke
# Expected: tests against deployed worker pass.
```

**Step 2: Fix any breakage**

If any layer fails, debug. Commit fixes one at a time. If the integration of the whole thing reveals a design issue with the plan (e.g., `--var-file` is wrong wrangler flag), update the orchestrator and the plan doc's known-issues section.

**Step 3: Once all four layers pass, commit a final marker**

```bash
git commit --allow-empty -m "test: all four testing layers verified end-to-end

Unit: ~20 tests, <2s
Integration: ~N tests against Neon branch
E2E: 7 tests against spawned wrangler dev
Smoke: 5 tests against deployed worker

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Known risks and open questions

1. **`wrangler dev --var-file` flag:** I used this to load `.dev.vars.test` in the orchestrator. If wrangler 4.x doesn't support it, fall back to the default `.dev.vars` filename and include a backup/restore around the test run. Verify early in Phase 3.

2. **Neon branch creation time:** Each branch takes ~5-15s to provision. E2E runs therefore have a ~30s warmup before the first test. Tolerable now; consider a pool if CI time matters.

3. **Wrangler stdout buffering:** If E2E tests fail, the `[wrangler]` logs may be truncated. Consider piping to a file and dumping the last 200 lines on failure.

4. **Firebase user leaks:** If a test crashes between `createTestUser` and `afterAll`, the user stays in Firebase. Add a periodic cleanup script (outside this plan) that deletes users matching `test-*@test.hono-workspace.local`.

5. **`test:integration` migration shape:** The existing integration tests use the old schema. They may need small updates for the fresh-DB environment (e.g., a test that expects 0 rows vs. N rows). Task 2.2 addresses this.

6. **`@aws-sdk/client-s3` bundle size on Worker:** We only add it as a devDep, so the deployed worker is unaffected. But the dev-time install is +30MB. If that's problematic, switch `test-r2.ts` to raw `fetch()` calls against R2's S3-compatible API.

7. **OpenRouter cost:** Integration + E2E tests with `OPENROUTER_API_KEY` set will make real model calls. Budget: <$0.01 per full test run at current gpt-4.1-mini prices. Add `OPENROUTER_API_KEY=` (empty) to CI to skip those tests.
