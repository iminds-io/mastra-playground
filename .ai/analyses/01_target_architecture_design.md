# Target Architecture Design Doc

## Project

Hono + Mastra Server Adapter + Firebase Auth + Postgres Storage + Editor + Local Filesystem Workspace

## Status

Approved target architecture for greenfield implementation

## Audience

Backend engineers, platform engineers, AI engineers, security reviewers, and DevOps/SRE

## 1. Executive Summary

This system will be implemented as a small `pnpm` monorepo with two primary packages:

- `packages/app`: the Hono HTTP server and route composition layer
- `packages/platform`: shared platform logic for auth verification, Postgres access, Mastra wiring, workspace resolution, provisioning, locking, and audit flows

The application uses **Hono** as the HTTP server, **Mastra** as the agent/runtime framework, **Firebase Authentication** as the identity provider, **Postgres** as the durable control-plane and runtime persistence layer, and **Mastra Workspaces** backed by the **local filesystem** for live file operations and command execution.

The core design decision is to split the system into two planes:

- **Control plane**: identity, routing, tenancy, workspace bindings, versioned configuration, memory/workflow persistence, lock state, audit metadata, and operational status
- **Execution plane**: the working directory used by agents to read and write files and execute commands

Postgres owns the control plane. The local filesystem owns the execution plane.

This aligns with how Mastra is intended to be used:

- `PostgresStore` persists Mastra-owned runtime state such as threads, messages, workflows, scores, and observability artifacts
- the host application provides and governs the live workspace via `Workspace`, `LocalFilesystem`, and `LocalSandbox`

## 2. Goals

1. Build a Hono-hosted Mastra server inside the main Node application server.
2. Authenticate protected requests with Firebase ID tokens.
3. Enforce tenant isolation for threads, memory, agents, and workspace access.
4. Persist Mastra runtime state in Postgres.
5. Use Mastra Editor as the runtime-editable configuration layer without making it the tenancy system of record.
6. Use a local filesystem workspace for live file and shell operations.
7. Support local development via Dockerized Postgres and a server-owned workspace root on disk.
8. Support a clean path from local development to production.
9. Keep the implementation modular so auth, workspace storage, and execution policy can evolve without rewriting the app shell.

## 3. Non-Goals

1. Designing a custom Mastra server adapter.
2. Replacing Firebase Authentication with a bespoke auth system.
3. Storing live workspace file contents directly in Postgres.
4. Building a multi-service distributed control plane in the first release.
5. Building a remote build farm or cloud execution fabric in the first release.

## 4. Architectural Principles

### 4.1 Plane separation

- Postgres stores durable application state and Mastra runtime metadata.
- Workspaces store files and expose command execution.
- Editor stores versioned configuration, not live file trees.

### 4.2 Tenant safety first

- Authentication alone is insufficient.
- Middleware must derive the effective tenant principal from verified Firebase identity and persisted membership state.
- Clients must never be allowed to supply trusted `resourceId`, `orgId`, `projectId`, or workspace root paths.

### 4.3 Runtime workspaces are resolved, not hard-coded

- Workspaces are constructed from workspace bindings at request time.
- The effective workspace root is derived from the authenticated principal and project binding.
- Static global workspace paths are only acceptable for diagnostics, never for tenant execution.

### 4.4 Single-writer semantics per workspace

- Mutating flows should acquire a Postgres-backed workspace lock.
- Read-only flows should avoid lock contention when safe.
- Filesystem-level conventions are not sufficient as the primary concurrency control layer.

### 4.5 Production-ready persistence

- Mastra runtime storage uses Postgres via `PostgresStore`.
- App tenancy and workspace orchestration also use Postgres.
- The local filesystem is treated as durable only when backed by a durable volume.

## 5. Monorepo Design

### 5.1 Root structure

