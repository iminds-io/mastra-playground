# Hono Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a greenfield `pnpm` monorepo that hosts Hono and Mastra together, verifies Firebase ID tokens, persists Mastra and application control-plane state in Postgres, provisions contained local workspaces, and exposes protected project-scoped runtime routes with TDD-first coverage.

**Architecture:** The repo is split into `packages/app` for the Hono shell and `packages/platform` for auth, database, workspace, and Mastra integration. Postgres is the control plane for both Mastra runtime storage and app-owned tenancy/workspace tables, while the filesystem is the execution plane resolved per project request.

**Tech Stack:** Node.js, TypeScript, pnpm workspaces, Hono, Mastra, Postgres, Docker Compose, Vitest

---

### Task 1: Scaffold the Monorepo Root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `packages/app/package.json`
- Create: `packages/app/tsconfig.json`
- Create: `packages/platform/package.json`
- Create: `packages/platform/tsconfig.json`

**Step 1: Write the failing test**

Create `packages/app/test/unit/root-structure.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('workspace scaffold', () => {
  it('creates the expected root files', () => {
    expect(existsSync(resolve(process.cwd(), 'package.json'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'pnpm-workspace.yaml'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'docker-compose.yml'))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/app/test/unit/root-structure.test.ts`
Expected: FAIL because the workspace files and test runner config do not exist yet.

**Step 3: Write minimal implementation**

Create the root workspace files and package manifests with:

```json
{
  "name": "hono-workspace",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "dev:db": "docker compose up -d postgres",
    "dev:db:down": "docker compose down",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/app/test/unit/root-structure.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts .gitignore .env.example docker-compose.yml packages/app/package.json packages/app/tsconfig.json packages/platform/package.json packages/platform/tsconfig.json packages/app/test/unit/root-structure.test.ts
git commit -m "chore: scaffold monorepo workspace"
```

### Task 2: Add Environment Parsing and Dockerized Postgres

**Files:**
- Create: `packages/platform/src/env.ts`
- Create: `packages/platform/test/unit/env.test.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `docker-compose.yml`

**Step 1: Write the failing test**

Create `packages/platform/test/unit/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/env';

