# Cloudflare Worker Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the hono-workspace backend (`packages/app`) as a Cloudflare Worker, replacing Node.js-specific dependencies with CF-compatible alternatives.

**Architecture:** Create a new `packages/worker` package that re-uses the existing `@hono-workspace/platform` package but swaps the runtime entry point, database client, and workspace filesystem. The existing `packages/app` remains as the Node.js dev server. Platform code is refactored to accept injected dependencies (database pool, workspace factory) instead of importing Node.js-specific singletons directly.

**Tech Stack:** Hono (native CF Worker export), `@neondatabase/serverless` (PostgreSQL over HTTP/WebSocket), `@mastra/s3` (R2-backed workspace filesystem), Wrangler (build/deploy tooling)

**Reference implementation:** `/Users/pureicis/dev/iminds-examples/workers/mind-worker-v1` — uses raw CF Worker fetch handler with `wrangler.toml`, `nodejs_compat` flag, and Neon serverless for DB.

---

## Phase 1: Make Platform Database-Client Injectable

The core problem: `packages/platform` imports a singleton `Pool` from `pg` in `db/client.ts`, and every repository imports that singleton directly. This is incompatible with CF Workers (no TCP sockets). We need to make the database client injectable so the worker can provide a Neon serverless pool while the Node.js app continues using `pg`.

### Task 1: Create a database client abstraction

**Files:**
- Create: `packages/platform/src/db/context.ts`
- Modify: `packages/platform/src/db/client.ts`

**Step 1: Write the failing test**

Create a test that verifies a database context can be set and retrieved.

```typescript
// packages/platform/test/db/context.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { setDatabasePool, getDatabasePool } from '../../src/db/context';

describe('database context', () => {
  afterEach(() => {
    // Reset to undefined state for isolation
    setDatabasePool(undefined as any);
  });

  it('returns the pool that was set', () => {
    const fakePool = { query: async () => ({ rows: [] }) } as any;
    setDatabasePool(fakePool);
    expect(getDatabasePool()).toBe(fakePool);
  });

  it('throws when no pool has been set', () => {
    expect(() => getDatabasePool()).toThrow('Database pool has not been initialized');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm vitest run packages/platform/test/db/context.test.ts`
Expected: FAIL — module not found

**Step 3: Write the database context module**

```typescript
// packages/platform/src/db/context.ts
// ABOUTME: Module-level database pool holder, allowing the pool implementation
// ABOUTME: to be injected at startup (pg for Node.js, neon-serverless for CF Workers).

export type QueryResult<T> = {
  rows: T[];
  rowCount: number | null;
};

export type DatabasePool = {
  query<T = any>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
};

let currentPool: DatabasePool | undefined;

export function setDatabasePool(pool: DatabasePool): void {
  currentPool = pool;
}

export function getDatabasePool(): DatabasePool {
  if (!currentPool) {
    throw new Error('Database pool has not been initialized');
  }
  return currentPool;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm vitest run packages/platform/test/db/context.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/db/context.ts packages/platform/test/db/context.test.ts
git commit -m "feat: add injectable database pool context"
```

---

### Task 2: Migrate repositories to use getDatabasePool()

**Files:**
- Modify: `packages/platform/src/db/repositories/organizations.ts`
- Modify: `packages/platform/src/db/repositories/users.ts`
- Modify: `packages/platform/src/db/repositories/projects.ts`
- Modify: `packages/platform/src/db/repositories/memberships.ts`
- Modify: `packages/platform/src/db/repositories/workspace-roots.ts`
- Modify: `packages/platform/src/db/repositories/workspace-bindings.ts`
- Modify: `packages/platform/src/db/repositories/project-channels.ts`
- Modify: `packages/platform/src/db/repositories/channel-threads.ts`
- Modify: `packages/platform/src/services/project-context.ts`
- Modify: `packages/platform/src/services/audit.ts`
- Modify: `packages/platform/src/workspace/locking.ts`
- Modify: `packages/platform/src/db/schema.ts` (if it exists and imports pool)

**Step 1: In every file listed above, replace the import**

Change:
```typescript
import { pool } from '../db/client';
// or
import { pool } from './client';
```

To:
```typescript
import { getDatabasePool } from '../db/context';
```

And in each function body, replace bare `pool.query(...)` with `getDatabasePool().query(...)`.