```text
hono-workspace/
  .ai/
    analyses/
      01_target_architecture_design.md
  docs/
    plans/
  docker/
    postgres/
      init/
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.workspace.ts
  .env
  .env.example
  .gitignore
  packages/
    app/
      package.json
      tsconfig.json
      src/
        index.ts
        server/
          app.ts
          env.ts
          factory.ts
        middleware/
          request-id.ts
          errors.ts
        routes/
          health.ts
          me.ts
          projects.ts
          admin.ts
      test/
        integration/
        unit/
    platform/
      package.json
      tsconfig.json
      src/
        auth/
          firebase-token-verifier.ts
          claims.ts
          jwks-cache.ts
        db/
          client.ts
          migrate.ts
          schema.ts
          repositories/
            organizations.ts
            users.ts
            memberships.ts
            projects.ts
            workspace-roots.ts
            workspace-bindings.ts
            workspace-locks.ts
            workspace-events.ts
            provisioning-jobs.ts
        mastra/
          create-mastra.ts
          storage.ts
          editor.ts
          agents/
            default-agent.ts
          execution/
            execute-agent.ts
            request-context.ts
        services/
          access-control.ts
          audit.ts
          project-context.ts
        workspace/
          paths.ts
          policy.ts
          resolver.ts
          factory.ts
          provisioning.ts
          locking.ts
          reconciliation.ts
      test/
        integration/
        unit/
```

### 5.2 Package ownership

#### `packages/app`

Responsibilities:

- create the Hono app
- register HTTP middleware
- mount public and protected routes
- mount Mastra via `@mastra/hono`
- translate platform failures into HTTP responses

Non-responsibilities:

- direct SQL access
- direct workspace path generation
- direct Firebase token cryptographic verification

#### `packages/platform`

Responsibilities:

- verify Firebase ID tokens
- resolve user, org, and project context
- persist tenancy and workspace metadata
- manage provisioning, locking, and reconciliation
- create `Mastra` and `Workspace` instances
- execute agents against request-resolved workspaces

## 6. Technology Choices

### 6.1 Package manager

Use `pnpm` for workspace-native dependency management and efficient monorepo installs.

### 6.2 Runtime

Use modern Node.js with ESM TypeScript.

### 6.3 Server

Use `hono` and `@mastra/hono`.

### 6.4 Database

Use Postgres in Docker for local development. Use one database with:

- Mastra runtime tables managed by `PostgresStore`
- app-owned tables managed by explicit migrations

### 6.5 Testing

Use `vitest` for unit and integration tests and `supertest` or Hono request invocation for HTTP assertions.

### 6.6 Data access

Prefer a lightweight SQL client and explicit SQL or a thin query builder. Do not introduce a heavyweight ORM before the schema and lifecycle stabilize.

## 7. High-Level Architecture

```text
[Browser / API Consumer / Studio]
        |
        | Firebase sign-in -> ID token
        v
[Hono App: packages/app]
  - public routes
  - protected app routes
  - Mastra route registration
        |
        v
[Platform Layer: packages/platform]
  - Firebase token verifier
  - project access control
  - request-context derivation
  - workspace resolution
  - workspace provisioning/locking
  - audit logging
        |
        +--> [Postgres]
        |      - Mastra PostgresStore data
        |      - app-owned tenancy tables
        |      - lock rows
        |      - audit events
        |
        +--> [Mastra Runtime]
        |      - agents
        |      - workflows
        |      - editor
        |      - request context
        |
        +--> [Runtime Workspace]
               - LocalFilesystem(basePath)
               - LocalSandbox(workingDirectory)
               - tool policy
```

## 8. Auth Design

### 8.1 Verified identity source

Protected requests must present:

```http
Authorization: Bearer <firebase-id-token>
```

### 8.2 Important credential note

The provided `FIREBASE_TOKEN` is a Firebase Web API key, not a Firebase Admin credential. It must not be treated as a server secret for privileged verification flows.

The server must verify Firebase ID tokens using Google Secure Token public signing certificates and validate:

- `aud === FIREBASE_PROJECT_ID`
- `iss === "https://securetoken.google.com/<FIREBASE_PROJECT_ID>"`
- token expiry and signature

