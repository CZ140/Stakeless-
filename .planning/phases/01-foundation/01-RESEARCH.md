# Phase 1: Foundation - Research

**Researched:** 2026-02-27
**Domain:** Monorepo scaffolding — pnpm workspaces, TypeScript, Express, React/Vite, Drizzle ORM, PostgreSQL
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- pnpm workspaces as the package manager
- Task runner approach: Claude's discretion (concurrently or similar lightweight tool)
- Single `pnpm dev` start command runs app processes only — migrations run separately via dedicated script (e.g. `pnpm db:migrate`)
- Dev mode only for this phase — production build config deferred to a later phase
- Docker Compose provides PostgreSQL only — app runs natively via `pnpm dev`
- `tsx watch` for backend hot reload (no compile step, fast restarts)
- Frontend on port 5173 (Vite default), backend on port 3000 (Express default)
- Frontend dev server proxies `/api` requests to backend at :3000
- `apps/frontend` and `apps/backend` for the two main apps
- `packages/shared` for TypeScript types shared between frontend and backend (API response shapes, game types, etc.)
- Drizzle schema and database utilities live inside `apps/backend/src/db/`
- Root monorepo package name: `gambling-website`
- Hard crash on startup if required env vars are missing: `process.exit(1)` with a clear message listing the missing variables
- Zod for env validation and type inference
- Required vars for Phase 1: `DATABASE_URL` (postgres connection string) and `PORT` (Express listen port)
- `.env.example` committed to repo with placeholder values; `.env` is gitignored
- Balance column must be stored as BIGINT, never FLOAT — hard constraint on the schema
- Tables required in Phase 1: `users`, `game_logs`, `game_sessions`, `daily_bonus_claims`, `admin_logs`
- Docker Compose should be postgres-only (not full-stack containerization)

### Claude's Discretion

- Exact task runner choice (concurrently vs turborepo vs npm-run-all) — pick what fits the workspace structure
- TypeScript strictness level — use strict mode by default
- Exact folder layout within `apps/backend/src/` and `apps/frontend/src/`
- Express middleware ordering and exact CORS/helmet config

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 1 is pure project scaffolding with no user-facing features. The goal is a working monorepo where `pnpm dev` starts both the React/Vite frontend (port 5173) and the Express backend (port 3000), a PostgreSQL database is available via Docker Compose, Drizzle migrations create all five required tables with correct column types, and TypeScript compiles cleanly across all packages.

The stack is well-established and well-documented. Every tool chosen (pnpm workspaces, Vite, Express, Drizzle, tsx, Zod) has mature documentation and is in active widespread use as of early 2026. No experimental or edge-case technology is involved — this is a standard Node/React full-stack scaffold.

The two highest-risk areas during this phase are (1) the `packages/shared` cross-package TypeScript wiring — getting the `workspace:*` protocol and tsconfig `paths` or `references` correct so imports resolve at dev time — and (2) the `balance` BIGINT constraint: JavaScript's `number` type only safely represents integers up to 2^53, so `bigint({ mode: 'number' })` is safe for any realistic virtual balance but the Drizzle column declaration must use `bigint()` not `integer()` to ensure the PostgreSQL column is BIGINT, not INT.