This is a mechanical find-and-replace. Each repository file has 1-4 query calls. The pattern is always the same:
- Replace the import line
- Replace `pool.query` → `getDatabasePool().query` (or assign `const pool = getDatabasePool()` at the top of each function if there are multiple calls)

**Step 2: Update `packages/platform/src/db/client.ts` to auto-initialize the context**

```typescript
// ABOUTME: Node.js database client — creates a pg Pool and registers it
// ABOUTME: as the active database pool for repository use.

import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

import { parseEnv } from '../env';
import { setDatabasePool } from './context';

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../../../.env') });

const env = parseEnv(process.env);

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

setDatabasePool(pool);
```

This preserves backward compatibility: any code that imports `client.ts` (including the existing app entry point) will auto-register the pg pool. The migration script still imports `pool` directly, which is fine — it's a Node.js-only CLI tool.

**Step 3: Update platform exports**

In `packages/platform/src/index.ts`, add:
```typescript
export * from './db/context';
```

**Step 4: Run existing tests**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm test`
Expected: All existing tests pass (they import client.ts which auto-registers the pool)

**Step 5: Commit**

```bash
git add packages/platform/src/
git commit -m "refactor: use injectable database pool in all repositories"
```

---

## Phase 2: Make Workspace Factory Injectable

### Task 3: Create a workspace factory abstraction

The workspace factory in `packages/platform/src/workspace/factory.ts` uses `LocalFilesystem` and `LocalSandbox`. For CF Workers, we need `S3Filesystem` (backed by R2). Make this injectable.

**Files:**
- Create: `packages/platform/src/workspace/workspace-context.ts`
- Modify: `packages/platform/src/workspace/factory.ts`
- Modify: `packages/platform/src/workspace/resolver.ts`
- Modify: `packages/platform/src/mastra/execution/execute-agent.ts`
- Modify: `packages/platform/src/services/chat.ts`

**Step 1: Write the failing test**

```typescript
// packages/platform/test/workspace/workspace-context.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { setWorkspaceFactory, getWorkspaceFactory } from '../../src/workspace/workspace-context';