The API key may still be used by clients in browser flows, but the server trust decision is based on the ID token and public key verification.

### 8.3 Auth components

```ts
export interface VerifiedFirebasePrincipal {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  authTime: number | null;
  rawClaims: Record<string, unknown>;
}

export interface FirebaseTokenVerifier {
  verifyIdToken(idToken: string): Promise<VerifiedFirebasePrincipal>;
}
```

### 8.4 App authorization

After verification:

1. resolve or upsert `users` row by `firebase_uid`
2. resolve membership for the requested `projectId`
3. derive effective tenant principal as `project:{projectId}`
4. attach actor and project context to the request

## 9. Tenant and Resource Model

### 9.1 Identity root

Firebase user is the identity root.

### 9.2 Collaboration boundary

Default to project-scoped workspaces with org ownership:

- `org` is the billing and administrative boundary
- `project` is the workspace and collaboration boundary
- `user` is the acting human

### 9.3 Mastra resource ownership

Use:

```text
resourceId = project:<projectId>
```

This aligns Mastra thread and memory isolation with the shared workspace boundary.

## 10. Postgres Schema

### 10.1 Mastra storage

Use `PostgresStore` as the Mastra storage provider for:

- threads
- messages
- memory
- workflows
- scores
- observability
- editor/runtime-backed Mastra domains supported by the library

### 10.2 App-owned tables

#### `organizations`

