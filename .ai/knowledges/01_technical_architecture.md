# Technical Architecture — hono-workspace

**Status:** Living document. Reflects the current worktree as of 2026-04-23.
**Scope:** Complete technical picture: packages, runtime targets, data flow, deployment, testing, and known gotchas.

---

## 1. One-paragraph overview

`hono-workspace` is a monorepo that exposes a Hono-based HTTP API for a Mastra-powered AI workspace. The backend runs as either a Node.js development server (`packages/app`) or a Cloudflare Worker (`packages/worker`) — both consume runtime-agnostic business logic from `packages/platform`. Agents and workflows run via Mastra with a PostgreSQL store on Neon, a workspace filesystem backed by either local disk (Node.js) or Cloudflare R2 (Worker), and runtime prompt/tool overrides via `@mastra/editor` (admin-gated). Two HTTP surfaces are exposed: a Mastra-native surface under `/api/mastra/*` (auto-registered agents, workflows, editor CRUD), and hand-written domain routes under `/api/projects/:projectId/...` for business-scoped operations. The frontend is a React + Vite app (`packages/web`) that consumes shared UI primitives from `packages/ui` and is deployed independently from the API. Tests span unit, integration, E2E, and smoke layers; the current unit suite reports 122 tests, with integration/E2E/smoke coverage running against real infrastructure — Neon branches per test run, real Firebase tokens, and real R2 prefixes.

---

## 2. Monorepo layout

```
hono-workspace/
├── packages/
│   ├── platform/        # Runtime-agnostic business logic (database, workspace, Mastra agents)
│   ├── app/             # Node.js HTTP server — local development target
│   ├── worker/          # Cloudflare Worker — production target deployed to Workers
│   ├── ui/              # Shared React UI primitives + styles
│   └── web/             # React + Vite frontend (deployed separately)
├── .ai/
│   ├── tasks/           # Numbered plan + completion docs per major task
│   ├── knowledges/      # Living architecture/reference docs (this file lives here)
│   └── analyses/        # Historical design analyses
├── docs/plans/          # Legacy implementation archive (pre-.ai/tasks convention)
├── vitest.unit.config.ts
├── vitest.integration.config.ts
├── docker-compose.yml   # Postgres for local Node.js dev
├── .env                 # Local secrets (gitignored)
└── .env.example         # Canonical env var list
```

