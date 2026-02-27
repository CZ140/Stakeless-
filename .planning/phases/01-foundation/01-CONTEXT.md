# Phase 1: Foundation - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Project scaffolding: monorepo structure, TypeScript configuration, PostgreSQL schema via Drizzle, Express skeleton, and React/Vite frontend scaffold. No user-facing features. This phase unblocks every subsequent phase.

</domain>

<decisions>
## Implementation Decisions

### Monorepo tooling
- pnpm workspaces as the package manager
- Task runner approach: Claude's discretion (concurrently or similar lightweight tool)
- Single `pnpm dev` start command runs app processes only — migrations run separately via dedicated script (e.g. `pnpm db:migrate`)
- Dev mode only for this phase — production build config deferred to a later phase

### Dev environment
- Docker Compose provides PostgreSQL only — app runs natively via `pnpm dev`
- `tsx watch` for backend hot reload (no compile step, fast restarts)
- Frontend on port 5173 (Vite default), backend on port 3000 (Express default)
- Frontend dev server proxies `/api` requests to backend at :3000

### Package structure
- `apps/frontend` and `apps/backend` for the two main apps
- `packages/shared` for TypeScript types shared between frontend and backend (API response shapes, game types, etc.)
- Drizzle schema and database utilities live inside `apps/backend/src/db/`
- Root monorepo package name: `gambling-website`

### Env config behavior
- Hard crash on startup if required env vars are missing: `process.exit(1)` with a clear message listing the missing variables
- Zod for env validation and type inference
- Required vars for Phase 1: `DATABASE_URL` (postgres connection string) and `PORT` (Express listen port)
- `.env.example` committed to repo with placeholder values; `.env` is gitignored

### Claude's Discretion
- Exact task runner choice (concurrently vs turborepo vs npm-run-all) — pick what fits the workspace structure
- TypeScript strictness level — use strict mode by default
- Exact folder layout within `apps/backend/src/` and `apps/frontend/src/`
- Express middleware ordering and exact CORS/helmet config

</decisions>

<specifics>
## Specific Ideas

- Balance column must be stored as BIGINT, never FLOAT — this is a hard constraint on the schema
- Tables required in Phase 1: `users`, `game_logs`, `game_sessions`, `daily_bonus_claims`, `admin_logs`
- Docker Compose should be postgres-only (not full-stack containerization)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-27*