**Primary recommendation:** Scaffold using `concurrently` at the root for `pnpm dev`, use `pnpm --filter` to delegate into each workspace, and wire shared types via `workspace:*` + direct TypeScript path aliases in each app's tsconfig. Keep the Drizzle schema in `apps/backend/src/db/schema.ts` and run `drizzle-kit generate` + `drizzle-kit migrate` as the db:migrate script.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | 9.x | Package manager + workspace orchestration | Fastest installs, strict dependency isolation, `workspace:*` protocol for cross-package references |
| TypeScript | 5.x | Static typing across all packages | Industry standard; strict mode eliminates whole class of runtime errors |
| Vite | 6.x | React frontend dev server + bundler | Fastest HMR in class; native ESM; built-in proxy for API forwarding |
| React | 19.x | UI framework | User decision implicit in project setup |
| Express | 4.x | HTTP server framework | Mature, minimal, well-typed; `@types/express` fully maintained |
| tsx | 4.x | TypeScript runner + watch mode for backend | Replaces nodemon+ts-node; uses esbuild internally; no tsconfig needed; fast restarts |
| drizzle-orm | 0.45.x | TypeScript ORM for PostgreSQL | Type-safe queries, schema-as-code, lightweight, excellent migration CLI |
| drizzle-kit | 0.27.x | Migration CLI for drizzle-orm | Generates SQL migrations from schema diff; `generate` + `migrate` workflow |
| pg (node-postgres) | 8.x | PostgreSQL driver | Official, battle-tested; works with drizzle-orm/node-postgres adapter |
| zod | 3.x | Runtime schema validation | Used for env var validation; provides TypeScript inference from schema |
| concurrently | 9.x | Run multiple npm scripts in parallel | Simple, no config; color-coded output; cross-platform |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/pg | 8.x | TypeScript types for pg driver | Required when using pg with TypeScript |
| @types/express | 4.x | TypeScript types for Express | Required; installed as devDependency in apps/backend |
| helmet | 8.x | Express security headers middleware | Apply at app.ts level; good baseline for later phases |
| cors | 2.x | Express CORS middleware | Needed during dev since frontend and backend are on different ports (even with proxy, useful to have configured) |
| dotenv | 16.x | Load .env file into process.env | Required before Zod env validation runs at backend startup |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| concurrently | turborepo, npm-run-all | turborepo adds caching/pipeline config complexity; npm-run-all is deprecated (no updates since 2021); concurrently is simpler and actively maintained |
| concurrently | pnpm --parallel (-r) | `pnpm -r run dev --parallel` works but output formatting is worse; concurrently gives color-coded labeled output per process |
| tsx watch | nodemon + ts-node | tsx is faster (esbuild), no config file needed, no node-gyp compilation issues |
| node-postgres (pg) | postgres.js | postgres.js uses prepared statements by default which can cause issues in some environments; pg is more widely used and has `@types/pg` maintained separately |
| drizzle-kit migrate | drizzle-kit push | `push` bypasses migration files and mutates schema directly — dangerous for any shared DB; `generate`+`migrate` creates versioned SQL files |

**Installation (root devDependencies):**
```bash
pnpm add -w -D concurrently typescript
```

**Installation (apps/backend):**
```bash
pnpm --filter backend add express pg drizzle-orm zod dotenv cors helmet
pnpm --filter backend add -D tsx drizzle-kit @types/express @types/pg @types/node @types/cors
```

**Installation (apps/frontend):**
```bash
pnpm --filter frontend add react react-dom
pnpm --filter frontend add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```

**Installation (packages/shared):**
```bash
pnpm --filter shared add -D typescript
```

---

## Architecture Patterns

### Recommended Project Structure

```
gambling-website/                  # root — pnpm workspace
├── pnpm-workspace.yaml            # workspace glob config
├── package.json                   # root scripts: dev, db:migrate, etc.
├── tsconfig.base.json             # shared TS base config (strict, target, etc.)
├── docker-compose.yml             # postgres only
├── .env.example                   # committed placeholder env vars
├── .env                           # gitignored actual secrets
│
├── apps/
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json          # extends ../../tsconfig.base.json
│   │   ├── drizzle.config.ts      # drizzle-kit config
│   │   └── src/
│   │       ├── index.ts           # entry point: load env, start server
│   │       ├── app.ts             # Express app factory
│   │       ├── env.ts             # Zod env validation — imported first
│   │       ├── db/
│   │       │   ├── index.ts       # drizzle db instance export
│   │       │   ├── schema.ts      # all pgTable definitions
│   │       │   └── migrations/    # generated SQL migration files
│   │       └── routes/
│   │           └── health.ts      # GET /api/health — phase 1 smoke test
│   │
│   └── frontend/
│       ├── package.json
│       ├── tsconfig.json          # extends ../../tsconfig.base.json
│       ├── vite.config.ts         # proxy /api → localhost:3000
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           └── App.tsx            # minimal placeholder
│
└── packages/
    └── shared/
        ├── package.json           # name: "@gambling/shared"
        ├── tsconfig.json
        └── src/
            └── index.ts           # exported types
```

### Pattern 1: pnpm Workspace Configuration

**What:** `pnpm-workspace.yaml` declares the workspace glob; each package is treated as an independent unit with its own `node_modules` symlinked from the shared store.

