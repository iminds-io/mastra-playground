# mastra-mindspace Usage Guide

**Category:** Reference
**Tags:** onboarding, usage, deployment, api, mastra, testing
**Last Updated:** 2026-04-23
**References:** [`01_technical_architecture.md`](./01_technical_architecture.md), [`02_adding_agents_and_workflows.md`](./02_adding_agents_and_workflows.md), [`03_porting_and_reusing_mastra_mindspace.md`](./03_porting_and_reusing_mastra_mindspace.md), [`packages/worker/test/README.md`](../../packages/worker/test/README.md)

---

## Purpose

This guide is the coworker handoff manual for running, deploying, operating, testing, and extending `mastra-mindspace`.

`mastra-mindspace` is a Hono + Mastra AI mindspace app. It provides a Firebase-authenticated project API, project-scoped chat channels/threads, mindspace-backed Mastra agents, document summarization, supervisor-agent analysis, Mastra-native agent/workflow endpoints, and runtime agent overrides through `@mastra/editor`.

---

## System At A Glance

The monorepo has five packages:

| Package | Purpose |
|---|---|
| `packages/platform` | Shared business logic, DB repositories, Mastra agents/workflows/tools, and mindspace services. |
| `packages/app` | Node/Hono local API server for development. |
| `packages/worker` | Cloudflare Worker API target for production and Wrangler E2E tests. |
| `packages/web` | React + Vite frontend. |
| `packages/ui` | Shared UI primitives and styles consumed by `packages/web`. |

The API has two surfaces:

- **Mindspace-scoped product API:** `/api/projects/:projectId/...` routes that enforce Firebase auth, project authorization, mindspace resolution, and product-specific request/response shapes.
- **Native/internal Mastra API:** `/api/mastra/*` routes exposed by `@mastra/hono` for registered agents, workflows, and editor-backed stored overrides.

Use the mindspace-scoped product API for project operations. Use the native/internal Mastra API for generic Mastra execution, inspection, editor operations, tests, and operator workflows.

---

## Required Accounts And Services

You need access to:

- **Firebase Auth** project for end-user identity and test-user token minting.
- **Neon** project for Postgres runtime data and test branch provisioning.
- **Cloudflare Workers** account for deploying the Worker API.
- **Cloudflare R2** bucket and S3-compatible access keys for Worker mindspace storage.
- **OpenRouter** API key for model calls.

The repo assumes secrets are kept outside Git. Use the root `.env` for local tooling and `packages/worker/.dev.vars` for Wrangler local development.

---

## Environment Variables

Start from `.env.example`.

