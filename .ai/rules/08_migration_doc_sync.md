# ABOUTME: Rule requiring every DB migration to update the architecture doc in the same PR
# ABOUTME: Prevents the kind of accumulated drift that produced .ai/analyses/06_*.md

# Migration → Architecture Doc Sync Rule

**Status**: Active
**Last Updated**: 2026-05-03
**References**: [knowledges/01_technical_architecture.md, analyses/06_knowledge_docs_audit_2026_05_03.md, packages/platform/src/db/migrations/]

---

## Purpose

Every PR that adds or modifies a file under `packages/platform/src/db/migrations/` MUST also update `.ai/knowledges/01_technical_architecture.md` in the same PR. The architecture doc is the contract for what the system contains; if the doc and the schema diverge, the doc rots silently.

This rule exists because migration `004_project_settings_foundation.sql` added 3 tables, 3 repositories, 8 services, and ~10 routes — none reflected in the architecture doc — and the drift was only caught by an audit ~6 weeks later (see `analyses/06_knowledge_docs_audit_2026_05_03.md`).

---

## What To Update

For each migration, walk the architecture doc and update the sections affected by the migration's actual code-level impact:

| Migration impact | Architecture section | What changes |
|---|---|---|
| New tables | §5 Data model | Add table name + 1-line purpose. Bump the "platform-managed tables, N total" count. |
| Renamed columns / tables | §5 Data model | Rename in place; if the rename has product implications, note in §12 Key decisions. |
| New repository (`packages/platform/src/db/repositories/<name>.ts`) | §3 Module table (`db/repositories/*` row) and §13 Directory map | Add to the comma-separated list in §3; add to the file map in §13 if non-trivial. |
| New service (`packages/platform/src/services/<name>.ts`) | §3 Module table and §13 Directory map | Add a dedicated row in §3 with a 1-2 sentence description of its responsibility. |
| New route mounted in `packages/app/src/server/factory.ts` or `packages/worker/src/index.ts` | §6 HTTP API surface | Add to the `Authenticated` table or create a subsection if a new route family is introduced. |
| New env var consumed | §3 (where read), `usage_guide.md` env block, AND `.env.example` / `packages/worker/.dev.vars.example` | All four must agree. |
| New seed data with a non-obvious convention (e.g., kebab-case `agent_id` while the registry is camelCase) | §5 Data model — add a **Convention** note explaining what the data is and is not used for | Document the asymmetry so future contributors don't assume a join. |

Schema-only migrations (no new repos/services/routes — e.g., a column-only ALTER) need only the §5 update.

---

## Self-Check Before Merging

Before requesting review on a migration PR, run through:

1. Did I add new `CREATE TABLE` statements? → §5 Data model lists them all and the count matches.
2. Did I add a file under `packages/platform/src/db/repositories/`? → §3 module table mentions it.
3. Did I add a file under `packages/platform/src/services/`? → §3 module table has a dedicated row.
4. Did I add a route in `packages/app/src/server/factory.ts` or `packages/worker/src/index.ts`? → §6 HTTP API surface includes it (with method + 1-line purpose).
5. Did the migration seed any data with a convention that isn't immediately obvious? → §5 has a **Convention** note.
6. Did I bump the "as of YYYY-MM-DD" footer at the top of the architecture doc?

If any answer is "no" because the migration genuinely doesn't touch that aspect, that's fine — but the answer to (6) should always be "yes" for any architecture-affecting PR.

---

## Out Of Scope

- This rule covers `packages/platform/src/db/migrations/`. Mastra-managed schema (provisioned by `initMastraSchema()`) is out of scope; if the Mastra-managed table count changes after a `@mastra/core` or `@mastra/pg` upgrade, that's tracked under §10 (Runtime compatibility notes), not here.
- Frontend-only changes (`packages/web/`, `packages/ui/`) don't need architecture-doc updates unless they expose a new public route or env var.

---

## Why Not A Hook?

A pre-commit / CI hook that *requires* a doc edit alongside any migration is tempting but wrong: trivial migrations (e.g., adding a missing index) shouldn't force a doc change. Trust the contributor + this checklist over a mechanical block. If drift recurs despite this rule, revisit and consider tooling.