**When to use:** Always — this is the workspace declaration that activates pnpm's monorepo features.

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Root `package.json`:
```json
{
  "name": "gambling-website",
  "private": true,
  "scripts": {
    "dev": "concurrently --names \"backend,frontend\" -c \"blue,green\" \"pnpm --filter backend dev\" \"pnpm --filter frontend dev\"",
    "db:migrate": "pnpm --filter backend db:migrate",
    "db:generate": "pnpm --filter backend db:generate"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Pattern 2: Cross-Package Type Sharing (workspace: protocol)

**What:** `packages/shared` exports TypeScript types. Frontend and backend reference it via the `workspace:*` protocol, which pnpm resolves to the local package at install time — no building/publishing needed.

**When to use:** Any time a type is needed in both frontend and backend (API response shapes, game types, etc.)

```json
// apps/backend/package.json (dependencies section)
{
  "dependencies": {
    "@gambling/shared": "workspace:*"
  }
}
```

```json
// packages/shared/package.json
{
  "name": "@gambling/shared",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

Note on tsconfig for the shared package: point `main` and `types` directly at `.ts` source files. This means TypeScript resolves to source at dev time with no build step. Each consuming package's tsconfig needs `paths` to wire the resolution if using project references.

### Pattern 3: Zod Env Validation with Hard Crash

**What:** Validate `process.env` at startup using Zod `safeParse`. If validation fails, log all missing/invalid variables and call `process.exit(1)`. This file is imported BEFORE anything else in `index.ts`.

**When to use:** Always — this is the Phase 1 env crash requirement.

```typescript
// apps/backend/src/env.ts
// Source: Zod docs + established Node.js pattern
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => i.path.join('.'))
    .join(', ');
  console.error(`[startup] Missing or invalid env vars: ${missing}`);
  process.exit(1);
}

export const env = parsed.data;
```

```typescript
// apps/backend/src/index.ts — FIRST import
import 'dotenv/config';
import { env } from './env';
import { app } from './app';

app.listen(env.PORT, () => {
  console.log(`Backend running on http://localhost:${env.PORT}`);
});
```

### Pattern 4: Drizzle Schema with BIGINT balance

**What:** All table definitions in a single `schema.ts`. The `balance` column uses `bigint({ mode: 'number' })` which maps to PostgreSQL BIGINT and TypeScript `number`. For the primary key, use `serial` (auto-increment INTEGER) for surrogate PKs — only `balance` and similar monetary/counter columns need BIGINT.

**When to use:** This is the schema definition for the required five tables.

```typescript
// apps/backend/src/db/schema.ts
// Source: https://orm.drizzle.team/docs/column-types/pg
import {
  pgTable,
  serial,
  varchar,
  bigint,
  timestamp,
  integer,
  text,
  boolean,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  totalWagered: bigint('total_wagered', { mode: 'number' }).notNull().default(0),
  totalProfit: bigint('total_profit', { mode: 'number' }).notNull().default(0),
  totalLoss: bigint('total_loss', { mode: 'number' }).notNull().default(0),
  role: varchar('role', { length: 20 }).notNull().default('player'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
});