### Core Runtime

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hono_workspace
MINDSPACE_ROOT=/absolute/path/to/mastra-mindspace/var/mindspaces
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_TOKEN=your-firebase-web-api-key
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openai/gpt-4.1-mini
ADMIN_EMAILS=admin@example.com
```

`ADMIN_EMAILS` is a comma-separated allowlist for mutating `/api/mastra/stored/*` editor routes. Reads are available to every authenticated caller.

### Frontend

```bash
VITE_FIREBASE_API_KEY=your-firebase-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-firebase-app-id
```

### Test Infrastructure

```bash
NEON_API_KEY=
NEON_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/firebase-service-account.json
SMOKE_BASE_URL=
SMOKE_REQUIRES_MIGRATED_DB=
```

### Worker / R2

`packages/worker/.dev.vars.example` contains the Worker-specific shape:

```bash
DATABASE_URL=postgres://user:password@your-neon-host.neon.tech/hono_workspace?sslmode=require
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_TOKEN=your-firebase-api-key
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openai/gpt-4.1-mini
R2_ACCOUNT_ID=your-cf-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=mastra-mindspace
MINDSPACE_ROOT=mindspaces
ADMIN_EMAILS=admin@example.com
```

---

## Local Development

Install dependencies with pnpm. The repo declares `pnpm@10.16.0`.

```bash
pnpm install
```

Start local Postgres:

```bash
pnpm dev:db
```

Run platform migrations:

```bash
pnpm --filter @mastra-mindspace/platform db:migrate
```

Start the Node API and web app together:

```bash
pnpm dev:full
```

Start only the API:

```bash
pnpm dev
```

Start only the frontend:

```bash
pnpm dev:web
```

The Node API listens on `localhost:3000`. The Vite frontend listens on `localhost:5173` and proxies `/api/*` to the API server.

---

## Running The Worker Locally

Use Wrangler from `packages/worker`:

```bash
pnpm --filter @mastra-mindspace/worker dev
```

Wrangler reads `packages/worker/.dev.vars`. That mode is for local Worker behavior against real Neon/R2-style backing services.

Important Cloudflare constraints:

- The Worker creates `mastra`, the Neon HTTP DB adapter, and the R2-backed `mindspaceFactory` per request.
- Do not cache `pg.Pool`, Neon WebSocket pools, request/response bodies, or R2/S3 clients across Worker requests.
- `PostgresStore.disableInit` stays true at runtime. Mastra schema initialization is an explicit out-of-band step.

---

## Deployment

### Worker API

Deploy the production API from `packages/worker`:

```bash
cd packages/worker
pnpm exec wrangler deploy
```

Current worker name and live `workers.dev` URL:

```text
mastra-mindspace-api
https://mastra-mindspace-api.dev-726.workers.dev
```

Set secrets with Wrangler:

```bash
pnpm exec wrangler secret put DATABASE_URL
pnpm exec wrangler secret put FIREBASE_PROJECT_ID
pnpm exec wrangler secret put FIREBASE_TOKEN
pnpm exec wrangler secret put OPENROUTER_API_KEY
pnpm exec wrangler secret put R2_ACCOUNT_ID
pnpm exec wrangler secret put R2_ACCESS_KEY_ID
pnpm exec wrangler secret put R2_SECRET_ACCESS_KEY
pnpm exec wrangler secret put R2_BUCKET_NAME
pnpm exec wrangler secret put MINDSPACE_ROOT
pnpm exec wrangler secret put ADMIN_EMAILS
```

`OPENROUTER_MODEL` is optional.

### Production DB Migration

Run platform migrations and Mastra schema initialization before relying on a new database or after package/schema changes.

The deployed Neon database may need migrations run as the schema-owning role (`cl-admin-01` in the current architecture notes), not the runtime `neondb_owner` role.

```bash
DATABASE_URL='postgresql://cl-admin-01:<pw>@<host>/mindcloud-test-01?sslmode=require&channel_binding=require' \
  pnpm --filter @mastra-mindspace/platform db:migrate
```

Initialize Mastra tables:

```bash
DATABASE_URL='postgresql://cl-admin-01:<pw>@<host>/mindcloud-test-01?sslmode=require&channel_binding=require' \
  pnpm --filter @mastra-mindspace/platform exec node --import tsx -e "
  import { initMastraSchema } from './src/index.ts';
  await initMastraSchema(process.env.DATABASE_URL);
  "
```

### Frontend

Build the frontend separately:

```bash
pnpm --filter @mastra-mindspace/web build
```

Deploy `packages/web/dist` to the chosen static host, such as Cloudflare Pages. The Worker API is not bundled with the frontend.

---

## Authentication

All `/api/*` routes require:

```http
Authorization: Bearer <firebase-id-token>
```

Public routes:

- `GET /health`
- `GET /ready`

Authenticated identity is exposed through:

```bash
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  "$API_BASE_URL/api/me"
```

Expected shape:

```json
{
  "uid": "firebase-user-id",
  "email": "user@example.com",
  "name": "User Name"
}
```

---

## Mindspace-Scoped Mastra Gateway

The main product-facing Mastra surface is now:

```text
/api/projects/:projectId/mastra/*
```

These routes mirror useful Mastra agent/workflow operations, but the server injects the trusted project context:

- project membership
- resolved mindspace
- `RequestContext`
- memory `resourceId`
- memory `threadId`
- primitive exposure policy

Clients choose which permitted primitive to run. They do not supply trusted context such as `projectId`, `role`, `organizationId`, the runtime `Workspace`, or `memory.resource`.

### List Mindspace-Scoped Agents

```bash
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  "$API_BASE_URL/api/projects/$PROJECT_ID/mastra/agents"
```

Expected ids in the current first release:

- `summarizer`
- `mindspaceReviewer`
- `mindspace-supervisor`

### Generate With A Mindspace-Scoped Agent

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/mastra/agents/summarizer/generate" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":"Say ok in one word."}'
```

### Stream With A Mindspace-Scoped Agent

```bash
curl -N -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/mastra/agents/summarizer/stream" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":"Say ok in one word."}'
```

### List Mindspace-Scoped Workflows

```bash
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  "$API_BASE_URL/api/projects/$PROJECT_ID/mastra/workflows"
```

Expected ids in the current first release:

- `ingestPipeline`

### Start A Mindspace-Scoped Workflow

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/mastra/workflows/ingestPipeline/start" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputData":{"rootPath":"/"}}'
```

The response should succeed even though the client never sends a runtime `Workspace` object, because the server resolves the mindspace before calling Mastra.

---

## First Project Workflow

Bootstrap a project:

```bash
curl -X POST "$API_BASE_URL/api/dev/bootstrap-project" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Mindspace"}'
```

This creates:

- Organization
- User
- Organization membership
- Project
- Default channel
- Mindspace root
- Mindspace binding

List accessible projects:

```bash
curl "$API_BASE_URL/api/projects" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
```

List project channels:

```bash
curl "$API_BASE_URL/api/projects/$PROJECT_ID/channels" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
```

Create a channel:

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/channels" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Planning","description":"Planning discussion"}'
```

---

## Chat And Threads

Create a channel post, which starts a thread:

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/channels/$CHANNEL_ID/posts" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What should we inspect first?"}'
```

Send a synchronous thread message:

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/channels/$CHANNEL_ID/threads/$THREAD_ID/messages" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize the mindspace state."}'
```

Stream a reply as SSE:

```bash
curl -N -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/channels/$CHANNEL_ID/threads/$THREAD_ID/messages/stream" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Give me a short plan."}'
```

Domain streaming events currently use:

- `ack`
- `token`
- `message_saved`
- `thread_updated`
- `done`
- `error`

---

## Project Agent Diagnostics

Run the project agent directly through the domain diagnostic route:

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/admin/test" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Say ok."}'
```

This route authorizes project access, resolves the mindspace, builds a Mastra `RequestContext`, and calls `projectAgent.generate()`.

---

## Summarization

Summarize mindspace paths through the mindspace-scoped product route:

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/summarize" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paths":["README.md","docs/spec.md"],"question":"What matters operationally?"}'
```

Version targeting works on this route:

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/summarize?status=draft" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paths":["README.md"]}'
```

Supported query params:

- `?versionId=<uuid>`
- `?status=draft`
- `?status=published`

---

## Mindspace Supervisor

Use `/supervise` when the request may need read-only specialist delegation or workflow assistance.

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/supervise" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Review the mindspace for implementation risks.","paths":["README.md","packages/platform/src"]}'
```

The supervisor coordinates:

- `summarizer`
- `mindspaceReviewer`
- `ingestPipeline`

It intentionally does not delegate to the write-capable `projectAgent` in the current implementation.

Version targeting works here too:

```bash
curl -X POST "$API_BASE_URL/api/projects/$PROJECT_ID/supervise?status=draft" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Review this mindspace."}'
```

---

## Native/Internal Mastra Routes

Mastra-native routes are mounted under `/api/mastra/*` and require the same Firebase bearer token as other `/api/*` routes.

List agents:

```bash
curl "$API_BASE_URL/api/mastra/agents" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
```

Current code-defined agents:

- `project-agent`
- `summarizer`
- `mindspaceReviewer`
- `mindspace-supervisor`

Generate with an agent:

```bash
curl -X POST "$API_BASE_URL/api/mastra/agents/summarizer/generate" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages":"Say ok in one word.",
    "memory":{"thread":"manual-test","resource":"harness:tier-a:manual"},
    "requestContext":{"projectId":"manual","organizationId":"manual","role":"owner"}
  }'
```

Stream from an agent:

```bash
curl -N -X POST "$API_BASE_URL/api/mastra/agents/summarizer/stream" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages":"Say ok in one word.",
    "memory":{"thread":"manual-stream","resource":"harness:tier-a:manual"},
    "requestContext":{"projectId":"manual","organizationId":"manual","role":"owner"}
  }'
```

List workflows:

```bash
curl "$API_BASE_URL/api/mastra/workflows" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
```

Create a workflow run:

```bash
curl -X POST "$API_BASE_URL/api/mastra/workflows/ingestPipeline/create-run" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Native/internal Mastra routes do not automatically provide the project `Workspace`. Prefer mindspace-scoped product routes for flows that need real project mindspace access.

---

## Mastra Editor Routes

Editor routes live under:

```text
/api/mastra/stored/*
```

Reads are authenticated but not admin-gated. Mutations require the caller's verified email to appear in `ADMIN_EMAILS`.

List stored agents:

```bash
curl "$API_BASE_URL/api/mastra/stored/agents" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
```

Create or update stored agent overrides only with an admin token:

```bash
curl -X POST "$API_BASE_URL/api/mastra/stored/agents" \
  -H "Authorization: Bearer $ADMIN_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id":"summarizer",
    "name":"Summarizer",
    "model":{"provider":"openrouter","name":"openai/gpt-4.1-mini"},
    "instructions":"You summarize documents concisely."
  }'
```

Exact editor payloads are governed by `@mastra/editor`; check existing tests before scripting mutations:

- `packages/platform/test/integration/editor-crud.integration.test.ts`
- `packages/app/test/integration/mastra-editor-admin.integration.test.ts`
- `packages/worker/test/live/mastra-editor-admin.e2e.test.ts`

---

## Agent And Workflow Extension

Use [`02_adding_agents_and_workflows.md`](./02_adding_agents_and_workflows.md) for the detailed recipe.

Short version:

1. Create a specialist with `buildMindspaceAgent()`.
2. Pick `mindspaceReadOnlyToolkit` or `mindspaceToolkit`.
3. Register it in `packages/platform/src/mastra/agents/registry.ts`.
4. Export it from `packages/platform/src/index.ts`.
5. Add unit tests in `packages/platform/test/unit/create-mastra.test.ts`.
6. Add a convenience mindspace-scoped route only if a bespoke request/response contract is required beyond `/api/projects/:projectId/mastra/*`.

Use supervisor agents for flexible multi-specialist coordination. Use workflows for deterministic execution graphs. Do not use deprecated `.network()`.

---

## Testing

Run the fast suite:

```bash
pnpm test:unit
```

Run integration tests against a fresh Neon branch:

```bash
pnpm test:integration
```

Run Worker E2E tests against spawned Wrangler dev, real Firebase tokens, a fresh Neon branch, and a unique R2 prefix:

```bash
pnpm test:e2e
```

Run deployed-worker smoke tests:

```bash
pnpm test:smoke
```

Full typecheck:

```bash
pnpm typecheck
```

These commands are the canonical verification entry points. For the current exact counts, read the latest Vitest output rather than relying on a static number in docs.

---

## Test Environment Behavior

Integration and E2E test infrastructure creates disposable Neon branches and cleans them up. E2E also creates a unique R2 prefix and temporary `packages/worker/.dev.vars.test`.

Cleanup failures fail the test run. If a run is interrupted, manually inspect:

- Neon branches.
- Firebase Auth test users.
- R2 `e2e-runs/` prefixes.

Tests that need missing credentials usually use `skipIf(...)` instead of crashing.

---

## Operational Gotchas

### Cloudflare Worker I/O Lifetime

Never share request-bound I/O across Worker requests. That includes WebSocket-backed pools, R2/S3 clients, request bodies, and response bodies.

### Mastra Memory

Every mindspace-aware agent uses:

```ts
new Memory({ options: { observationalMemory: false } })
```

Do not remove this until Mastra has a confirmed Worker-safe observational-memory path.

### Mastra Schema Initialization

Runtime uses `disableInit: true`. Run `initMastraSchema()` out-of-band after Mastra package bumps that change schema.

### Neon HTTP Transport

Neon HTTP rejects multi-statement DDL. Use the WebSocket `Pool` path for Mastra schema initialization.

### R2 XML Parser Patch

The root `pnpm-workspace.yaml` patches `@aws-sdk/xml-builder@3.972.17` to avoid Worker `DOMParser` crashes during S3/R2 XML response parsing. If R2 parsing fails after dependency changes, confirm the patch still applies.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `OPENROUTER_API_KEY is required` | Agent model resolution needs a key. | Set `OPENROUTER_API_KEY` or pass `openrouterApiKey` in test-created `createMastra()`. |
| `Cannot perform I/O on behalf of a different request` | Worker request-scoped I/O object leaked across requests. | Ensure pools, runtime workspaces, and Mastra instances are created per request. |
| `deadlock detected` during Mastra DDL | Runtime tried to initialize Mastra schema concurrently. | Keep `disableInit: true`; run `initMastraSchema()` once out-of-band. |
| `permission denied for schema public` | Migrating with a role that does not own the schema. | Use the schema-owning Neon role for migrations. |
| `DOMParser is not defined` in Worker/R2 path | AWS XML parser browser resolution issue. | Confirm `patches/@aws-sdk__xml-builder@3.972.17.patch` is applied. |
| Smoke tests skip | Missing `SMOKE_BASE_URL` or migration opt-in. | Set `SMOKE_BASE_URL`; set `SMOKE_REQUIRES_MIGRATED_DB=true` for DB-writing smoke tests. |
| Wrangler cannot find `--env-file` | Wrangler requires relative env-file path. | Run from `packages/worker` and pass `.dev.vars` or `.dev.vars.test`. |

---

## Handoff Checklist

Before handing off a change:

1. Run the smallest relevant tests first.
2. Run `pnpm typecheck` for cross-package type coverage.
3. Run `pnpm test:unit`.
4. Run `pnpm test:integration` if platform/Mastra/DB behavior changed.
5. Run `pnpm test:e2e` if Worker routes or auth changed.
6. Run `pnpm test:smoke` before claiming deployed-worker health.
7. Update `01_technical_architecture.md` if runtime architecture changed.
8. Update `02_adding_agents_and_workflows.md` if agent/workflow extension rules changed.