```sql
create table organizations (
  id uuid primary key,
  name text not null,
  firebase_project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

#### `users`

```sql
create table users (
  id uuid primary key,
  firebase_uid text not null unique,
  email text,
  display_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

#### `organization_memberships`

```sql
create table organization_memberships (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
```

#### `projects`

```sql
create table projects (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  slug text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
```

#### `workspace_roots`

```sql
create table workspace_roots (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  project_id uuid not null references projects(id),
  storage_type text not null,
  root_path text not null,
  status text not null,
  filesystem_provider_type text not null,
  sandbox_provider_type text not null,
  is_read_only boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workspace_roots_active_project_idx
  on workspace_roots(project_id)
  where archived_at is null;
```

#### `workspace_bindings`

```sql
create table workspace_bindings (
  id uuid primary key,
  project_id uuid not null references projects(id),
  workspace_root_id uuid not null references workspace_roots(id),
  editor_workspace_ref text,
  active_agent_ref text not null,
  active_agent_version text not null,
  policy_json jsonb not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workspace_bindings_active_project_idx
  on workspace_bindings(project_id)
  where archived_at is null;
```

#### `workspace_locks`

```sql
create table workspace_locks (
  id uuid primary key,
  workspace_root_id uuid not null references workspace_roots(id),
  lock_type text not null,
  holder text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index workspace_locks_lookup_idx
  on workspace_locks(workspace_root_id, expires_at);
```

#### `workspace_events`

```sql
create table workspace_events (
  id uuid primary key,
  workspace_root_id uuid not null references workspace_roots(id),
  event_type text not null,
  actor_user_id uuid references users(id),
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

#### `workspace_provisioning_jobs`

```sql
create table workspace_provisioning_jobs (
  id uuid primary key,
  workspace_root_id uuid not null references workspace_roots(id),
  requested_by uuid references users(id),
  status text not null,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 10.3 Why these app tables are necessary

Mastra storage is necessary but not sufficient for:

- tenancy boundaries
- role-aware project access checks
- workspace path resolution
- lifecycle status and archival
- lock ownership
- provisioning and audit history

These are application concerns and should remain in the app schema even when Mastra storage is also using Postgres.

## 11. Workspace Design

### 11.1 Canonical root path

Use a server-owned absolute base root such as:

```text
<repo>/var/workspaces/
```

Within that:

```text
var/workspaces/
  org_<orgId>/
    project_<projectId>/
      repo/
      docs/
      output/
      tmp/
      .workspace-meta/
```

### 11.2 Path invariants

- all resolved paths must be absolute
- all resolved paths must remain under the configured base root
- no client input may directly influence raw absolute paths
- directory creation must be idempotent

### 11.3 Runtime workspace factory

```ts
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';

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
    bm25: true,
    autoIndexPaths: ['/docs', '/repo'],
  });

  await workspace.init();
  return workspace;
}
```

### 11.4 Tool policy

Start with a conservative policy:

- allow file listing, reading, and search
- allow writes for bound workspaces
- disable delete by default
- gate command execution behind project policy and role-aware checks
- keep sandbox env minimal

## 12. Provisioning Design

### 12.1 Lifecycle

1. create org, user, membership, and project rows
2. create `workspace_roots` row with `status = 'provisioning'`
3. compute canonical root path
4. create directories on disk
5. write server-owned metadata if needed
6. create `workspace_bindings` row
7. write `workspace_events`
8. mark workspace `ready`
9. mark provisioning job `completed`

### 12.2 Idempotency

Provisioning must tolerate retries:

- if directories already exist, verify shape and continue
- if an active binding already exists, return the existing binding
- if a job partially completed, resume or reconcile rather than duplicating

### 12.3 Recovery

If DB says `ready` but the directory is missing:

- mark the workspace unhealthy
- block mutating agent execution
- surface `503` or domain-specific reconciliation errors

## 13. Locking Design

### 13.1 Why Postgres locks first

Postgres-backed locks are easier to test, inspect, and audit than ad hoc filesystem locks.

### 13.2 Lock model

For mutating operations:

- insert a short-lived row into `workspace_locks`
- reject when another unexpired lock exists
- release on success or failure
- support expiry-based cleanup for crash recovery

### 13.3 Interface

```ts
export interface WorkspaceLockService {
  acquire(params: {
    workspaceRootId: string;
    lockType: 'write' | 'command';
    holder: string;
    ttlSeconds: number;
  }): Promise<{ lockId: string }>;
  release(lockId: string): Promise<void>;
}
```

## 14. Mastra Integration

### 14.1 Preferred pattern

Use a shared `Mastra` instance plus request-resolved execution wrappers.

This means:

- one `Mastra` instance configured with `PostgresStore`
- request context derived by app middleware
- per-request workspace resolution performed by platform services
- agent execution performed through a wrapper that injects the resolved workspace and request context

### 14.2 Mastra factory

```ts
import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { createDefaultAgent } from './agents/default-agent';

export function createMastra(connectionString: string) {
  const storage = new PostgresStore({
    id: 'mastra-storage',
    connectionString,
  });

  return new Mastra({
    storage,
    agents: {
      default: createDefaultAgent(),
    },
    server: {
      middleware: [],
    },
  });
}
```

### 14.3 Request-resolved execution

```ts
export async function executeProjectAgent(params: {
  projectId: string;
  actorUserId: string;
  agentId: string;
  message: string;
}) {
  const projectContext = await loadProjectContext(params.projectId, params.actorUserId);
  const workspace = await resolveWorkspaceForProject(projectContext.projectId);
  const resourceId = `project:${projectContext.projectId}`;

  return runAgentWithWorkspace({
    agentId: params.agentId,
    workspace,
    resourceId,
    actor: projectContext.actor,
    message: params.message,
  });
}
```

### 14.4 Editor strategy

Use Mastra Editor for versioned runtime-editable config, but keep the app DB as the source of truth for:

- which project is bound to which active agent
- which workspace root is active
- which policy snapshot applies

## 15. Hono Integration

### 15.1 App shell

```ts
import { Hono } from 'hono';
import { MastraServer } from '@mastra/hono';
import { createAppDependencies } from '@hono-workspace/platform';

export async function createApp() {
  const deps = await createAppDependencies();
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/ready', async (c) => {
    const ready = await deps.health.readiness();
    return c.json(ready, ready.ok ? 200 : 503);
  });

  app.route('/api', deps.routes.api);

  const server = new MastraServer({
    app,
    mastra: deps.mastra,
  });

  await server.init();

  return app;
}
```

### 15.2 Protected routes

Recommended routes:

- `GET /health`
- `GET /ready`
- `GET /api/me`
- `GET /api/projects/:projectId/workspace`
- `POST /api/projects/:projectId/provision-workspace`
- `POST /api/projects/:projectId/agent/run`
- `POST /api/projects/:projectId/workspace/commands`
- `PATCH /api/admin/projects/:projectId/agent-binding`
- `PATCH /api/admin/projects/:projectId/workspace-binding`
- `POST /api/admin/projects/:projectId/archive`

## 16. Request Flow

### 16.1 Authenticated request flow

1. client acquires Firebase ID token
2. request hits Hono with bearer token
3. auth middleware verifies token and resolves local user
4. project middleware checks membership and role
5. middleware derives:
   - actor user id
   - org id
   - project id
   - `resourceId = project:<projectId>`
6. platform resolves workspace binding and workspace root
7. lock is acquired for mutating operations
8. Mastra agent executes against the resolved workspace
9. Mastra persists runtime state to Postgres
10. app writes audit and provisioning events as needed

## 17. Failure Modes

### 17.1 Valid token, no project access

Return `403` without leaking workspace existence.

### 17.2 Binding exists, workspace directory missing

Return `503` and mark the workspace unhealthy.

### 17.3 Postgres unavailable

Fail readiness, reject mutating routes, and fail closed for protected flows.

### 17.4 Sandbox unavailable

Reject command execution, optionally allow read-only workspace inspection.

### 17.5 Expired or invalid lock state

Clear expired locks before acquisition and record lock conflicts in logs or events.

## 18. Local Development Design

### 18.1 Docker Postgres

Use `docker-compose.yml` with a local Postgres service:

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: hono_workspace
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d hono_workspace"]
      interval: 5s
      timeout: 5s
      retries: 20
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 18.2 Env contract

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hono_workspace
WORKSPACE_ROOT=/absolute/path/to/hono-workspace/var/workspaces
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_TOKEN=your-firebase-web-api-key
```

### 18.3 Developer scripts

```json
{
  "scripts": {
    "dev:db": "docker compose up -d postgres",
    "dev:db:down": "docker compose down",
    "db:migrate": "pnpm --filter @hono-workspace/platform db:migrate",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "pnpm --filter @hono-workspace/app dev"
  }
}
```

## 19. TDD Strategy

### 19.1 Unit tests

Write tests first for:

- JWT claim validation
- Secure Token key selection and caching
- workspace path containment
- policy evaluation
- lock acquisition and expiry behavior
- provisioning idempotency decisions

### 19.2 Integration tests

Write tests against real Postgres and the app shell for:

- user upsert by Firebase UID
- project access checks
- workspace provisioning lifecycle
- workspace binding resolution
- lock conflicts
- protected route status codes

### 19.3 End-to-end tests

Write focused E2E coverage for:

- provision workspace for a project
- run an authenticated agent request against the correct workspace
- deny command execution when policy or role disallows it

## 20. Implementation Recommendations

### 20.1 Sequence

1. scaffold monorepo root and package boundaries
2. add Docker Postgres and migration pipeline
3. implement app schema and repository layer
4. implement Firebase token verification
5. implement access-control middleware and request context
6. implement workspace pathing, provisioning, and locking
7. implement Mastra storage and request-resolved execution
8. mount Hono and Mastra routes
9. add editor binding support
10. add audit, readiness, and reconciliation flows

### 20.2 Keep concrete seams only

Abstract only these boundaries in the first version:

- auth verifier
- workspace resolver/factory
- lock service
- audit service
- repository interfaces only where they materially improve testability

Do not build generic provider registries before the first working system exists.

## 21. Handoff Notes

- This architecture is intentionally concrete enough to scaffold immediately.
- The schema split is aligned with Mastra’s storage model: Mastra owns runtime state, the application owns tenancy and workspace orchestration.
- The provided `FIREBASE_TOKEN` should be treated as a client API key, not as an admin secret.
- There is currently no Git repository initialized in this workspace, so Git-based checkpoints and commits are not yet available.