export const gameLogs = pgTable('game_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  gameType: varchar('game_type', { length: 50 }).notNull(),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  outcome: varchar('outcome', { length: 50 }).notNull(),
  profit: bigint('profit', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const gameSessions = pgTable('game_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  gameType: varchar('game_type', { length: 50 }).notNull(),
  state: text('state').notNull(),           // JSON game state
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const dailyBonusClaims = pgTable('daily_bonus_claims', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  claimedAt: timestamp('claimed_at').notNull().defaultNow(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
});

export const adminLogs = pgTable('admin_logs', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').notNull().references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  targetUserId: integer('target_user_id').references(() => users.id),
  details: text('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### Pattern 5: Drizzle Config and Migration Script

```typescript
// apps/backend/drizzle.config.ts
// Source: https://orm.drizzle.team/docs/drizzle-config-file
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

```json
// apps/backend/package.json scripts section
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "typecheck": "tsc --noEmit"
  }
}
```

### Pattern 6: Vite Proxy Configuration

**What:** Vite dev server proxies `/api/*` requests to the Express backend at port 3000. The browser sees all requests as same-origin (port 5173), eliminating CORS issues during development.

```typescript
// apps/frontend/vite.config.ts
// Source: https://vite.dev/config/server-options
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

### Pattern 7: Docker Compose (PostgreSQL only)

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: gambling_dev
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

volumes:
  postgres_data:
```

### Pattern 8: Shared tsconfig.base.json

```json
// tsconfig.base.json (root)
// Source: TypeScript official docs + Total TypeScript recommendations
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

Individual package tsconfig.json files extend this base:
```json
// apps/backend/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "drizzle.config.ts"]
}
```

```json
// apps/frontend/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "vite.config.ts"]
}
```

Note: The frontend tsconfig must override `module` and `moduleResolution` to `ESNext`/`Bundler` because Vite handles module resolution, not Node. Backend uses `NodeNext`.

### Anti-Patterns to Avoid

- **`module: "CommonJS"` in tsconfig:** Don't use CJS in a new 2025 project. The backend should use `NodeNext` (ESM-compatible) and the frontend uses `ESNext`/`Bundler`. Mixing CJS and ESM causes import errors at runtime.
- **`integer()` for balance:** Using `integer()` in Drizzle maps to PostgreSQL INT4 (max ~2.1 billion). The CONTEXT.md mandates BIGINT. Always use `bigint('balance', { mode: 'number' })`.
- **`drizzle-kit push` in place of `generate`+`migrate`:** Push bypasses migration files and makes schema changes irreversible without a manual diff. Always use `generate` then `migrate`.
- **Importing shared package before `pnpm install` runs:** The `workspace:*` protocol requires `pnpm install` to have run at the root. The package is not in node_modules until then.
- **Putting `.env` in version control:** The `.env` file must be in `.gitignore`. Only `.env.example` (with placeholder values, never real secrets) is committed.
- **Running migrations inside `pnpm dev`:** The user decision says migrations run separately. Do not embed migration execution in the server startup — this would make `pnpm dev` dangerous to run against a shared database.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var validation with clear errors | Custom if/throw chain over process.env | Zod `safeParse` | Zod gives structured errors, TypeScript inference, coercion (string→number for PORT), and the same validation library used elsewhere |
| Parallel process runner | Shell `&` or custom scripts | concurrently | Shell `&` has no color-coded output, no graceful kill-all on CTRL+C on Windows, no labeled prefixes |
| TypeScript hot reload | nodemon + tsc --watch | tsx watch | tsx uses esbuild, requires zero config, is ~10x faster to start than ts-node+tsc-watch combo |
| SQL migrations | Manual SQL files or custom runner | drizzle-kit generate + migrate | Drizzle handles schema diffing, generates idempotent SQL, tracks migration state in `__drizzle_migrations` table |
| PostgreSQL connection pool | Custom pg.Client management | pg.Pool via drizzle() | Pool manages connection lifecycle, retries, and max connection limits automatically |
| Health endpoint | Complex monitoring setup | Simple `GET /api/health` returning `{ status: 'ok' }` | Sufficient for Phase 1 smoke test; monitoring comes in later phases |

**Key insight:** This phase is almost entirely "configure standard tools correctly" rather than "build custom solutions." Every hand-rolled alternative would be inferior to the maintained library.

---

## Common Pitfalls

### Pitfall 1: workspace:* Package Not Resolving in TypeScript

**What goes wrong:** `import { Foo } from '@gambling/shared'` resolves correctly at runtime (pnpm linked the package) but TypeScript reports "Cannot find module" or uses the wrong types.

**Why it happens:** TypeScript resolves modules independently from Node. If `packages/shared/package.json` has `"main": "./dist/index.js"` but the dist folder doesn't exist (no build step in dev), TypeScript can't find types.

**How to avoid:** Point `main` and `types` in `packages/shared/package.json` directly at the source `.ts` files: `"main": "./src/index.ts"` and `"types": "./src/index.ts"`. This works at dev time because tsx and Vite both understand TypeScript source directly. Alternatively, use TypeScript project references with `composite: true` — but for this project's simplicity, pointing at source is sufficient.

**Warning signs:** `TS2307: Cannot find module '@gambling/shared'` — check that `pnpm install` has been run and that the `types` field in the shared package.json points to `.ts` not `.js`.

### Pitfall 2: BIGINT Returns a String from node-postgres

**What goes wrong:** Even though `bigint({ mode: 'number' })` is set in Drizzle schema, the raw pg driver returns BIGINT columns as JavaScript `string` by default, not `number`. Drizzle's type mapping handles this, but if you ever query with raw `pool.query()` instead of through the Drizzle client, you'll get strings.

**Why it happens:** PostgreSQL's BIGINT type exceeds JavaScript's safe integer range (>2^53), so the pg driver conservatively returns them as strings to avoid precision loss.

**How to avoid:** Always query through the Drizzle `db` instance, not through the raw `pool`. If raw queries are needed in the future, use `pg-types` to install a custom type parser for OID 20 (BIGINT).

**Warning signs:** TypeScript reports correct types but `balance === "1000"` passes a strict equality check against `"1000"` not `1000` — add a test that checks `typeof balance === 'number'`.

### Pitfall 3: Frontend tsconfig moduleResolution Mismatch

**What goes wrong:** Using `moduleResolution: "NodeNext"` in the frontend tsconfig causes Vite to fail or TypeScript to report errors on imports that Vite handles fine.

**Why it happens:** Vite acts as the module bundler for the frontend — it handles all import resolution, not Node. TypeScript's `NodeNext` resolution requires explicit `.js` extensions on relative imports, which conflicts with Vite's convention.

**How to avoid:** Frontend tsconfig must use `"module": "ESNext"` and `"moduleResolution": "Bundler"` (introduced in TypeScript 5.0). The backend tsconfig uses `"module": "NodeNext"`.

**Warning signs:** Errors like `TS2307: Cannot find module './foo'` on valid imports, or Vite errors about module resolution.

### Pitfall 4: PostgreSQL Container Not Ready When Migrations Run

**What goes wrong:** Running `pnpm db:migrate` immediately after `docker compose up` fails because PostgreSQL is still initializing.

**Why it happens:** The container starts immediately but PostgreSQL takes a few seconds to accept connections. Without a healthcheck, `docker compose up` reports success before the database is ready.

**How to avoid:** The docker-compose.yml healthcheck using `pg_isready` (as shown in the architecture pattern) catches this. Additionally, the `db:migrate` script should be run after confirming the container is healthy: `docker compose up -d && docker compose ps` to check status before migrating. Alternatively, add a retry loop in the migration script.

**Warning signs:** `connect ECONNREFUSED 127.0.0.1:5432` on first migrate attempt after container start.

### Pitfall 5: concurrently Kills Only One Process on CTRL+C

**What goes wrong:** On some systems (especially Windows), pressing CTRL+C only kills the concurrently process, leaving tsx and Vite child processes running on their ports.

**Why it happens:** Signal propagation to child processes is inconsistent across platforms.

**How to avoid:** Use `concurrently --kill-others-on-fail` flag. Also acceptable: `--kill-others` to kill all processes when any one exits. The `pnpm dev` script should include these flags.

```json
"dev": "concurrently --kill-others-on-fail --names \"backend,frontend\" -c \"blue,green\" \"pnpm --filter backend dev\" \"pnpm --filter frontend dev\""
```

**Warning signs:** After CTRL+C, running `pnpm dev` again fails with `EADDRINUSE :3000` or `:5173`.

### Pitfall 6: drizzle.config.ts Reads DATABASE_URL Before dotenv Loads

**What goes wrong:** `drizzle-kit generate` or `drizzle-kit migrate` fails with `undefined` DATABASE_URL because `dotenv` hasn't been called when drizzle.config.ts is evaluated.

**Why it happens:** drizzle-kit reads `drizzle.config.ts` directly — it doesn't automatically load `.env`.

**How to avoid:** Add `dotenv/config` import at the top of `drizzle.config.ts`:
```typescript
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
```

**Warning signs:** `Error: URL is required` or connection error even when `.env` exists.

---

## Code Examples

Verified patterns from official sources:

### Drizzle db instance initialization

```typescript
// apps/backend/src/db/index.ts
// Source: https://orm.drizzle.team/docs/get-started-postgresql
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import * as schema from './schema';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle({ client: pool, schema });
```

### BIGINT column definition (official)

```typescript
// Source: https://orm.drizzle.team/docs/column-types/pg
import { bigint, pgTable } from 'drizzle-orm/pg-core';

// mode: 'number' → TypeScript type is number, PostgreSQL type is BIGINT
// Safe for values up to 2^53-1 (JS Number.MAX_SAFE_INTEGER)
// Virtual currency balances will never approach this limit
balance: bigint('balance', { mode: 'number' }).notNull().default(0)
```

### Vite proxy (official)

```typescript
// apps/frontend/vite.config.ts
// Source: https://vite.dev/config/server-options
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
},
```

### Zod env validation with process.exit(1)

```typescript
// apps/backend/src/env.ts
// Source: Established pattern verified across multiple sources
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().min(1024).max(65535),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`[startup] Environment validation failed:\n${missing}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
```

### Express app factory pattern

```typescript
// apps/backend/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
```

### .env.example

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gambling_dev
PORT=3000
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| nodemon + ts-node | tsx watch | 2022-2023 | tsx is faster (esbuild), zero-config, handles both CJS and ESM |
| tsconfig.json paths aliases | workspace:* protocol + source pointing | 2021+ | pnpm workspace protocol replaces manual path aliases for cross-package resolution |
| `serial()` primary keys | `integer().generatedAlwaysAsIdentity()` | Drizzle ~0.30+ | Identity columns are the modern PostgreSQL recommendation (serials use sequences with less control); both work fine for this phase |
| drizzle-kit push for development | drizzle-kit generate + migrate | Always recommended | push is for prototyping only; generate+migrate creates versioned files |
| `moduleResolution: "node"` | `moduleResolution: "NodeNext"` (backend) / `"Bundler"` (frontend) | TypeScript 4.7 (NodeNext), 5.0 (Bundler) | Modern module resolution handles ESM correctly; old "node" mode predates ESM |

**Deprecated/outdated:**
- `ts-node`: Superseded by `tsx` for dev watch and `tsc` for prod compilation. ts-node has slow startup and complex ESM support.
- `npm-run-all`: Last published 2021, maintenance mode. Use `concurrently` instead.
- `drizzle-orm-pg` (old package name): Replaced by the unified `drizzle-orm` package with driver-specific adapters. Do not install `drizzle-orm-pg`.

---

## Open Questions

1. **packages/shared module system compatibility**
   - What we know: The frontend (Vite, ESM) and backend (Node.js, NodeNext/ESM) both can import TypeScript directly when using tsx and Vite respectively.
   - What's unclear: If any shared utility functions (not just types) are added to `packages/shared`, whether the dual CJS/ESM publish concern arises.
   - Recommendation: Phase 1 should only export TypeScript *types* (interfaces, enums) from packages/shared — no runtime values. This eliminates the module system concern entirely until it's actually needed.

2. **drizzle-kit version pinning**
   - What we know: drizzle-orm is at 0.45.x stable; drizzle-kit v1.0.0-beta.2 exists but is beta.
   - What's unclear: Whether drizzle-kit v1 beta introduces breaking config changes vs 0.27.x stable.
   - Recommendation: Use stable drizzle-kit 0.27.x for Phase 1. Do not use v1 beta in the project foundation.

---

## Sources

### Primary (HIGH confidence)

- [Drizzle ORM - PostgreSQL column types](https://orm.drizzle.team/docs/column-types/pg) — bigint mode options, column type reference
- [Drizzle ORM - Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration) — pgTable, generatedAlwaysAsIdentity, timestamp patterns
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations) — generate vs push vs migrate commands
- [Drizzle ORM - drizzle.config.ts](https://orm.drizzle.team/docs/drizzle-config-file) — required config fields, dialect/schema/out
- [Drizzle ORM - PostgreSQL get started](https://orm.drizzle.team/docs/get-started-postgresql) — node-postgres initialization pattern
- [Vite server options](https://vite.dev/config/server-options) — server.proxy exact syntax
- [tsx watch mode docs](https://tsx.is/watch-mode) — CLI syntax, exclusion behavior, caveats
- [pnpm workspaces](https://pnpm.io/workspaces) — workspace: protocol, linking behavior

### Secondary (MEDIUM confidence)

- [Total TypeScript TSConfig cheat sheet](https://www.totaltypescript.com/tsconfig-cheat-sheet) — verified tsconfig strict + target + moduleResolution recommendations
- [tsx vs ts-node comparison — Better Stack](https://betterstack.com/community/guides/scaling-nodejs/tsx-vs-ts-node/) — verified tsx is the current standard
- [Live types in TypeScript monorepo — Colin McDonnell](https://colinhacks.com/essays/live-types-typescript-monorepo) — workspace package source-pointing pattern

### Tertiary (LOW confidence)

- Various community blog posts on concurrently setup (multiple sources agree; not verified against official docs but pattern is simple and consistent)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core library choices verified via official docs and Context7
- Architecture: HIGH — patterns derived from official Drizzle, Vite, pnpm, and TypeScript documentation
- Pitfalls: MEDIUM-HIGH — BIGINT string issue and tsconfig moduleResolution verified; concurrently signal handling is LOW (community pattern, platform-dependent behavior)

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (30 days — stack is stable; drizzle minor versions may update)