Package manager: **pnpm 10.16.0** via `pnpm-workspace.yaml`.
Language: **TypeScript** (ES2023, strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
Test runner: **Vitest 4.1.4**.

---

## 3. Package responsibilities

### `packages/platform` — `@hono-workspace/platform`

The business-logic core. Contains every domain operation the API performs. Runtime-agnostic at the HTTP/filesystem boundary: no imports from `@hono/node-server`, no direct `node:fs` writes in hot paths, repository queries go through the injectable database context, and workspace construction is supplied by entry points. Mastra storage intentionally uses `@neondatabase/serverless` so the same storage factory works in Cloudflare Workers.

**Key modules**

| Module | Responsibility |
|---|---|
| `auth/claims`, `auth/firebase-token-verifier`, `auth/jwks-cache` | Verify Firebase ID tokens. Fetches Google's x509 certificates and caches them per worker instance. |
| `db/context` | Injectable pool holder. `setDatabasePool()` / `getDatabasePool()`. |
| `db/repositories/*` | Thin query wrappers for `organizations`, `users`, `memberships`, `projects`, `project-channels`, `channel-threads`, `workspace-roots`, `workspace-bindings`. Each function calls `getDatabasePool().query(...)`. |
| `platform-deps` | Explicit runtime dependency types. `PlatformDeps` carries `{ mastra, workspaceFactory }`; entry points construct these dependencies and pass them into principal-flow services instead of relying on a global workspace factory. |
| `mastra/create-mastra` | `createMastra(connectionString, agentConfig)` — returns a Mastra instance with registered agents/workflows, Postgres storage, and a registered `MastraEditor`. Agents and workflows come from the local registries. |
| `mastra/storage` | `createMastraStorage()` + `initMastraSchema()` helper. Injects a Neon-backed Pool into `@mastra/pg`'s `PostgresStore`. |
| `mastra/agents/registry` | Central code-defined agent registry consumed by `createMastra()`. Keeps new specialists/supervisors out of the Mastra factory import list. |
| `mastra/workflows/registry` | Central code-defined workflow registry consumed by `createMastra()`. |
| `mastra/agents/project-agent` | Original chat-style agent. Uses OpenRouter for the model, binds `workspace` from `RequestContext`, and registers the full read/list/write workspace toolkit. `Memory` is configured with `observationalMemory: false` for CF compatibility. |
| `mastra/agents/summarizer` | Second agent that summarizes workspace documents. Uses the same Memory/workspace binding pattern but registers only the read-only toolkit. |
| `mastra/agents/workspace-reviewer` | Read-only specialist that reviews workspace files for implementation risks, missing tests, stale docs, and architecture gaps. Intended for supervisor delegation. |
| `mastra/agents/workspace-supervisor` | Read-only supervisor agent that coordinates `summarizer`, `workspaceReviewer`, and safe workflows through Mastra's native supervisor-agent behavior (`generate` / `stream`, not deprecated `.network()`). |
| `mastra/tools/workspace-tools` | `readFileTool`, `listDirTool`, `writeFileTool` — Mastra `Tool` definitions that call through the request's `workspace` filesystem. Exports `workspaceReadOnlyToolkit` for summarization and `workspaceToolkit` for the project agent. |
| `mastra/workflows/ingest-pipeline` | Two-step workflow: list docs → summarize. Composed via `createWorkflow({ ... }).then(...).commit()`. Registered in `createMastra()`. |
| `mastra/execution/build-execution-context` | Shared builder for `{ requestContext, threadId, resourceId }`. Seeds `projectId`, `organizationId`, `role`, `workspaceRootPath`, and `workspace` onto `RequestContext`. Used by `chat`, `execute-agent`, and `summarization`. |
| `mastra/execution/execute-agent` | Orchestrates a project agent run: resolves project context, builds the runtime workspace, sets `RequestContext`, calls `agent.generate()`. |
| `mastra/execution/request-context` | `ProjectAgentRequestContext` type + seeding helpers used by `build-execution-context`. |
| `mastra/version` | Agent version targeting helpers. `parseAgentVersionFromQuery(source)` reads `?versionId=` / `?status=` from a query source (URLSearchParams or anything with `.get(name): string | null`). `getAgentWithVersion(mastra, id, version?)` is **async** — it awaits `mastra.getAgentById(id, version)` (which returns `Promise<Agent>`) and falls through to the sync `mastra.getAgent(id)` when no version is set. |
| `services/access-control` | Throws `AccessDeniedError` for authorization failures. |
| `services/audit` | Records `workspace_events` rows for control-plane observability. |
| `services/chat` | High-level chat operations: create channels/threads, post messages, list feeds, stream SSE replies. |
| `services/dev-bootstrap` | `bootstrapProjectForPrincipal()` — one-shot: creates org, user, membership, project, default channel, and provisions workspace. |
| `services/project-context` | `loadProjectContext()` — authorization query that joins user → membership → project. Throws `AccessDeniedError` if the user has no role on the project. |
| `services/projects` | `listAccessibleProjectsForPrincipal()`. |
| `services/summarization` | Tier B surface for the summarizer agent. `summarizeProjectDocsForPrincipal(input, { mastra, workspaceFactory, version? })` authorizes the caller, resolves the workspace, builds an execution context, awaits `getAgentWithVersion`, and calls `.generate()`. |
| `services/supervisor` | Tier B surface for the workspace supervisor. `runWorkspaceSupervisorForPrincipal(input, { mastra, workspaceFactory, version? })` authorizes the caller, resolves the workspace, builds execution context, and calls the supervisor with capped delegation options. |
| `workspace/resolver` | `resolveWorkspaceForProject(projectId, { workspaceFactory })` — reads the project's active `workspace_roots` and `workspace_bindings` rows, then produces a runtime `Workspace` via the supplied factory. |
| `workspace/locking` | DB-backed mutex via the `workspace_locks` table. |
| `workspace/paths` | Path composition + containment checks. |
| `workspace/provisioning` | Creates `workspace_roots` + `workspace_bindings` rows. Takes `workspaceRoot` as a parameter (NOT read from env). |
| `workspace/reconciliation` | Verifies the workspace is reachable via an explicitly supplied workspace factory and marks the root `error` if it is not. |

**Subpath export: `@hono-workspace/platform/node`**

Exports `pool` from `db/client.ts`. This path is for **Node.js-only consumers** (the `packages/app` server + migration scripts). Importing it triggers `dotenv.config()` and creates a `pg.Pool` at module load — operations that crash a CF Worker bundle.

**Dependencies (runtime):**

- `@mastra/core@1.25.0`, `@mastra/memory@1.15.1`, `@mastra/pg@1.9.1` — Mastra framework
- `@mastra/editor@0.7.16` — registered in `createMastra()` so the editor's `/stored/*` routes are auto-mounted by `MastraServer`. Requires `Agent.__fork()` which landed in `@mastra/core@1.25.0` — older core versions cause a runtime `TypeError: agent.__fork is not a function` when loading stored overrides.
- `@openrouter/ai-sdk-provider` — LLM client
- `pg` — Node.js-only Postgres driver (used by `db/client.ts`)
- `jose` — Firebase ID token verification
- `zod` — schema validation
- `dotenv` — Node.js env loading

**Dependencies (runtime/test support):**

- `@neondatabase/serverless` — imported by `mastra/storage` for the Neon WebSocket `Pool`; also used by the Worker HTTP adapter and integration/E2E test helpers.

### `packages/app` — `@hono-workspace/app`

The Node.js local server target. Entry point: `packages/app/src/index.ts`. Uses `@hono/node-server` to serve on port 3000.

Key files:
- `src/index.ts` — boots the Hono app via `createApp()` from factory.
- `src/server/factory.ts` — route registration, Mastra server mount, auth middleware, SSE streaming.
- `src/middleware/auth.ts` — Hono middleware wrapping Firebase token verification.
- `src/routes/*` — health, me, projects route groups.
- `test/integration/*.integration.test.ts` — integration tests (10 test files).

Uses a local `createLocalWorkspaceFactory()` in `src/server/factory.ts` to construct `LocalFilesystem` + `LocalSandbox` workspaces, then passes `{ mastra, workspaceFactory }` explicitly into platform services. Database connects via `@hono-workspace/platform/node`'s `pool` (pg.Pool against docker-compose Postgres by default).

### `packages/worker` — `@hono-workspace/worker`

The Cloudflare Worker deployment target. Entry point: `packages/worker/src/index.ts`. Exported as `default { fetch }` — native CF Worker pattern.

**Key differences from `packages/app`:**

| Concern | `packages/app` (Node) | `packages/worker` (CF) |
|---|---|---|
| HTTP adapter | `@hono/node-server` | Native `export default app` (Hono supports Workers natively) |
| Database | `pg.Pool` against Postgres via `@hono-workspace/platform/node` | Per-request **Neon HTTP adapter** for our repos, per-request **Neon WebSocket `Pool`** for Mastra |
| Workspace | `LocalFilesystem` at `$WORKSPACE_ROOT` | `@mastra/s3` with R2 endpoint and per-project prefix |
| Env loading | `dotenv` reads `.env` | CF Worker `env` binding; `.dev.vars` for local `wrangler dev` |
| Firebase JWKS cache | Module-scoped singleton across all requests | Module-scoped singleton survives across requests as long as the isolate is alive (CF runtime behavior) |

**Configuration:**

```toml
# packages/worker/wrangler.toml
name = "hono-workspace-api"
main = "src/index.ts"
compatibility_date = "2026-04-06"
compatibility_flags = ["nodejs_compat"]
```

**Per-request boot (`bootRequest()`):**

```
1. setDatabasePool(createNeonHttpPool(env.DATABASE_URL))
     → our repo queries use stateless HTTP (CF-safe)
2. create a request-scoped workspaceFactory:
   (basePath) => new Workspace({
     filesystem: new S3Filesystem({ bucket, endpoint, credentials, prefix: basePath }),
   })
3. return createMastra(env.DATABASE_URL, { openrouterApiKey, openrouterModel })
     → Mastra internally creates a Neon WebSocket Pool (multi-statement DDL capable)
```

The boot middleware stores both `mastra` and `workspaceFactory` on Hono context (`c.set(...)`); route handlers then pass those dependencies into platform services. The per-request model is required because CF Workers bind I/O objects to the originating request. Stateless HTTP queries (our repos) are cheap per request. WebSocket pools (Mastra's path) only stay healthy within a single request's I/O context; Mastra's `disableInit: true` and `observationalMemory: false` ensure no work crosses that boundary.

### `packages/web` — `@hono-workspace/web`

React 19 + Vite frontend. Firebase SDK for client-side auth. Consumes shared components and CSS from `@hono-workspace/ui`. Vite dev proxy forwards `/api/*` to the backend on `localhost:3000`. Not deployed with the worker — treated as a separate artifact.

### `packages/ui` — `@hono-workspace/ui`

Shared React UI primitives and styling used by the web app. Exports component primitives plus `./styles.css`; current components include button, badge, card, input, scroll-area, and textarea. Built around Radix primitives where needed, `class-variance-authority`, `clsx`, `tailwind-merge`, and Tailwind CSS v4.

---

## 4. External services

| Service | Role | How we authenticate |
|---|---|---|
| **Neon** (Postgres) | Primary application DB + Mastra agent store | `DATABASE_URL` with role `neondb_owner` at runtime; `cl-admin-01` for schema migrations |
| **Cloudflare Workers** | Deployment target | `wrangler deploy`; OAuth-authenticated CLI |
| **Cloudflare R2** | Workspace filesystem storage | Access key + secret (S3-compatible API) |
| **Firebase Auth** | End-user identity | `FIREBASE_PROJECT_ID` + `FIREBASE_TOKEN` (Web API key) for ID token verification; Admin SDK service account for test user creation |
| **OpenRouter** | LLM provider | `OPENROUTER_API_KEY` |
| **Neon REST API** | Test-branch provisioning | `NEON_API_KEY` — used by `test-db.ts` helper |

### Neon role model (important for migrations)

The production Neon project `green-dawn-09831822` (name: `mindcloud-01`) has:

- **Databases:** `neondb` (owned by `neondb_owner`) and `mindcloud-test-01` (owned by `cl-admin-01`).
- **Roles:** `neondb_owner`, `cl-admin-01`. Both inherit the `neon_superuser` group.

The deployed worker uses `DATABASE_URL` as `neondb_owner` against `mindcloud-test-01`. `neondb_owner` cannot run DDL on `mindcloud-test-01` (lacks `CREATE` on the `public` schema — owned by the `pg_database_owner` pseudo-role which resolves to `cl-admin-01`). To migrate production, temporarily connect as `cl-admin-01`. Runtime DML works because Neon's default ACLs grant `neon_superuser` (inherited by both roles) full DML on tables owned by DB owners.

**Test environment:** `test-db.ts` sidesteps the role issue by creating Neon branches and targeting the default `neondb` database (which `neondb_owner` owns), so tests never need `cl-admin-01` credentials.

---

## 5. Data model

### Control plane (platform-managed tables, 12 total)

```
organizations           → top-level tenant
users                   → Firebase UID → internal user ID
organization_memberships→ users × organizations with roles
projects                → projects scoped to an org
project_channels        → chat channels scoped to a project
channel_threads         → conversation threads within a channel

workspace_roots         → path + status for a project's filesystem
workspace_bindings      → pins an agent ref/version to a project's workspace
workspace_locks         → distributed mutex for write/command operations
workspace_events        → audit log
workspace_provisioning_jobs → provisioning tracking
schema_migrations       → applied migration versions (managed by migrate.ts)
```

Migrations live in `packages/platform/src/db/migrations/*.sql` and are applied by `packages/platform/src/db/migrate.ts` via `pnpm --filter @hono-workspace/platform db:migrate`.

### Execution plane (Mastra-managed tables, 27 total)

All prefixed `mastra_*`. Provisioned via `initMastraSchema(connectionString)` which calls `PostgresStore.init()` once against an empty branch. Key tables:

```
mastra_threads, mastra_messages, mastra_resources — conversations
mastra_agents, mastra_agent_versions              — stored agent overrides (editor-backed)
mastra_workspaces, mastra_workspace_versions      — Mastra-internal workspace metadata
mastra_observational_memory                       — long-term memory (currently unused; async buffering disabled)
mastra_workflow_snapshot                          — workflow state
mastra_scorers, mastra_scorer_definitions         — scoring framework
mastra_datasets, mastra_dataset_items             — dataset storage
mastra_experiments, mastra_experiment_results     — experiment runs
...and more
```

Registering `@mastra/editor@0.7.16` on top of `@mastra/core@1.25.0` did **not** add new `mastra_*` tables — verified by counting before/after in Phase 4. The editor layers on top of the existing storage domain.

**Critical:** Mastra table DDL is NOT re-run at runtime in the worker (`disableInit: true`). Schema drift after a `@mastra/core` or `@mastra/pg` version bump requires a manual `initMastraSchema()` call from a migration script — see production migration playbook in §8.

---

## 6. HTTP API surface

All `/api/*` routes require a `Bearer <firebase-id-token>` header. The worker's auth middleware verifies the token against Google's JWKS cache and populates `c.var.principal` with `{ uid, email, name }`.

### Public

- `GET /health` → `{ status: 'ok' }`
- `GET /ready` → `{ ok: true }`

### Authenticated

| Route | Method | Purpose |
|---|---|---|
| `/api/me` | GET | Return the authenticated principal |
| `/api/projects` | GET | List projects accessible to the principal |
| `/api/dev/bootstrap-project` | POST | One-shot: create org+user+membership+project+channel+workspace |
| `/api/projects/:projectId/admin/test` | POST | Run the project agent with a plain message (diagnostic) |
| `/api/projects/:projectId/channels` | GET, POST | List / create channels |
| `/api/projects/:projectId/channels/:channelId/feed` | GET | Feed of root posts across threads in a channel |
| `/api/projects/:projectId/channels/:channelId/posts` | POST | Create a new thread with a root message |
| `/api/projects/:projectId/channels/:channelId/threads` | GET, POST | List / create threads in a channel |
| `/api/projects/:projectId/channels/:channelId/threads/:threadId` | GET | Thread details + messages |
| `/api/projects/:projectId/channels/:channelId/threads/:threadId/messages` | POST | Send message + get agent reply (synchronous) |
| `/api/projects/:projectId/channels/:channelId/threads/:threadId/messages/stream` | POST | Send message + stream agent reply as SSE (`ack` → `token`* → `done`) |
| `/api/projects/:projectId/summarize` | POST | Summarize a set of workspace paths via the `summarizer` agent. Accepts `?versionId=` or `?status=draft\|published` for editor-targeted version selection. |
| `/api/projects/:projectId/supervise` | POST | Run the read-only workspace supervisor over a prompt and optional workspace paths. Accepts `?versionId=` or `?status=draft\|published` for editor-targeted supervisor selection. |

The Node app and Worker expose the same domain routes, with thin call sites into shared platform services. Their registration code is intentionally duplicated in `packages/app/src/server/factory.ts` and `packages/worker/src/index.ts`: the Node app mounts `MastraServer` once during `createApp()`, while the Worker creates the Mastra/Hono bridge per `/api/mastra/*` request to keep request-scoped I/O isolated.

### Mastra-native surface (Tier A) — `/api/mastra/*`

`@mastra/hono`'s `MastraServer` is mounted under `/api/mastra/*` (per-request on Workers, at app init on Node) and auto-exposes every agent and workflow registered in `createMastra()`:

- `GET  /api/mastra/agents` — list registered agents
- `GET  /api/mastra/agents/:agentId` — agent metadata
- `POST /api/mastra/agents/:agentId/generate` — synchronous reply
- `POST /api/mastra/agents/:agentId/stream` — SSE reply (Mastra's native event shape: `start`, `text-delta`, `finish`, etc.)
- `GET  /api/mastra/workflows` — list registered workflows
- `POST /api/mastra/workflows/:workflowId/create-run` — create a run
- `POST /api/mastra/workflows/:workflowId/start-async` — start a run
- `POST /api/mastra/workflows/:workflowId/stream` — SSE stream of workflow events

**Editor endpoints** (requires `@mastra/editor` registered on the Mastra instance):

- `GET  /api/mastra/stored/agents` — list stored-agent overrides (auth-required, no admin)
- `GET  /api/mastra/stored/agents/:id` — get a stored-agent override
- `GET  /api/mastra/stored/agents/:id/versions` — list versions
- `POST /api/mastra/stored/agents` — **admin-only** create override
- `PATCH /api/mastra/stored/agents/:id` — **admin-only** update override (auto-creates new draft version)
- `DELETE /api/mastra/stored/agents/:id` — **admin-only** delete
- (plus prompt-block, scorer, workspace, skill CRUD endpoints from the editor)

**Admin gate:** Mutating methods on `/api/mastra/stored/*` require the verified Firebase email in `c.var.principal.email` to match the `ADMIN_EMAILS` env var (comma-separated, case-insensitive). Reads stay open to every authenticated caller. Unauthenticated requests hit the normal `/api/*` 401 path first.

### Version targeting on domain routes

Domain routes that wrap an editor-overridable agent accept optional query parameters:

- `?versionId=<uuid>` — pin to a specific stored version
- `?status=draft` — use the latest draft override
- `?status=published` — use the published override (default when neither is set)

These map to Mastra's `getAgentById(id, { versionId })` / `getAgentById(id, { status })` overloads. The helpers live in `@hono-workspace/platform`: `parseAgentVersionFromQuery()` and `getAgentWithVersion()`. **`getAgentWithVersion()` is async** — the versioned path hits storage and returns `Promise<Agent>`, while the unversioned fallback uses the sync `mastra.getAgent(id)`. Service callers must `await` it or the resulting `.generate()` call will fail with `agent.generate is not a function`. Today only `/api/projects/:projectId/summarize` uses them; the pattern is ready for any future domain route.

---

## 7. Request flow — annotated

A typical `POST /api/projects/:id/channels/:id/threads/:id/messages` call on the deployed Worker:

```
 Client → CF Worker
 ┌──────────────────────────────────────────────────────────────────┐
 │ 1. CF Worker `fetch(request, env, ctx)` invoked                  │
 │ 2. `app.use('*', ...)` middleware runs `bootRequest(env)`:       │
 │      - setDatabasePool(createNeonHttpPool(env.DATABASE_URL))     │
 │      - create request-scoped workspaceFactory for R2 workspaces   │
 │      - c.set('mastra', createMastra(env.DATABASE_URL, {...}))    │
 │      - c.set('workspaceFactory', workspaceFactory)                │
 │ 3. `/api/*` auth middleware:                                     │
 │      - verify Firebase ID token via platform's verifier          │
 │      - c.set('principal', { uid, email, name })                  │
 │ 4. Route handler calls `sendChannelMessageForPrincipal(...)`:    │
 │    ┌────────────────────────────────────────────────────────┐    │
 │    │ 5a. loadProjectContext() → Neon HTTP query (repo)      │    │
 │    │ 5b. resolveWorkspaceForProject() → Neon HTTP queries   │    │
 │    │        → deps.workspaceFactory(rootPath)                │    │
 │    │        → new Workspace with S3Filesystem (R2)          │    │
 │    │ 5c. buildExecutionContext() → seed RequestContext       │    │
 │    │ 5d. mastra.getAgent('projectAgent').generate(msg, ...)  │    │
 │    │        - Mastra memory calls saveThread/saveMessages    │    │
 │    │          → @mastra/pg → Neon WebSocket Pool query       │    │
 │    │        - Model call via OpenRouter                      │    │
 │    │ 5e. updateChannelThreadMetadata() → Neon HTTP query     │    │
 │    └────────────────────────────────────────────────────────┘    │
 │ 6. Response serialized as JSON and returned                      │
 └──────────────────────────────────────────────────────────────────┘
```

**Two pools per request is intentional:** the HTTP pool is used for idempotent single-statement queries from platform code (stateless, cheap, CF-safe). The WebSocket pool is used only inside Mastra, which requires persistent-session semantics for its transactions and multi-statement DDL. Both are per-request; neither is shared across CF request handlers.

---

## 8. Deployment

### Cloudflare Worker (`packages/worker`)

```bash
cd packages/worker
pnpm exec wrangler deploy     # uploads + binds; reuses OAuth creds
```

Secrets are managed via `wrangler secret put <NAME>` or `wrangler secret bulk <file.json>`. Production secrets:

```
DATABASE_URL                # Neon pooled URL as neondb_owner
FIREBASE_PROJECT_ID
FIREBASE_TOKEN              # Firebase Web API key
OPENROUTER_API_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
WORKSPACE_ROOT              # R2 prefix for this deployment's workspaces
ADMIN_EMAILS                # comma-separated, case-insensitive; gates /api/mastra/stored/* writes
```

Optional: `OPENROUTER_MODEL` (per-deployment model pin; falls back to each agent's default `openai/gpt-4.1-mini`).

### Node.js (`packages/app`)

```bash
pnpm dev                    # tsx watch src/index.ts on port 3000
pnpm dev:db                 # docker-compose up -d postgres (local dev only)
pnpm --filter @hono-workspace/platform db:migrate  # run migrations
```

No production deployment target for Node.js mode — CF Worker is the production path. Node mode exists for fast local iteration with hot reload.

### Production DB migration

One-time setup (and any future schema change):

```bash
# 1. Retrieve cl-admin-01 password from Neon REST API (rotate if leaking)
# 2. Build a DATABASE_URL with cl-admin-01 creds and the target DB
# 3. Run platform migrations:
DATABASE_URL='postgresql://cl-admin-01:<pw>@<host>/mindcloud-test-01?sslmode=require&channel_binding=require' \
  pnpm --filter @hono-workspace/platform db:migrate

# 4. Init Mastra schema (only needed after @mastra/pg version bumps that change DDL):
node --import tsx -e "
  import { initMastraSchema } from '@hono-workspace/platform';
  await initMastraSchema('postgresql://cl-admin-01:<pw>@<host>/mindcloud-test-01?sslmode=require&channel_binding=require');
"
```

The runtime `neondb_owner` continues to work without changes thanks to Neon's default `neon_superuser` ACLs.

---

## 9. Testing

Four independently-runnable layers:

```bash
pnpm test:unit           # 122 tests, ~2s — no network, no DB
pnpm test:integration    # 45 tests, ~90s — real Neon branch, real Mastra
pnpm test:e2e            # 22 tests, ~90s — spawned wrangler dev + real Firebase tokens
pnpm test:smoke          # 5 tests, ~6s — deployed worker + real prod DB writes
```

The counts are from fresh local runs on 2026-04-23. Run times vary with Neon, Firebase, R2, and deployed-worker latency.

See:
- [`packages/worker/test/README.md`](../../packages/worker/test/README.md) — operational reference.
- [`02_testing_strategy_design.md`](../tasks/02_testing_strategy_design.md) — design doc.
- [`03_testing_implementation_completion.md`](../tasks/03_testing_implementation_completion.md) — what was built and why.

Every integration/E2E run creates a **fresh Neon branch** with all 39 tables (12 platform + 27 Mastra), runs tests, and deletes the branch on teardown. Cleanup failures fail the test run. Firebase test users are named `test-<uuid>@test.hono-workspace.local` and tagged for optional garbage collection.

---

## 10. Runtime compatibility notes (gotchas)

### CF Workers I/O lifetime

CF Workers bind I/O objects (TCP sockets, WebSocket connections, request/response bodies) to the request handler that created them. Any attempt to touch those objects from a different request's handler throws `Cannot perform I/O on behalf of a different request`. Three places in this codebase manage this carefully:

1. **Per-request Mastra instance.** The `bootRequest()` middleware in `packages/worker/src/index.ts` calls `createMastra()` on every request so its Neon WebSocket Pool is created fresh for that request.

2. **Per-request platform pool.** The worker registers a new `createNeonHttpPool(env.DATABASE_URL)` in `setDatabasePool()` per request. Because the HTTP pool is stateless, there's no shared socket.

3. **No background work past the response.** We disabled Mastra Memory's `observationalMemory` and do not use `c.executionCtx.waitUntil()` anywhere. Every in-flight promise must resolve before returning the response.

### `pg` on CF Workers

`pg@8.20.0` auto-detects CF Workers (`navigator.userAgent === 'Cloudflare-Workers'`) and uses `pg-cloudflare`'s `CloudflareSocket` (wraps `cloudflare:sockets`). This works but is request-scoped — never cache a `pg.Pool` at module level in a Worker. `@neondatabase/serverless` Pool extends `pg.Pool` and is the safer choice because its transport is better-understood on CF.

### `this`-binding on CF `fetch`

CF Workers' global `fetch` rejects method-style invocation. `this.fetchImpl(url)` throws `TypeError: Illegal invocation`. Detach the function reference first: `const doFetch = this.fetchImpl; await doFetch(url)`. This cost us a week once — the auth middleware swallowed the error and every authed request returned 401.

### Neon v2 branch API

The `POST /projects/{id}/branches` response no longer contains `connection_uris`. Our helper rewrites the parent `DATABASE_URL` host to the new branch's endpoint host. See `packages/worker/test/helpers/test-db.ts`.

### Multi-statement DDL on Neon HTTP

The HTTP transport (`neon()`) rejects multi-statement SQL with `42601: cannot insert multiple commands into a prepared statement`. Use WebSocket `Pool` for DDL paths (like `PostgresStore.init()`). Single-statement queries are fine on HTTP.

### `mastra.getAgentById(id, version)` is async; `mastra.getAgent(id)` is sync

Mastra's `getAgent(id)` returns an `Agent` synchronously from the registry. `getAgentById(id, { versionId | status })` hits the editor storage and returns `Promise<Agent>`. Our `getAgentWithVersion()` helper papers over both paths, but it itself is `async`. Forgetting to `await` it produces a Promise that looks like an Agent to TypeScript (because of generic erasure) but explodes at runtime with `TypeError: agent.generate is not a function`. Rule: always `await getAgentWithVersion(...)`.

### `@mastra/editor` requires `@mastra/core` ≥ 1.25.0

`@mastra/editor@0.7.16` calls `Agent.__fork()` to produce hydrated overrides. That method landed in `@mastra/core@1.25.0`. Running the editor against `@mastra/core@1.24.x` surfaces as `TypeError: agent.__fork is not a function` the first time an override is loaded. When bumping `@mastra/editor`, keep `core`, `memory`, `pg`, and `hono` Mastra packages on compatible aligned versions.

### `pnpm exec` swallows `--` flags

`pnpm exec wrangler dev --env-file .dev.vars.test` will lose `--env-file` because pnpm eats it. Use `pnpm exec -- wrangler dev --env-file ...` with the `--` separator.

### Wrangler `--env-file` requires relative path

`wrangler dev --env-file /absolute/path/to/.dev.vars` errors with "not found". Pass the filename relative to wrangler's cwd.

### R2 S3 XML parsing in Workers

The root `pnpm-workspace.yaml` registers a patch for `@aws-sdk/xml-builder@3.972.17` that removes its `browser` package field. Without the patch, Wrangler's esbuild bundle can select the DOMParser-based XML parser, and S3/R2 response parsing fails in Workers with `ReferenceError: DOMParser is not defined`. If R2 operations fail after an AWS SDK dependency bump, confirm the patch still applies.

---

## 11. Local development

```bash
# Start Postgres (one-time)
pnpm dev:db

# Run migrations (one-time, or after migrations/* changes)
pnpm --filter @hono-workspace/platform db:migrate

# Start Node.js backend + React frontend concurrently
pnpm dev:full

# Start just the backend on :3000
pnpm dev

# Start just the frontend on :5173
pnpm dev:web

# Start the CF Worker locally against a real Neon branch + R2
pnpm --filter @hono-workspace/worker dev   # wrangler dev with .dev.vars
```

`.env` lives at the repo root and is loaded by `dotenv` across all tooling. `.dev.vars` lives in `packages/worker/` and is loaded by `wrangler dev`. Both are gitignored.

---

## 12. Key decisions and their rationale

| Decision | Alternative considered | Why we chose this |
|---|---|---|
| Two backend packages (`app` + `worker`) instead of one | Compile-time conditional in a single package | Clean boundary; Node dev ergonomics preserved; worker bundle stays minimal. |
| Injectable database pool + explicit service deps | Pass the DB/workspace into every low-level function | Keeps repository APIs small while making request-scoped Mastra/workspace dependencies explicit at service boundaries. |
| Neon HTTP for repos + WebSocket for Mastra | HTTP for everything | Mastra's init DDL is multi-statement; HTTP rejects it. Two clients per request is acceptable (both are stateless or request-scoped). |
| `disableInit: true` + out-of-band init | Let Mastra auto-init at runtime | Concurrent requests race to `ALTER TABLE` and deadlock. One-time init is explicit and debuggable. |
| Four-layer test strategy with Neon branching | Single shared test DB + truncate | Stronger isolation; parallel CI friendly; revealed 3 real bugs during implementation. |
| Firebase service account for test users | Pre-provisioned shared test account | Unique user per test run; `afterAll` cleanup is trivial. |
| `@hono-workspace/platform/node` subpath export | Conditional module resolution | Explicit: consumers know they're opting into Node-only code. CF bundle stays clean. |
| Explicit `PlatformDeps` for Mastra + workspace factory | Global workspace factory holder | Keeps request-scoped Worker I/O obvious, makes Node tests injectable, and avoids hidden mutable workspace state. |
| Mount `MastraServer` under `/api/mastra/*` instead of building a harness abstraction | Custom "harness" layer wrapping each agent/workflow | Leans on Mastra's native surface (discovery, generate, stream, editor) for zero-cost. No framework-on-framework. |
| Per-request `MastraServer` mount | Module-scoped cached instance | Matches our per-request Mastra pattern. Spike measured p95 2.4 ms mount latency — cheap enough not to optimize. |
| Email-allowlist admin gate for `/api/mastra/stored/*` writes | Claims-based RBAC, per-org admin roles | Simplest control that fits today. `ADMIN_EMAILS` env var is easy to review, easy to rotate. |
| Version targeting via query params only on specific domain routes | Global `?versionId` support everywhere | Only routes that wrap an editor-overridable agent need it. The Mastra-native routes already accept it natively. |

---

## 13. Directory map quick-reference

```
packages/platform/src/
├── auth/
│   ├── claims.ts                        # Firebase claim validation
│   ├── firebase-token-verifier.ts       # jose-based ID token verifier
│   └── jwks-cache.ts                    # Google x509 cert cache
├── db/
│   ├── client.ts                        # Node-only pg.Pool (subpath: /node)
│   ├── context.ts                       # Injectable pool holder
│   ├── migrate.ts                       # CLI migration runner
│   ├── schema.ts                        # Schema introspection helper
│   ├── migrations/*.sql                 # Platform DDL
│   └── repositories/*.ts                # Per-table query modules
├── mastra/
│   ├── create-mastra.ts                 # Mastra factory (agents + workflows + editor + storage)
│   ├── storage.ts                       # PostgresStore + initMastraSchema
│   ├── version.ts                       # parseAgentVersionFromQuery + getAgentWithVersion (async)
│   ├── agents/
│   │   ├── registry.ts                  # Code-defined agent registry
│   │   ├── project-agent.ts             # Chat agent
│   │   ├── summarizer.ts                # Document summarization agent
│   │   ├── workspace-reviewer.ts        # Read-only review specialist
│   │   └── workspace-supervisor.ts      # Supervisor over read-only specialists/workflows
│   ├── tools/
│   │   └── workspace-tools.ts           # read/list/write tools + toolkits
│   ├── workflows/
│   │   ├── registry.ts                  # Code-defined workflow registry
│   │   └── ingest-pipeline.ts           # Two-step list→summarize workflow
│   └── execution/
│       ├── build-execution-context.ts   # Shared { requestContext, thread, resource } builder
│       ├── execute-agent.ts             # project-agent run orchestration
│       └── request-context.ts           # ProjectAgentRequestContext type + seeds
├── services/
│   ├── access-control.ts, audit.ts, projects.ts
│   ├── chat.ts                          # Channels/threads/messages + SSE
│   ├── dev-bootstrap.ts                 # One-shot project setup
│   ├── project-context.ts               # Authorization
│   ├── summarization.ts                 # Tier B wrapper around summarizer
│   └── supervisor.ts                    # Tier B wrapper around workspace supervisor
├── workspace/
│   ├── resolver.ts                      # Per-project Workspace resolver
│   ├── provisioning.ts, reconciliation.ts
│   ├── paths.ts, locking.ts
├── env.ts                               # Env parser (WORKSPACE_ROOT optional)
├── platform-deps.ts                     # Explicit { mastra, workspaceFactory } deps
├── index.ts                             # Public exports (CF-safe)
└── node.ts                              # Node-only exports (subpath)

packages/worker/
├── src/index.ts                         # CF Worker entry + Hono app + routes
├── wrangler.toml                        # CF deployment config
├── test/
│   ├── helpers/                         # Shared test infrastructure
│   ├── live/                            # E2E tests
│   └── smoke/                           # Smoke tests
└── scripts/run-e2e.mjs                  # E2E orchestrator

packages/app/
├── src/
│   ├── index.ts                         # Node entry + serve()
│   ├── server/factory.ts                # createApp() — route registration
│   ├── middleware/auth.ts
│   └── routes/*.ts
└── test/integration/*.integration.test.ts

packages/ui/
├── src/components/ui/*.tsx              # Shared UI primitives
├── src/lib/utils.ts                     # cn() class merge helper
├── src/styles.css                       # Shared Tailwind v4 theme/styles
└── src/index.ts                         # Public UI exports
```

---

## 14. Future work

Items explicitly out of scope today but worth tracking:

1. **Production migration wrapper** — a Node script `pnpm db:migrate:production` that fetches `cl-admin-01`'s password via Neon API with a `CONFIRM_PRODUCTION=yes` flag.
2. **Mastra observational memory on CF** — re-enable if Mastra ships an official CF compatibility fix, or via `c.executionCtx.waitUntil()`.
3. **`migrate.ts` transaction safety** — use `pool.connect()` + `client.query('BEGIN'/'COMMIT')` instead of `pool.query('BEGIN'/'COMMIT')` which may land on different connections.
4. **Test user / project GC** — scheduled cleanup of `test-*` Firebase users and their orphaned production projects.
5. **CI pipeline** — tests run locally today. GitHub Actions configs would wire them to PRs/pushes.
6. **Web frontend deployment** — Vite build not yet wired to a CDN/CF Pages deploy.