describe('parseEnv', () => {
  it('requires the database and firebase fields', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/platform/test/unit/env.test.ts`
Expected: FAIL because `packages/platform/src/env.ts` does not exist.

**Step 3: Write minimal implementation**

Create `packages/platform/src/env.ts`:

```ts
type RawEnv = Record<string, string | undefined>;

export function parseEnv(env: RawEnv) {
  const required = ['DATABASE_URL', 'WORKSPACE_ROOT', 'FIREBASE_PROJECT_ID', 'FIREBASE_TOKEN'];
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    databaseUrl: env.DATABASE_URL!,
    workspaceRoot: env.WORKSPACE_ROOT!,
    firebaseProjectId: env.FIREBASE_PROJECT_ID!,
    firebaseApiKey: env.FIREBASE_TOKEN!,
    port: Number(env.PORT ?? 3000),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/platform/test/unit/env.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/env.ts packages/platform/test/unit/env.test.ts .env.example package.json docker-compose.yml
git commit -m "chore: add env parsing and local postgres config"
```

### Task 3: Build the Database Client and App Schema Migrations

**Files:**
- Create: `packages/platform/src/db/client.ts`
- Create: `packages/platform/src/db/schema.ts`
- Create: `packages/platform/src/db/migrate.ts`
- Create: `packages/platform/src/db/migrations/001_initial.sql`
- Create: `packages/platform/test/integration/schema.test.ts`
- Modify: `packages/platform/package.json`

**Step 1: Write the failing test**

Create `packages/platform/test/integration/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { listAppTables } from '../../src/db/schema';

describe('database schema', () => {
  it('contains the workspace control-plane tables', async () => {
    const tables = await listAppTables();
    expect(tables).toContain('workspace_roots');
    expect(tables).toContain('workspace_bindings');
    expect(tables).toContain('workspace_locks');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm dev:db && pnpm vitest run packages/platform/test/integration/schema.test.ts`
Expected: FAIL because the DB client, migration, and schema helpers do not exist.

**Step 3: Write minimal implementation**

Create `packages/platform/src/db/client.ts`:

```ts
import { Pool } from 'pg';
import { parseEnv } from '../env';

const env = parseEnv(process.env);
export const pool = new Pool({ connectionString: env.databaseUrl });
```

Create `packages/platform/src/db/schema.ts`:

```ts
import { pool } from './client';

export async function listAppTables() {
  const result = await pool.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name asc
  `);
  return result.rows.map((row) => row.table_name as string);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @hono-workspace/platform db:migrate && pnpm vitest run packages/platform/test/integration/schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/db packages/platform/test/integration/schema.test.ts packages/platform/package.json
git commit -m "feat: add database client and control-plane schema"
```

### Task 4: Implement Firebase ID Token Verification

**Files:**
- Create: `packages/platform/src/auth/claims.ts`
- Create: `packages/platform/src/auth/jwks-cache.ts`
- Create: `packages/platform/src/auth/firebase-token-verifier.ts`
- Create: `packages/platform/test/unit/firebase-token-verifier.test.ts`

**Step 1: Write the failing test**

Create `packages/platform/test/unit/firebase-token-verifier.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateFirebaseClaims } from '../../src/auth/claims';

describe('validateFirebaseClaims', () => {
  it('accepts the expected issuer and audience', () => {
    const claims = validateFirebaseClaims({
      aud: 'demo-project',
      iss: 'https://securetoken.google.com/demo-project',
      sub: 'uid-123',
      exp: Math.floor(Date.now() / 1000) + 60,
      iat: Math.floor(Date.now() / 1000) - 60,
    }, 'demo-project');

    expect(claims.uid).toBe('uid-123');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/platform/test/unit/firebase-token-verifier.test.ts`
Expected: FAIL because the auth modules do not exist.

**Step 3: Write minimal implementation**

Create `packages/platform/src/auth/claims.ts`:

```ts
export function validateFirebaseClaims(
  claims: Record<string, unknown>,
  projectId: string,
) {
  if (claims.aud !== projectId) {
    throw new Error('Invalid Firebase audience');
  }

  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Invalid Firebase issuer');
  }

  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new Error('Invalid Firebase subject');
  }

  return {
    uid: claims.sub,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/platform/test/unit/firebase-token-verifier.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/auth packages/platform/test/unit/firebase-token-verifier.test.ts
git commit -m "feat: add firebase token verification primitives"
```

### Task 5: Add Repositories for Tenancy and Project Access

**Files:**
- Create: `packages/platform/src/db/repositories/users.ts`
- Create: `packages/platform/src/db/repositories/projects.ts`
- Create: `packages/platform/src/db/repositories/memberships.ts`
- Create: `packages/platform/src/services/project-context.ts`
- Create: `packages/platform/src/services/access-control.ts`
- Create: `packages/platform/test/integration/project-context.test.ts`

**Step 1: Write the failing test**

Create `packages/platform/test/integration/project-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadProjectContext } from '../../src/services/project-context';

describe('loadProjectContext', () => {
  it('returns the actor and membership for an accessible project', async () => {
    const context = await loadProjectContext({
      firebaseUid: 'firebase-user-1',
      projectId: '00000000-0000-0000-0000-000000000001',
    });

    expect(context.resourceId).toMatch(/^project:/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/platform/test/integration/project-context.test.ts`
Expected: FAIL because the repositories and service do not exist.

**Step 3: Write minimal implementation**

Create `packages/platform/src/services/project-context.ts`:

```ts
export async function loadProjectContext(params: {
  firebaseUid: string;
  projectId: string;
}) {
  return {
    actorUserId: 'resolved-user-id',
    projectId: params.projectId,
    resourceId: `project:${params.projectId}`,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/platform/test/integration/project-context.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/db/repositories packages/platform/src/services/project-context.ts packages/platform/src/services/access-control.ts packages/platform/test/integration/project-context.test.ts
git commit -m "feat: add project context resolution services"
```

### Task 6: Implement Workspace Pathing and Provisioning

**Files:**
- Create: `packages/platform/src/workspace/paths.ts`
- Create: `packages/platform/src/workspace/provisioning.ts`
- Create: `packages/platform/src/workspace/reconciliation.ts`
- Create: `packages/platform/test/unit/workspace-paths.test.ts`
- Create: `packages/platform/test/integration/workspace-provisioning.test.ts`

**Step 1: Write the failing test**

Create `packages/platform/test/unit/workspace-paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildWorkspaceRootPath } from '../../src/workspace/paths';

describe('buildWorkspaceRootPath', () => {
  it('builds a contained workspace path', () => {
    const result = buildWorkspaceRootPath('/tmp/workspaces', 'org-1', 'project-1');
    expect(result).toContain('/tmp/workspaces');
    expect(result).toContain('org_org-1');
    expect(result).toContain('project_project-1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/platform/test/unit/workspace-paths.test.ts`
Expected: FAIL because the workspace path helpers do not exist.

**Step 3: Write minimal implementation**

Create `packages/platform/src/workspace/paths.ts`:

```ts
import { resolve } from 'node:path';

export function buildWorkspaceRootPath(baseRoot: string, orgId: string, projectId: string) {
  return resolve(baseRoot, `org_${orgId}`, `project_${projectId}`);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/platform/test/unit/workspace-paths.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/workspace packages/platform/test/unit/workspace-paths.test.ts packages/platform/test/integration/workspace-provisioning.test.ts
git commit -m "feat: add workspace pathing and provisioning"
```

### Task 7: Implement Workspace Locking

**Files:**
- Create: `packages/platform/src/workspace/locking.ts`
- Create: `packages/platform/test/integration/workspace-locking.test.ts`

**Step 1: Write the failing test**

Create `packages/platform/test/integration/workspace-locking.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createWorkspaceLockService } from '../../src/workspace/locking';

describe('workspace locking', () => {
  it('prevents a second active writer lock', async () => {
    const locks = createWorkspaceLockService();
    await locks.acquire({
      workspaceRootId: 'workspace-1',
      lockType: 'write',
      holder: 'holder-1',
      ttlSeconds: 30,
    });

    await expect(
      locks.acquire({
        workspaceRootId: 'workspace-1',
        lockType: 'write',
        holder: 'holder-2',
        ttlSeconds: 30,
      }),
    ).rejects.toThrow(/lock/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/platform/test/integration/workspace-locking.test.ts`
Expected: FAIL because the lock service does not exist.

**Step 3: Write minimal implementation**

Create `packages/platform/src/workspace/locking.ts`:

```ts
export function createWorkspaceLockService() {
  const active = new Set<string>();

  return {
    async acquire(params: { workspaceRootId: string }) {
      if (active.has(params.workspaceRootId)) {
        throw new Error('workspace lock already exists');
      }
      active.add(params.workspaceRootId);
      return { lockId: params.workspaceRootId };
    },
    async release(lockId: string) {
      active.delete(lockId);
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/platform/test/integration/workspace-locking.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/workspace/locking.ts packages/platform/test/integration/workspace-locking.test.ts
git commit -m "feat: add workspace locking service"
```

### Task 8: Create the Mastra Factory and Default Agent

**Files:**
- Create: `packages/platform/src/mastra/storage.ts`
- Create: `packages/platform/src/mastra/agents/default-agent.ts`
- Create: `packages/platform/src/mastra/create-mastra.ts`
- Create: `packages/platform/test/unit/create-mastra.test.ts`

**Step 1: Write the failing test**

Create `packages/platform/test/unit/create-mastra.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMastra } from '../../src/mastra/create-mastra';

describe('createMastra', () => {
  it('creates a Mastra instance', () => {
    const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');
    expect(mastra).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/platform/test/unit/create-mastra.test.ts`
Expected: FAIL because the Mastra modules do not exist.

**Step 3: Write minimal implementation**

Create `packages/platform/src/mastra/create-mastra.ts`:

```ts
import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';

export function createMastra(connectionString: string) {
  return new Mastra({
    storage: new PostgresStore({
      id: 'mastra-storage',
      connectionString,
    }),
  });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/platform/test/unit/create-mastra.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/mastra packages/platform/test/unit/create-mastra.test.ts
git commit -m "feat: add mastra factory"
```

### Task 9: Implement Request-Resolved Workspace Execution

**Files:**
- Create: `packages/platform/src/workspace/factory.ts`
- Create: `packages/platform/src/workspace/resolver.ts`
- Create: `packages/platform/src/mastra/execution/request-context.ts`
- Create: `packages/platform/src/mastra/execution/execute-agent.ts`
- Create: `packages/platform/test/integration/execute-agent.test.ts`

**Step 1: Write the failing test**

Create `packages/platform/test/integration/execute-agent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { executeProjectAgent } from '../../src/mastra/execution/execute-agent';

describe('executeProjectAgent', () => {
  it('derives a project-scoped resource id', async () => {
    const result = await executeProjectAgent({
      projectId: 'project-1',
      actorUserId: 'user-1',
      agentId: 'default',
      message: 'hello',
    });

    expect(result.resourceId).toBe('project:project-1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/platform/test/integration/execute-agent.test.ts`
Expected: FAIL because the execution wrapper does not exist.

**Step 3: Write minimal implementation**

Create `packages/platform/src/mastra/execution/execute-agent.ts`:

```ts
export async function executeProjectAgent(params: {
  projectId: string;
  actorUserId: string;
  agentId: string;
  message: string;
}) {
  return {
    resourceId: `project:${params.projectId}`,
    output: null,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/platform/test/integration/execute-agent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/workspace/factory.ts packages/platform/src/workspace/resolver.ts packages/platform/src/mastra/execution packages/platform/test/integration/execute-agent.test.ts
git commit -m "feat: add request-resolved agent execution"
```

### Task 10: Build the Hono App Shell and Public Routes

**Files:**
- Create: `packages/app/src/server/factory.ts`
- Create: `packages/app/src/server/app.ts`
- Create: `packages/app/src/routes/health.ts`
- Create: `packages/app/src/routes/me.ts`
- Create: `packages/app/test/integration/app-health.test.ts`

**Step 1: Write the failing test**

Create `packages/app/test/integration/app-health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/factory';

describe('app health', () => {
  it('serves the health endpoint', async () => {
    const app = await createApp();
    const response = await app.request('/health');

    expect(response.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/app/test/integration/app-health.test.ts`
Expected: FAIL because the Hono app factory does not exist.

**Step 3: Write minimal implementation**

Create `packages/app/src/server/factory.ts`:

```ts
import { Hono } from 'hono';

export async function createApp() {
  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));
  return app;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/app/test/integration/app-health.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/app/src/server/factory.ts packages/app/src/server/app.ts packages/app/src/routes/health.ts packages/app/src/routes/me.ts packages/app/test/integration/app-health.test.ts
git commit -m "feat: add hono app shell"
```

### Task 11: Add Protected Middleware and Project Routes

**Files:**
- Create: `packages/app/src/middleware/request-id.ts`
- Create: `packages/app/src/middleware/errors.ts`
- Create: `packages/app/src/routes/projects.ts`
- Create: `packages/app/test/integration/project-routes.test.ts`

**Step 1: Write the failing test**

Create `packages/app/test/integration/project-routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/factory';

describe('project routes', () => {
  it('rejects missing auth on protected routes', async () => {
    const app = await createApp();
    const response = await app.request('/api/projects/project-1/workspace');

    expect(response.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/app/test/integration/project-routes.test.ts`
Expected: FAIL because the protected routes and middleware do not exist.

**Step 3: Write minimal implementation**

Create `packages/app/src/routes/projects.ts`:

```ts
import { Hono } from 'hono';

export const projectsRoutes = new Hono();

projectsRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

projectsRoutes.get('/:projectId/workspace', (c) => {
  return c.json({ projectId: c.req.param('projectId') });
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/app/test/integration/project-routes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/app/src/middleware packages/app/src/routes/projects.ts packages/app/test/integration/project-routes.test.ts
git commit -m "feat: add protected project routes"
```

### Task 12: Mount Mastra and Add Agent Execution Route

**Files:**
- Modify: `packages/app/src/server/factory.ts`
- Create: `packages/app/src/routes/admin.ts`
- Create: `packages/app/test/integration/agent-run.test.ts`

**Step 1: Write the failing test**

Create `packages/app/test/integration/agent-run.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/factory';

describe('agent run route', () => {
  it('returns 401 when no bearer token is provided', async () => {
    const app = await createApp();
    const response = await app.request('/api/projects/project-1/agent/run', {
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/app/test/integration/agent-run.test.ts`
Expected: FAIL because the route is not mounted.

**Step 3: Write minimal implementation**

Modify `packages/app/src/server/factory.ts` to mount the `projectsRoutes` sub-app and a `POST /api/projects/:projectId/agent/run` handler that delegates to the platform execution wrapper.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/app/test/integration/agent-run.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/app/src/server/factory.ts packages/app/src/routes/admin.ts packages/app/test/integration/agent-run.test.ts
git commit -m "feat: add agent execution route"
```

### Task 13: Add Audit Logging, Readiness, and Reconciliation

**Files:**
- Create: `packages/platform/src/services/audit.ts`
- Create: `packages/platform/src/workspace/reconciliation.ts`
- Create: `packages/app/test/integration/readiness.test.ts`
- Create: `packages/platform/test/integration/reconciliation.test.ts`

**Step 1: Write the failing test**

Create `packages/app/test/integration/readiness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/factory';

describe('readiness', () => {
  it('returns readiness state', async () => {
    const app = await createApp();
    const response = await app.request('/ready');

    expect([200, 503]).toContain(response.status);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/app/test/integration/readiness.test.ts`
Expected: FAIL because readiness and reconciliation flows do not exist.

**Step 3: Write minimal implementation**

Create an audit service and a readiness service that checks:

- Postgres connectivity
- workspace root availability
- optional reconciliation status

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/app/test/integration/readiness.test.ts packages/platform/test/integration/reconciliation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/services/audit.ts packages/platform/src/workspace/reconciliation.ts packages/app/test/integration/readiness.test.ts packages/platform/test/integration/reconciliation.test.ts
git commit -m "feat: add readiness and reconciliation flows"
```

### Task 14: Add Editor Binding and Policy Snapshots

**Files:**
- Create: `packages/platform/src/mastra/editor.ts`
- Modify: `packages/platform/src/db/repositories/workspace-bindings.ts`
- Create: `packages/platform/test/integration/editor-bindings.test.ts`

**Step 1: Write the failing test**

Create `packages/platform/test/integration/editor-bindings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getActiveWorkspaceBinding } from '../../src/db/repositories/workspace-bindings';

describe('workspace bindings', () => {
  it('returns the active agent ref and version', async () => {
    const binding = await getActiveWorkspaceBinding('project-1');
    expect(binding?.activeAgentRef).toBeDefined();
    expect(binding?.activeAgentVersion).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/platform/test/integration/editor-bindings.test.ts`
Expected: FAIL because the binding repository is incomplete.

**Step 3: Write minimal implementation**

Implement the active workspace binding repository and editor integration points so a project resolves:

- active agent ref
- active agent version
- policy snapshot

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/platform/test/integration/editor-bindings.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/platform/src/mastra/editor.ts packages/platform/src/db/repositories/workspace-bindings.ts packages/platform/test/integration/editor-bindings.test.ts
git commit -m "feat: add editor bindings"
```

### Task 15: Finish with End-to-End Coverage and Developer Workflow

**Files:**
- Create: `packages/app/test/integration/e2e-project-flow.test.ts`
- Modify: `package.json`
- Modify: `packages/app/package.json`
- Modify: `packages/platform/package.json`
- Modify: `.env.example`

**Step 1: Write the failing test**

Create `packages/app/test/integration/e2e-project-flow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('project flow', () => {
  it('provisions a workspace and executes a project-scoped agent flow', async () => {
    expect(true).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/app/test/integration/e2e-project-flow.test.ts`
Expected: FAIL because the end-to-end flow is not implemented.

**Step 3: Write minimal implementation**

Implement the full happy-path test harness:

- create org, user, membership, and project fixtures
- provision a workspace
- execute a protected agent request
- assert `resourceId = project:<projectId>`
- assert workspace directories exist
- assert audit event was recorded

**Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS across unit, integration, and end-to-end suites.

**Step 5: Commit**

```bash
git add packages/app/test/integration/e2e-project-flow.test.ts package.json packages/app/package.json packages/platform/package.json .env.example
git commit -m "test: add end-to-end project flow coverage"
```

Plan complete and saved to `docs/plans/2026-04-09-hono-workspace-implementation.md`. Two execution options:

**1. Local Execution (this session)** - implement the plan directly in this session with TDD checkpoints and verification after each slice

**2. Parallel Session (separate)** - open a separate execution session and use the plan as the implementation handoff

If you want execution in this session, the next step is to start Task 1 and actually scaffold the repository.