describe('workspace context', () => {
  afterEach(() => {
    setWorkspaceFactory(undefined as any);
  });

  it('returns the factory that was set', () => {
    const fakeFactory = async (basePath: string) => ({} as any);
    setWorkspaceFactory(fakeFactory);
    expect(getWorkspaceFactory()).toBe(fakeFactory);
  });

  it('throws when no factory has been set', () => {
    expect(() => getWorkspaceFactory()).toThrow('Workspace factory has not been initialized');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm vitest run packages/platform/test/workspace/workspace-context.test.ts`
Expected: FAIL

**Step 3: Write the workspace context module**

```typescript
// packages/platform/src/workspace/workspace-context.ts
// ABOUTME: Module-level workspace factory holder, allowing the workspace implementation
// ABOUTME: to be injected at startup (LocalFilesystem for Node.js, S3Filesystem for CF Workers).

import type { Workspace } from '@mastra/core/workspace';

export type WorkspaceFactory = (basePath: string) => Promise<Workspace>;

let currentFactory: WorkspaceFactory | undefined;

export function setWorkspaceFactory(factory: WorkspaceFactory): void {
  currentFactory = factory;
}

export function getWorkspaceFactory(): WorkspaceFactory {
  if (!currentFactory) {
    throw new Error('Workspace factory has not been initialized');
  }
  return currentFactory;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm vitest run packages/platform/test/workspace/workspace-context.test.ts`
Expected: PASS

**Step 5: Update factory.ts to auto-register the local factory**

Modify `packages/platform/src/workspace/factory.ts`:

```typescript
// ABOUTME: Node.js workspace factory — creates local filesystem workspaces
// ABOUTME: and registers as the active factory for workspace resolution.

import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import { setWorkspaceFactory } from './workspace-context';

export async function createRuntimeWorkspace(basePath: string) {
  const workspace = new Workspace({
    filesystem: new LocalFilesystem({
      basePath,
      contained: true,
    }),
    sandbox: new LocalSandbox({
      workingDirectory: basePath,
      env: {
        PATH: process.env.PATH ?? '',
      },
    }),
  });

  await workspace.init();
  return workspace;
}

setWorkspaceFactory(createRuntimeWorkspace);
```

**Step 6: Update resolver.ts to use the factory context**

Modify `packages/platform/src/workspace/resolver.ts` — replace:
```typescript
import { createRuntimeWorkspace } from './factory';
```
With:
```typescript
import { getWorkspaceFactory } from './workspace-context';
```

And replace:
```typescript
const workspace = await createRuntimeWorkspace(root.root_path);
```
With:
```typescript
const workspace = await getWorkspaceFactory()(root.root_path);
```

**Step 7: Do the same in execute-agent.ts and chat.ts**

In `packages/platform/src/mastra/execution/execute-agent.ts`:
- Replace the import of `createRuntimeWorkspace` from `../../workspace/factory` with `getWorkspaceFactory` from `../../workspace/workspace-context`
- Replace calls to `createRuntimeWorkspace(path)` with `getWorkspaceFactory()(path)`
- Keep the deps override pattern for testing

In `packages/platform/src/services/chat.ts`:
- Same pattern: replace `createRuntimeWorkspace` import → `getWorkspaceFactory`
- Replace the call in `buildExecutionContext`

**Step 8: Export from index.ts**

Add to `packages/platform/src/index.ts`:
```typescript
export * from './workspace/workspace-context';
```

**Step 9: Run all tests**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm test`
Expected: All pass

**Step 10: Commit**

```bash
git add packages/platform/
git commit -m "refactor: make workspace factory injectable via context"
```

---

## Phase 3: Make Environment Parsing Runtime-Agnostic

### Task 4: Split env.ts into shared validation and Node.js-specific loading

**Files:**
- Modify: `packages/platform/src/env.ts`

Currently `env.ts` requires `WORKSPACE_ROOT` which won't exist in CF Workers (workspaces are in R2). The worker needs a different env shape.

**Step 1: Modify env.ts to make WORKSPACE_ROOT optional**

The workspace root path in CF Workers will be an S3/R2 prefix, not a filesystem path. The provisioning code constructs paths like `org_<id>/project_<id>` which work as S3 key prefixes too.

```typescript
// ABOUTME: Environment variable parsing and validation.
// ABOUTME: Shared between Node.js and CF Worker runtimes.

export type RawEnv = Record<string, string | undefined>;

export type ParsedEnv = {
  databaseUrl: string;
  workspaceRoot: string;
  firebaseProjectId: string;
  firebaseApiKey: string;
  port: number;
};

export function parseEnv(env: RawEnv): ParsedEnv {
  const required = ['DATABASE_URL', 'FIREBASE_PROJECT_ID', 'FIREBASE_TOKEN'] as const;

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    databaseUrl: env.DATABASE_URL!,
    workspaceRoot: env.WORKSPACE_ROOT ?? '',
    firebaseProjectId: env.FIREBASE_PROJECT_ID!,
    firebaseApiKey: env.FIREBASE_TOKEN!,
    port: Number(env.PORT ?? 3000),
  };
}
```

**Step 2: Run tests**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm test`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/platform/src/env.ts
git commit -m "refactor: make WORKSPACE_ROOT optional in env parsing"
```

---

## Phase 4: Make Workspace Provisioning Storage-Agnostic

### Task 5: Replace Node.js filesystem calls in provisioning with workspace factory

**Files:**
- Modify: `packages/platform/src/workspace/provisioning.ts`
- Modify: `packages/platform/src/workspace/reconciliation.ts`

**Step 1: Refactor provisioning.ts**

Currently calls `mkdir()` from `node:fs/promises`. For R2, directories don't need explicit creation — objects with the prefix are enough. Replace the filesystem mkdir calls with a no-op that stores the path in the database only.

The `buildWorkspaceRootPath` still works — it just produces a string like `org_xxx/project_yyy` which serves as an S3 prefix in R2 or a filesystem path in Node.js.

Remove the `mkdir` calls and the `node:fs/promises` import. The workspace directories (`repo`, `docs`, etc.) are created on-demand by the workspace filesystem implementation, not by provisioning.

```typescript
// ABOUTME: Provisions a workspace root and binding for a project,
// ABOUTME: recording the workspace path in the database.

import { parseEnv } from '../env';
import { createWorkspaceBinding, getActiveWorkspaceBinding } from '../db/repositories/workspace-bindings';
import { createWorkspaceRoot, getActiveWorkspaceRootByProjectId, markWorkspaceRootReady } from '../db/repositories/workspace-roots';
import { buildWorkspaceRootPath, ensureContainedWorkspacePath } from './paths';

const DEFAULT_DIRECTORIES = ['repo', 'docs', 'output', 'tmp', '.workspace-meta'] as const;

export async function provisionWorkspaceForProject(input: {
  organizationId: string;
  projectId: string;
  requestedBy: string;
  activeAgentRef: string;
  activeAgentVersion: string;
  workspaceRoot: string;
}) {
  const existingRoot = await getActiveWorkspaceRootByProjectId(input.projectId);
  const existingBinding = await getActiveWorkspaceBinding(input.projectId);

  if (existingRoot && existingBinding) {
    return {
      root: existingRoot,
      binding: existingBinding,
      directories: [...DEFAULT_DIRECTORIES],
    };
  }

  const rootPath = ensureContainedWorkspacePath(
    input.workspaceRoot,
    buildWorkspaceRootPath(input.workspaceRoot, input.organizationId, input.projectId),
  );

  const provisionalRoot =
    existingRoot ??
    (await createWorkspaceRoot({
      organizationId: input.organizationId,
      projectId: input.projectId,
      rootPath,
      status: 'provisioning',
    }));

  const root = await markWorkspaceRootReady(provisionalRoot.id);

  const binding =
    existingBinding ??
    (await createWorkspaceBinding({
      projectId: input.projectId,
      workspaceRootId: root.id,
      activeAgentRef: input.activeAgentRef,
      activeAgentVersion: input.activeAgentVersion,
      policyJson: {
        allowCommandExecution: true,
        allowDeletes: false,
      },
    }));

  return {
    root,
    binding,
    directories: [...DEFAULT_DIRECTORIES],
  };
}
```

Note: The `workspaceRoot` is now passed in as a parameter rather than read from env at module level. Callers must provide it.

**Step 2: Refactor reconciliation.ts**

Replace `access()` from `node:fs/promises` with a workspace-factory-based check:

```typescript
// ABOUTME: Reconciles workspace state by verifying the workspace root
// ABOUTME: is still accessible and marks it unhealthy if not.

import { getActiveWorkspaceRootByProjectId, updateWorkspaceRootStatus } from '../db/repositories/workspace-roots';
import { recordWorkspaceEvent } from '../services/audit';
import { getWorkspaceFactory } from './workspace-context';

export async function reconcileWorkspaceForProject(projectId: string) {
  const root = await getActiveWorkspaceRootByProjectId(projectId);

  if (!root) {
    throw new Error('Workspace root not found for project');
  }

  try {
    const factory = getWorkspaceFactory();
    const workspace = await factory(root.root_path);
    await workspace.filesystem.exists('/');

    return root;
  } catch {
    const updatedRoot = await updateWorkspaceRootStatus(root.id, 'error');

    await recordWorkspaceEvent({
      workspaceRootId: root.id,
      eventType: 'workspace.missing_directory',
      payloadJson: {
        projectId,
        rootPath: root.root_path,
      },
    });

    return updatedRoot;
  }
}
```

**Step 3: Update callers of provisionWorkspaceForProject**

Search for callers and pass `workspaceRoot` from the env or CF bindings. The main caller is in `packages/platform/src/services/dev-bootstrap.ts` — read it, add the parameter.

**Step 4: Run tests**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/workspace/ packages/platform/src/services/
git commit -m "refactor: remove Node.js filesystem calls from provisioning and reconciliation"
```

---

## Phase 5: Create the Worker Package

### Task 6: Scaffold packages/worker

**Files:**
- Create: `packages/worker/package.json`
- Create: `packages/worker/tsconfig.json`
- Create: `packages/worker/wrangler.toml`
- Create: `packages/worker/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@hono-workspace/worker",
  "private": true,
  "type": "module",
  "dependencies": {
    "@hono-workspace/platform": "workspace:*",
    "@mastra/hono": "1.4.3",
    "@mastra/s3": "latest",
    "@neondatabase/serverless": "^1.0.2",
    "hono": "4.12.12",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241218.0",
    "wrangler": "^4.54.0"
  },
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "types": ["@cloudflare/workers-types"],
    "moduleResolution": "Bundler"
  },
  "include": ["src/**/*.ts"]
}
```

Note: may need to remove `verbatimModuleSyntax` from base or override it here if it conflicts with CF types. Verify during implementation.

**Step 3: Create wrangler.toml**

```toml
name = "hono-workspace-api"
main = "src/index.ts"
compatibility_date = "2026-04-06"
compatibility_flags = ["nodejs_compat"]

[vars]
# Non-secret env vars go here
# Secrets set via: wrangler secret put DATABASE_URL

# [r2_buckets]
# Uncomment when R2 bucket is created
# [[r2_buckets]]
# binding = "WORKSPACE_BUCKET"
# bucket_name = "hono-workspace"
```

**Step 4: Create the entry point**

```typescript
// packages/worker/src/index.ts
// ABOUTME: Cloudflare Worker entry point — boots the Hono app with
// ABOUTME: Neon serverless DB and R2-backed workspace filesystem.

import { Hono } from 'hono';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { S3Filesystem } from '@mastra/s3';
import { Workspace } from '@mastra/core/workspace';
import { MastraServer } from '@mastra/hono';

import {
  setDatabasePool,
  setWorkspaceFactory,
  createMastra,
  createFirebaseTokenVerifier,
} from '@hono-workspace/platform';

import { createAuthMiddleware } from './middleware/auth';
import { registerRoutes } from './routes';

type Env = {
  DATABASE_URL: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_TOKEN: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  WORKSPACE_ROOT: string;
};

type HonoEnv = {
  Bindings: Env;
  Variables: {
    principal: {
      uid: string;
      email: string | null;
      name: string | null;
    };
  };
};

let initialized = false;

function boot(env: Env) {
  if (initialized) return;

  // Database: Neon serverless over WebSocket
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  setDatabasePool(pool);

  // Workspace: R2-backed S3 filesystem
  setWorkspaceFactory(async (basePath: string) => {
    const filesystem = new S3Filesystem({
      bucket: env.R2_BUCKET_NAME,
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      prefix: basePath,
    });
    const workspace = new Workspace({ filesystem });
    await workspace.init();
    return workspace;
  });

  // OpenRouter env for agent model resolution
  globalThis.process ??= {} as any;
  globalThis.process.env ??= {} as any;
  globalThis.process.env.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
  if (env.OPENROUTER_MODEL) {
    globalThis.process.env.OPENROUTER_MODEL = env.OPENROUTER_MODEL;
  }

  initialized = true;
}

const app = new Hono<HonoEnv>();

app.use('*', async (c, next) => {
  boot(c.env);
  await next();
});

app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/ready', (c) => c.json({ ok: true }));

app.use('/api/*', async (c, next) => {
  const tokenVerifier = createFirebaseTokenVerifier({
    projectId: c.env.FIREBASE_PROJECT_ID,
  });
  const auth = createAuthMiddleware({ tokenVerifier });
  return auth(c, next);
});

// Register all API routes (same as packages/app but without the Node.js server wrapper)
// This will be extracted from factory.ts into a shared route registration module.

export default app;
```

**Step 5: Commit**

```bash
git add packages/worker/
git commit -m "feat: scaffold CF Worker package with Neon + R2 integration"
```

---

### Task 7: Extract shared route registration from factory.ts

**Files:**
- Create: `packages/app/src/routes/api.ts` (or modify existing route files)
- Modify: `packages/app/src/server/factory.ts`
- Modify: `packages/worker/src/index.ts`

The goal is to extract the route handler functions from `factory.ts` into something both the Node.js app and the CF Worker can reuse. The route handlers themselves are runtime-agnostic — they just call platform functions and return JSON.

**Step 1: Extract the inline route handlers**

The routes in `factory.ts` (lines 290-440) are mostly thin wrappers that:
1. Read `c.get('principal')`
2. Parse request body
3. Call a platform function
4. Return `c.json(result)`

These are already Hono handlers and are runtime-agnostic. The factory function creates the app, applies middleware, and registers routes. For the worker, we need the same routes but with different middleware setup (env-based instead of process.env-based).

The cleanest approach: keep `factory.ts` as-is for the Node.js app, and in the worker entry point, register the same routes directly. The route handlers are short enough that duplicating the registration (not the logic) is acceptable.

Copy the route registration block from `factory.ts` into the worker's `index.ts`, replacing the `params.*` fallback pattern with direct platform function calls.

**Step 2: Wire up MastraServer in the worker**

```typescript
// In packages/worker/src/index.ts, after route registration:
app.use('/api/*', async (c, next) => {
  // ... auth middleware
});

// ... route registrations (same as factory.ts but using direct platform imports)

// Mastra server integration
const mastraMiddleware = async (c: any, next: any) => {
  const mastra = createMastra(c.env.DATABASE_URL);
  const server = new MastraServer({ app, mastra });
  // Note: MastraServer.init() may need to be called once, not per-request.
  // Investigate during implementation.
  await next();
};
```

**Important:** During implementation, verify how `MastraServer` works — it may need to be initialized once (not per-request). The mind-worker-v1 reference uses lazy initialization with a boot state pattern. Follow that pattern if needed.

**Step 3: Run typecheck**

Run: `cd /Users/pureicis/dev/mastra-playground/hono-workspace && pnpm --filter @hono-workspace/worker typecheck`
Expected: PASS (or note what needs fixing)

**Step 4: Commit**

```bash
git add packages/worker/src/ packages/app/src/
git commit -m "feat: wire up API routes in CF Worker entry point"
```

---

## Phase 6: Verify Local Dev with Wrangler

### Task 8: Test with `wrangler dev`

**Files:**
- Modify: `packages/worker/wrangler.toml` (add .dev.vars instructions)
- Create: `packages/worker/.dev.vars.example`

**Step 1: Create .dev.vars.example**

```
DATABASE_URL=postgres://user:password@your-neon-host.neon.tech/hono_workspace?sslmode=require
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_TOKEN=your-firebase-api-key
OPENROUTER_API_KEY=your-openrouter-key
R2_ACCOUNT_ID=your-cf-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=hono-workspace
WORKSPACE_ROOT=workspaces
```

**Step 2: Create actual .dev.vars from the example**

Copy `.dev.vars.example` to `.dev.vars` and fill in real credentials.

**Step 3: Add .dev.vars to .gitignore**

Ensure `packages/worker/.dev.vars` is in `.gitignore`.

**Step 4: Install dependencies and run**

```bash
cd /Users/pureicis/dev/mastra-playground/hono-workspace
pnpm install
cd packages/worker
pnpm dev
```

**Step 5: Test health endpoint**

```bash
curl http://localhost:8787/health
```
Expected: `{"status":"ok"}`

**Step 6: Commit**

```bash
git add packages/worker/.dev.vars.example packages/worker/wrangler.toml .gitignore
git commit -m "feat: add wrangler dev configuration for local CF Worker testing"
```

---

## Phase 7: Deploy

### Task 9: Deploy to Cloudflare

**Step 1: Create R2 bucket**

```bash
wrangler r2 bucket create hono-workspace
```

**Step 2: Set secrets**

```bash
cd packages/worker
wrangler secret put DATABASE_URL
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_TOKEN
wrangler secret put OPENROUTER_API_KEY
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET_NAME
wrangler secret put WORKSPACE_ROOT
```

**Step 3: Deploy**

```bash
cd packages/worker
pnpm deploy
```

**Step 4: Verify**

```bash
curl https://hono-workspace-api.<your-subdomain>.workers.dev/health
```
Expected: `{"status":"ok"}`

**Step 5: Commit any config changes**

```bash
git add packages/worker/
git commit -m "chore: finalize CF Worker deployment configuration"
```

---

## Known Risks and Open Questions

1. **`@mastra/pg` internals** — `PostgresStore` from `@mastra/pg` creates its own internal `pg.Pool`. It may not work on CF Workers even with `nodejs_compat`. If it fails, we'll need to find a Mastra storage adapter that works over HTTP, or fork `@mastra/pg` to accept a Neon pool. **Mitigation:** Test early in Phase 6. If blocked, Mastra may have a `LibsqlStore` or similar that works on Workers.

2. **`@mastra/s3` on CF Workers** — Uses the AWS SDK internally. Should work with `nodejs_compat` but verify. The S3 SDK uses HTTP so there shouldn't be TCP socket issues.

3. **SSE streaming** — Hono supports streaming on CF Workers via `ReadableStream`. The current `createSseResponse` in `factory.ts` already uses `ReadableStream`, so it should work as-is. Verify in Phase 6.

4. **`randomUUID`** — Used in `chat.ts` via `node:crypto`. CF Workers have `crypto.randomUUID()` globally. May need a small compatibility shim or import change.

5. **Process.env usage in platform code** — The project agent reads `OPENROUTER_API_KEY` from `process.env`. The worker boot function patches `globalThis.process.env` as a workaround. This is fragile. A better approach would be to make the agent model configurable via dependency injection, but that's a larger refactor for later.

6. **Migration tooling** — `db:migrate` remains Node.js-only (reads SQL files from disk, uses `pg` Pool). This is fine — migrations run from dev machines, not from Workers.
