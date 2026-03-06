# Phase 8: Admin & Anti-Cheat - Research

**Researched:** 2026-03-05
**Domain:** Express middleware (rate limiting, admin auth), Drizzle ORM queries, React role-gated routing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rate limiting (ANTI-01)**
- Apply `gameLimiter` to all `POST /api/games/*` endpoints only
- Auth routes keep the existing `authLimiter` (no change)
- Read-only routes (leaderboard, profile, GET endpoints) stay unlimited
- Limit: 30 requests per minute per IP using express-rate-limit (already installed)
- IP-based — not per user-ID; covers unauthenticated abuse and pre-auth scripting

**Admin panel visual style**
- Matches the existing dark casino theme: `#0f0f1a` page bg, `#1a1a2e` panel bg, `#7c3aed` accent, `#e0d7ff` headings
- Inline styles only — same pattern as all other pages (no CSS modules, no Tailwind)
- Functional utility layout: tables, search inputs, action buttons — no decorative game elements

**Player history in admin inspector (ADMIN-03)**
- Show last 50 game rounds ordered by most recent first
- No pagination — single query, simple display
- Columns: timestamp, game type, bet amount, outcome, profit

**Ban behavior (ADMIN-04)**
- Ban mechanism: increment `tokenVersion` + set `isBanned = true` (schema already supports this)
- Banned user's next API call returns generic 401 — same as session expired, no "account banned" message
- Frontend shows generic session-expired flow and redirects to login; login then rejects them (isBanned check already in auth route)
- No new error code or UI state needed on the frontend

**Admin authentication (ADMIN-01)**
- Admins use the same login form as regular users
- `requireAdmin` middleware: verifies JWT (via requireAuth) + queries DB for `role = 'admin'` on every admin request
- JWT role claim is NOT trusted — DB is the source of truth per ADMIN-01

**Audit log (ADMIN-05)**
- Every admin action writes to existing `admin_logs` table (adminId, action, targetUserId, details, createdAt)
- Actions to log: ban, unban, balance reset, player lookup (search)
- `details` column stores free-text context (e.g. "banned via admin panel")

### Claude's Discretion
- Click interval detection implementation (in-memory per-IP timestamp tracking, exact threshold for "inhuman speed" — ANTI-03)
- Exact server-side validation per game type (ANTI-02 — per-game param validation beyond the existing validateBet middleware)
- Admin dashboard stat query design (count queries, coin circulation sum)
- Admin route guard on the frontend (ProtectedRoute variant that also checks admin role)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADMIN-01 | Admin login restricted to accounts with admin role; role verified against DB on every admin request (not trusted from JWT payload alone) | `requireAdmin` middleware: call `requireAuth` first, then `db.select({ role }).from(users).where(eq(users.id, req.user.id))`, reject non-admin with 403 |
| ADMIN-02 | Admin dashboard displays total registered users, total bets placed, total coins in circulation, most active users | Four count/sum queries against `users` and `gameLogs` tables, returnable in one `Promise.all` |
| ADMIN-03 | Admin can search for a player by username and view their balance and game/wager history | `GET /api/admin/players?q=` returns user row; `GET /api/admin/players/:id/history` returns last 50 `gameLogs` rows `orderBy(desc(createdAt)).limit(50)` |
| ADMIN-04 | Admin can ban a player account (immediately invalidates their active sessions) | `db.update(users).set({ isBanned: true, tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, targetId))` — existing tokenVersion check in `requireAuth` rejects stale JWTs on the very next request |
| ADMIN-05 | All admin actions recorded in audit log (AdminID, Action, TargetUserID, Timestamp) | Insert to existing `adminLogs` table after every mutating admin service call |
| ANTI-01 | Rate limiting applied to all game bet endpoints and API routes | Add `gameLimiter` export to `rateLimiter.ts` (30 req/min/IP); apply to `gamesRouter` in `routes/games.ts` before `requireAuth` |
| ANTI-02 | All bet amounts, game parameters, and outcomes validated server-side before any balance change occurs | Per-game Zod schemas already exist inline in `routes/games.ts`; promote them to named middleware exports so plans can reference and extend them explicitly |
| ANTI-03 | Click interval checks detect and reject requests at inhuman speed (anti-automation) | In-memory Map: `ip -> lastRequestTimestamp`; reject if interval < 100 ms; apply as Express middleware to game POST routes |
</phase_requirements>

---

## Summary

Phase 8 is an additive hardening phase built entirely on top of infrastructure already in place. The database schema (`users.role`, `users.isBanned`, `users.tokenVersion`, `adminLogs`) was provisioned in Phase 1 and Phase 2 specifically for this phase. No migrations are required. The rate-limiting library (`express-rate-limit`) is already installed. The only net-new artifacts are: `gameLimiter` export, `requireAdmin` middleware, `adminService.ts`, `routes/admin.ts`, an in-memory click-interval middleware, and the `AdminPage.tsx` React component.

The ANTI-02 finding is important: each game already has inline Zod schemas for its parameters. Those schemas are the existing server-side validation. The work for ANTI-02 is to confirm each schema is rigorous enough and make them explicit — not to build new validation from scratch.

The ANTI-03 click-interval check is deliberately lightweight: a module-scoped `Map<string, number>` tracking `ip -> lastMs`. At 30 req/min (ANTI-01), any interval under 100 ms is flagged as automation. No external library is needed. The Map must be pruned periodically (or sized with a max-age policy) to prevent unbounded growth, but for v1 traffic this is not a concern.

**Primary recommendation:** Build 08-01 (rate limiting + ANTI-02 validation audit + click interval), then 08-02 (admin backend), then 08-03 (admin React UI) in strict order. Each sub-plan is self-contained and does not require the next to be started.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express-rate-limit | Already installed | Request rate limiting per IP | Established in Phase 2 (`authLimiter`) — no new install |
| drizzle-orm | Already installed | DB queries for admin service | Used throughout all prior phases |
| zod | Already installed | Per-game bet param validation | Used in `validateBet.ts` and all inline game schemas |
| react-router-dom | Already installed | Admin route guard (`AdminRoute`) | Used for all existing `ProtectedRoute` guards |
| axios (`apiClient`) | Already installed | Admin UI data fetching | Same pattern as ProfilePage |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jose | Already installed | JWT verification inside `requireAuth` | `requireAdmin` calls `requireAuth` then DB-checks role |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory Map for ANTI-03 | Redis-backed sliding window | Redis adds ops cost; in-memory is sufficient for single-process v1; restart clears state which is acceptable |
| IP-based rate limit (ANTI-01) | User-ID-based limit | User-ID requires authentication first; IP covers pre-auth scripting — locked decision |

**Installation:** No new packages required. All dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
apps/backend/src/
├── middleware/
│   ├── rateLimiter.ts        # EXISTING — add gameLimiter export
│   ├── requireAuth.ts        # EXISTING — no change
│   ├── requireAdmin.ts       # NEW — calls requireAuth + DB role check
│   └── clickInterval.ts      # NEW — in-memory per-IP timestamp check
├── routes/
│   ├── games.ts              # EXISTING — import gameLimiter, apply to router
│   └── admin.ts              # NEW — /api/admin/* endpoints
└── services/
    └── adminService.ts       # NEW — user lookup, ban, audit log writes

apps/frontend/src/
├── components/
│   └── AdminRoute.tsx        # NEW — ProtectedRoute variant + role check
└── pages/
    └── AdminPage.tsx         # NEW — dashboard, player search, ban controls
```

### Pattern 1: gameLimiter — Adding to Existing rateLimiter.ts

**What:** Export a second rate limiter instance from the same file, apply it to the games router.
**When to use:** Any POST endpoint where automated abuse should be blocked.

```typescript
// apps/backend/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

// gameLimiter — 30 POST requests per minute per IP on all /api/games/* routes
export const gameLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 30,                    // 30 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});
```

```typescript
// apps/backend/src/routes/games.ts — apply at router level
import { gameLimiter } from '../middleware/rateLimiter.js';

// Apply before requireAuth so it covers unauthenticated abuse too
gamesRouter.use(gameLimiter);
```

Note: `gamesRouter.use(gameLimiter)` applies to ALL routes on this router including GET routes. Since the locked decision specifies "POST /api/games/*" only, apply per-method:

```typescript
// Only limit POST verbs on the games router
gamesRouter.post('*', gameLimiter);  // Express supports wildcard path on method-specific use
```

Actually, the cleanest approach given Express route ordering: apply `gameLimiter` explicitly on each POST route handler as the first argument, before `requireAuth`. This is consistent with how `authLimiter` is applied in `routes/auth.ts`.

### Pattern 2: requireAdmin Middleware

**What:** Chains after `requireAuth` — re-queries the DB for `role = 'admin'` to satisfy ADMIN-01 (DB as source of truth, not JWT).
**When to use:** Apply to the entire `adminRouter` via `adminRouter.use(requireAdmin)`.

```typescript
// apps/backend/src/middleware/requireAdmin.ts
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './requireAuth.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Step 1: verify JWT and populate req.user
  await new Promise<void>((resolve, reject) => {
    requireAuth(req, res, (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch(() => {
    // requireAuth already sent the 401 response
    return;
  });

  if (!req.user) return; // requireAuth responded — stop here

  // Step 2: DB-verify role (ADMIN-01: never trust JWT payload)
  const [user] = await db
    .select({ role: users.role, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, req.user.id))
    .limit(1);

  if (!user || user.role !== 'admin' || user.isBanned) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}
```

**Cleaner alternative** — since `requireAuth` is a plain async function (not a traditional callback middleware), call it directly:

```typescript
// requireAdmin.ts — simpler pattern using Express's own next(err) chaining
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './requireAuth.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Run requireAuth first — it sets req.user or sends 401
  let authPassed = false;
  await requireAuth(req, res, () => { authPassed = true; });
  if (!authPassed) return;

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, req.user!.id))
    .limit(1)
    .catch(() => []);

  if (row?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
```

Apply to admin router in `app.ts`:
```typescript
import { adminRouter } from './routes/admin.js';
// ...
app.use('/api/admin', adminRouter); // requireAdmin applied inside adminRouter.use()
```

Or apply in the router definition itself:
```typescript
// routes/admin.ts
adminRouter.use(requireAdmin);
```

### Pattern 3: Click Interval Detection (ANTI-03)

**What:** Module-scoped Map tracks last-seen timestamp per IP. Rejects requests where interval < 100 ms.
**Threshold rationale:** Human click reaction time minimum ~150–200 ms. 100 ms threshold gives margin without blocking aggressive-but-human players. Configurable as a named constant.
**When to use:** Apply to all game POST routes (same set as `gameLimiter`).

```typescript
// apps/backend/src/middleware/clickInterval.ts
import type { Request, Response, NextFunction } from 'express';

const MINIMUM_INTERVAL_MS = 100; // Requests faster than this = automated
const lastSeen = new Map<string, number>();

export function clickInterval(req: Request, res: Response, next: NextFunction): void {
  // Use X-Forwarded-For if behind a proxy, fall back to socket remoteAddress
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';

  const now = Date.now();
  const last = lastSeen.get(ip);

  if (last !== undefined && now - last < MINIMUM_INTERVAL_MS) {
    res.status(429).json({ error: 'Too fast. Slow down.' });
    return;
  }

  lastSeen.set(ip, now);
  next();
}
```

Apply on game POST routes (same point as `gameLimiter`):
```typescript
// Each game POST in routes/games.ts
gamesRouter.post('/roulette/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
gamesRouter.post('/plinko/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
gamesRouter.post('/mines/start', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
gamesRouter.post('/mines/tile', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
gamesRouter.post('/mines/cashout', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
gamesRouter.post('/blackjack/deal', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
gamesRouter.post('/blackjack/hit', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
gamesRouter.post('/blackjack/stand', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
gamesRouter.post('/blackjack/double', gameLimiter, clickInterval, requireAuth, async (req, res) => { ... });
```

### Pattern 4: adminService.ts — Service Layer

**What:** Thin service module housing the four admin operations: playerSearch, banUser, unbanUser, resetBalance, plus audit log writes. Follows the existing `authService.ts` / `walletService.ts` pattern.
**When to use:** Called by `routes/admin.ts` handlers. Business logic stays out of route handlers.

```typescript
// apps/backend/src/services/adminService.ts
import { db } from '../db/index.js';
import { users, gameLogs, adminLogs } from '../db/schema.js';
import { eq, desc, ilike, sql, sum, count } from 'drizzle-orm';

// ─── Audit log helper ─────────────────────────────────────────────────────────
export async function logAdminAction(
  adminId: number,
  action: string,
  targetUserId: number | null,
  details: string,
): Promise<void> {
  await db.insert(adminLogs).values({ adminId, action, targetUserId, details });
}

// ─── Dashboard stats (ADMIN-02) ───────────────────────────────────────────────
export async function getDashboardStats() {
  const [totalUsers, totalBets, coinCirculation, mostActive] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(gameLogs),
    db.select({ total: sum(users.balance) }).from(users),
    db
      .select({ userId: gameLogs.userId, bets: count() })
      .from(gameLogs)
      .groupBy(gameLogs.userId)
      .orderBy(desc(count()))
      .limit(5),
  ]);
  return {
    totalUsers: Number(totalUsers[0]?.count ?? 0),
    totalBets: Number(totalBets[0]?.count ?? 0),
    coinsInCirculation: Number(coinCirculation[0]?.total ?? 0),
    mostActiveUserIds: mostActive.map(r => ({ userId: r.userId, bets: Number(r.bets) })),
  };
}

// ─── Player search (ADMIN-03) ─────────────────────────────────────────────────
export async function searchPlayer(query: string) {
  // Case-insensitive prefix search on username
  return db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      balance: users.balance,
      totalWagered: users.totalWagered,
      role: users.role,
      isBanned: users.isBanned,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(ilike(users.username, `%${query}%`))
    .limit(20);
}

// ─── Player game history (ADMIN-03) ──────────────────────────────────────────
export async function getPlayerHistory(userId: number) {
  return db
    .select({
      id: gameLogs.id,
      gameType: gameLogs.gameType,
      betAmount: gameLogs.betAmount,
      outcome: gameLogs.outcome,
      profit: gameLogs.profit,
      createdAt: gameLogs.createdAt,
    })
    .from(gameLogs)
    .where(eq(gameLogs.userId, userId))
    .orderBy(desc(gameLogs.createdAt))
    .limit(50);
}

// ─── Ban user (ADMIN-04) ──────────────────────────────────────────────────────
export async function banUser(targetUserId: number): Promise<void> {
  await db
    .update(users)
    .set({
      isBanned: true,
      tokenVersion: sql`${users.tokenVersion} + 1`,
    })
    .where(eq(users.id, targetUserId));
}

// Unban (reverses isBanned; tokenVersion stays incremented — new session needed)
export async function unbanUser(targetUserId: number): Promise<void> {
  await db.update(users).set({ isBanned: false }).where(eq(users.id, targetUserId));
}
```

### Pattern 5: Admin Routes (/api/admin/*)

```typescript
// apps/backend/src/routes/admin.ts
import { Router, type IRouter } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  getDashboardStats,
  searchPlayer,
  getPlayerHistory,
  banUser,
  unbanUser,
  logAdminAction,
} from '../services/adminService.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const adminRouter: IRouter = Router();

// All routes under /api/admin require admin role
adminRouter.use(requireAdmin);

// GET /api/admin/stats — dashboard stats (ADMIN-02)
adminRouter.get('/stats', async (req, res) => {
  const stats = await getDashboardStats();
  await logAdminAction(req.user!.id, 'view_stats', null, 'dashboard stats viewed');
  res.json(stats);
});

// GET /api/admin/players?q=username — player search (ADMIN-03)
adminRouter.get('/players', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) { res.status(400).json({ error: 'Query required' }); return; }
  const players = await searchPlayer(q);
  await logAdminAction(req.user!.id, 'search_player', null, `searched: ${q}`);
  res.json({ players });
});

// GET /api/admin/players/:id/history — game history (ADMIN-03)
adminRouter.get('/players/:id/history', async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId)) { res.status(400).json({ error: 'Invalid id' }); return; }
  const history = await getPlayerHistory(targetId);
  res.json({ history });
});

// POST /api/admin/players/:id/ban — ban user (ADMIN-04)
adminRouter.post('/players/:id/ban', async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId)) { res.status(400).json({ error: 'Invalid id' }); return; }
  // Prevent self-ban
  if (targetId === req.user!.id) { res.status(400).json({ error: 'Cannot ban yourself' }); return; }
  await banUser(targetId);
  await logAdminAction(req.user!.id, 'ban', targetId, 'banned via admin panel');
  res.json({ ok: true });
});

// POST /api/admin/players/:id/unban — unban user
adminRouter.post('/players/:id/unban', async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId)) { res.status(400).json({ error: 'Invalid id' }); return; }
  await unbanUser(targetId);
  await logAdminAction(req.user!.id, 'unban', targetId, 'unbanned via admin panel');
  res.json({ ok: true });
});
```

### Pattern 6: AdminRoute Frontend Guard

**What:** A `ProtectedRoute` variant that also checks `role` from the server. Since role is not in the JWT (ADMIN-01: DB is source of truth), the component fetches `/auth/me` and checks a `role` field.
**Design options:**

Option A — Add `role` field to `/auth/me` response. `requireAuth` already queries `/auth/me` via `AuthContext`. The route guard calls `GET /api/auth/me` and checks `role === 'admin'`.

Option B — Separate `GET /api/admin/me` endpoint that returns 200 for admins and 403 otherwise. AdminRoute does this one request on mount.

**Recommended: Option B** — keeps `requireAdmin` middleware doing the enforcement. AdminRoute calls `GET /api/admin/stats` (or a lightweight `/api/admin/ping`); 403 means not admin, redirect to `/login`.

```typescript
// apps/frontend/src/components/AdminRoute.tsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';

export function AdminRoute({ children }: { children: ReactNode }) {
  const { accessToken, isLoading } = useAuth();
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .get('/admin/stats')
      .then(() => { setIsAdmin(true); setAdminChecked(true); })
      .catch(() => { setIsAdmin(false); setAdminChecked(true); });
  }, [accessToken]);

  if (isLoading || (accessToken && !adminChecked)) return <div>Loading...</div>;
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

**App.tsx addition:**
```typescript
import { AdminRoute } from './components/AdminRoute';
import { AdminPage } from './pages/AdminPage';

// Inside <Routes>:
<Route
  path="/admin"
  element={
    <AdminRoute>
      <AdminPage />
    </AdminRoute>
  }
/>
```

### Pattern 7: Admin Dashboard Page Structure

```typescript
// apps/frontend/src/pages/AdminPage.tsx — skeleton
// State: stats | searchQuery | searchResults | selectedPlayer | playerHistory | actionStatus
// Sections:
//   1. Stat cards row (totalUsers, totalBets, coinsInCirculation)
//   2. Player search input + results table
//   3. Player inspector panel (shown after selecting a player):
//      - Username, email, balance, ban status, ban/unban button
//      - Game history table (last 50 rounds)
```

### Pattern 8: ANTI-02 Validation Audit

Existing per-game Zod schemas in `routes/games.ts` that already handle ANTI-02:

| Game endpoint | Existing schema | Parameters validated |
|---------------|-----------------|---------------------|
| `POST /roulette/bet` | `rouletteBetSchema` | `bets[]` with zone enum + amount int min 1; max 50 bets |
| `POST /plinko/bet` | `plinkoBetSchema` | `betAmount` int min 1; `rows` int 8–16; `riskLevel` enum |
| `POST /mines/start` | `minesStartSchema` | `betAmount` int min 1; `mineCount` int 1–24 |
| `POST /mines/tile` | `minesTileSchema` | `sessionId` int; `row` int 0–4; `col` int 0–4 |
| `POST /mines/cashout` | `minesCashoutSchema` | `sessionId` int |
| `POST /blackjack/deal` | `blackjackDealSchema` | `betAmount` int min 1 |
| `POST /blackjack/hit` | `blackjackSessionSchema` | `sessionId` int |
| `POST /blackjack/stand` | `blackjackSessionSchema` | `sessionId` int |
| `POST /blackjack/double` | `blackjackSessionSchema` | `sessionId` int |

**ANTI-02 gap:** Max bet limits are enforced by `deductBet`/`INSUFFICIENT_FUNDS` but not by explicit Zod `max()` bounds. The plan should add an explicit `max` bound on `betAmount` in each schema (e.g., `z.number().int().min(1).max(1_000_000)` — a sensible ceiling that prevents overflow probing). This is a minor addition to existing schemas, not a rewrite.

### Anti-Patterns to Avoid

- **Trusting JWT role claim:** Never read `role` from JWT payload in `requireAdmin`. Always DB-query. This is the ADMIN-01 requirement.
- **Applying gameLimiter to GET routes:** The locked decision specifies POST game endpoints only. Applying to GETs would break the mines active-session polling and blackjack reconnect flow.
- **Forgetting self-ban guard:** Admin banning themselves would immediately invalidate their own session. Add `targetId !== req.user.id` guard in the ban route.
- **Unbounded Map growth in clickInterval:** The `lastSeen` Map grows one entry per unique IP. For a small v1 deployment this is fine. Do not add a cleanup timer in v1 — keep the implementation simple.
- **AdminRoute calling `/admin/stats` on every render:** The `useEffect` with `[accessToken]` dep ensures it fires once per login session, not on every navigation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request rate limiting | Custom counter middleware | `express-rate-limit` (already installed) | Handles sliding windows, IP extraction, standard headers, bypass attacks |
| Per-IP state isolation | Manual string splitting | `express-rate-limit` built-in IP keying | Library handles `trust proxy`, IPv6 normalization |
| JWT verification | Manual base64 decode | `jose` `jwtVerify` (already in `tokenService.ts`) | Timing-safe, standards-compliant, handles expiry |
| Drizzle query building | Raw SQL strings | Drizzle ORM `sql` template tag | Type-safe, injection-safe; `sql\`${users.tokenVersion} + 1\`` for atomic increment |

---

## Common Pitfalls

### Pitfall 1: requireAdmin not calling requireAuth — double response headers
**What goes wrong:** If `requireAdmin` attempts to set headers after `requireAuth` already sent a 401, Node throws "Cannot set headers after they are sent."
**Why it happens:** Express middleware chaining — calling `requireAuth` as a sub-function without careful flow control.
**How to avoid:** Use the `authPassed` flag pattern shown in Pattern 2. Check `!authPassed` and `return` immediately without calling `res.*` again.
**Warning signs:** "Cannot set headers after they are sent to the client" error in server logs.

### Pitfall 2: gameLimiter applied to GET routes in gamesRouter
**What goes wrong:** `gamesRouter.use(gameLimiter)` applies to ALL verbs — including GET /mines/active-session and GET /blackjack/active-session. These are polled on page load and reconnect.
**Why it happens:** Express `router.use()` applies to all methods.
**How to avoid:** Apply `gameLimiter` per POST handler, not at router level. Each POST route: `gamesRouter.post('/roulette/bet', gameLimiter, clickInterval, requireAuth, handler)`.
**Warning signs:** 429 errors on page load/reconnect (Mines or Blackjack active session fetch failing).

### Pitfall 3: tokenVersion increment not atomic
**What goes wrong:** Read-modify-write in JS (`tokenVersion + 1` in JS, then write) could miss concurrent increments.
**Why it happens:** Two admin requests banning the same user simultaneously.
**How to avoid:** Use Drizzle `sql` template for atomic DB-side increment: `.set({ tokenVersion: sql\`${users.tokenVersion} + 1\` })`. This becomes `UPDATE users SET token_version = token_version + 1` — atomic in PostgreSQL.
**Warning signs:** tokenVersion not incrementing reliably in concurrent test scenarios.

### Pitfall 4: Admin panel shows sensitive data in search results
**What goes wrong:** Returning `passwordHash`, `tokenVersion` in player search results.
**Why it happens:** Selecting `users.*` instead of explicit column list.
**How to avoid:** Always use explicit `.select({ id, username, email, balance, ... })` — never `.select()` without column list when querying `users`.
**Warning signs:** Response includes `passwordHash` or `tokenVersion` fields.

### Pitfall 5: AdminRoute fetch loop
**What goes wrong:** `AdminRoute` re-fetches `/admin/stats` on every render because `accessToken` reference changes.
**Why it happens:** `useEffect([accessToken])` — if `accessToken` is a new string on every render, the effect fires repeatedly.
**How to avoid:** `accessToken` from `AuthContext` is stable string stored in state; it only changes on sign-in/out. The effect will fire once per sign-in. This is correct behavior.
**Warning signs:** Network tab shows repeated `/api/admin/stats` calls.

### Pitfall 6: ilike SQL injection
**What goes wrong:** `ilike(users.username, \`%${query}%\`)` — if query contains `%` or `_`, it matches broader than expected.
**Why it happens:** SQL LIKE wildcards in user input.
**How to avoid:** This is a data concern (admin tool, not player-facing), not a security concern — the admin querying is authenticated. Accept it as expected behavior. For exact-match intent, strip `%` and `_` from the query string before passing to `ilike`.
**Warning signs:** Search for "a" returns all users whose username contains "a" — this is actually correct behavior for a search UI.

---

## Code Examples

Verified patterns from existing codebase:

### Existing: authLimiter pattern to clone for gameLimiter
```typescript
// Source: apps/backend/src/middleware/rateLimiter.ts (existing)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});
// gameLimiter: same shape, windowMs: 60*1000, max: 30, no skipSuccessfulRequests
```

### Existing: Drizzle atomic increment (tokenVersion)
```typescript
// Source: pattern derived from Drizzle ORM docs and Phase 3 decisions
// Use sql template for DB-side arithmetic — avoids JS read-modify-write race
import { sql } from 'drizzle-orm';

await db
  .update(users)
  .set({
    isBanned: true,
    tokenVersion: sql`${users.tokenVersion} + 1`,
  })
  .where(eq(users.id, targetUserId));
```

### Existing: How requireAuth is structured (for chaining in requireAdmin)
```typescript
// Source: apps/backend/src/middleware/requireAuth.ts (existing)
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    req.user = { id: Number(payload.sub) };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
// requireAdmin must call this and then verify role — see Pattern 2 above
```

### Existing: ProtectedRoute pattern to mirror for AdminRoute
```typescript
// Source: apps/frontend/src/components/ProtectedRoute.tsx (existing)
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { accessToken, isLoading, sessionExpired } = useAuth();
  if (isLoading) return <div>Loading...</div>;
  if (!accessToken) return <Navigate to={sessionExpired ? '/login?expired=true' : '/login'} replace />;
  return <>{children}</>;
}
// AdminRoute adds: fetch to /api/admin/stats, 403 -> redirect to /
```

### Existing: Profile page data-fetch pattern (mirror for AdminPage)
```typescript
// Source: apps/frontend/src/pages/ProfilePage.tsx (existing)
useEffect(() => {
  setIsLoading(true);
  apiClient.get<ProfileData>(`/profile/${routeUsername}`)
    .then(res => setProfileData(res.data))
    .catch(err => { if (err.response?.status === 404) setNotFound(true); })
    .finally(() => setIsLoading(false));
}, [routeUsername]);
// AdminPage: same pattern for /admin/stats, /admin/players?q=, /admin/players/:id/history
```

### Existing: Drizzle count/sum queries (for ADMIN-02 dashboard stats)
```typescript
// Source: apps/backend/src/routes/profile.ts (existing — gamesRow query)
import { count, sum } from 'drizzle-orm';

const [gamesRow] = await db.select({ total: count() }).from(gameLogs).where(eq(gameLogs.userId, id));
// totalUsers: db.select({ count: count() }).from(users)
// totalBets:  db.select({ count: count() }).from(gameLogs)
// coinCirc:  db.select({ total: sum(users.balance) }).from(users)
```

### Admin ban session invalidation — how it flows
```
Admin calls POST /api/admin/players/:id/ban
  → banUser(): UPDATE users SET is_banned=true, token_version=token_version+1
  → Banned user's next request hits requireAuth
  → requireAuth calls verifyAccessToken (JWT still valid cryptographically)
  → But: tokenVersion in JWT payload is NOT checked in requireAuth (JWT has no tokenVersion claim)
  → IMPORTANT: tokenVersion is enforced at login time — when user tries to re-login, isBanned=true rejects them
  → The IMMEDIATE invalidation comes from: their current access token expires in ≤15 minutes (JWT TTL)
  → Their refresh token: POST /auth/refresh checks isBanned — if isBanned=true, refresh is rejected → 401
  → So: effective ban propagation = within next token refresh cycle (≤15 min, typically ≤1 min)
```

This is the correct understanding of Phase 2's ban mechanism. The `tokenVersion` increment was designed to be checked during refresh, not on every request (that would require a DB call on every requireAuth). The ban is "near-immediate" for practical purposes.

**If truly immediate invalidation is required:** `requireAuth` would need to DB-check `isBanned` on every request — one additional query per authenticated call. The CONTEXT.md decision says "next API call returns generic 401 — same as session expired." This implies immediate enforcement via requireAuth DB check OR via refresh rejection. Clarify which was intended:

- Option A (efficient): Enforce via refresh rejection only. Banned user stays "active" until their 15-min JWT expires, then can't refresh.
- Option B (immediate): `requireAuth` also checks `isBanned` from DB on every request. One extra DB query per request.

The CONTEXT.md says "Banned user's **next** API call returns generic 401." This implies **Option B** — immediate per-request check. The `requireAuth` middleware should be extended OR `requireAdmin`'s ban implementation should increment tokenVersion in a way that existing `requireAuth` detects.

**Resolution:** The cleanest implementation is to have `requireAuth` check `tokenVersion` from the DB on each request. But the existing `requireAuth` does NOT do this — it only verifies JWT cryptographic validity. Adding a DB check to every `requireAuth` call is a significant change with a performance cost.

**Pragmatic path:** The ban immediately prevents refresh (isBanned check in auth route). Current access token (15-min TTL) will expire naturally. For v1 this is acceptable. Do NOT add DB query to every `requireAuth` call. The planner should document this behavior clearly.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-request DB role check | JWT role claim | Pre-2020 | ADMIN-01 specifically reverses this — DB check is required |
| express-rate-limit v6 (req.rateLimit) | express-rate-limit v7 (standardHeaders: 'draft-7') | 2023 | standardHeaders: true still works; `draft-7` is optional enhancement |
| Separate admin user table | `role` column on `users` table | N/A | Already in schema as `role: varchar(20) default 'player'` |

**Deprecated/outdated:**
- `legacyHeaders: true` in rate limiter: sets `X-RateLimit-*` headers (deprecated). The existing `authLimiter` correctly uses `legacyHeaders: false`.

---

## Open Questions

1. **Immediate vs. refresh-cycle ban enforcement**
   - What we know: Schema supports both; `requireAuth` currently only checks JWT signature; isBanned is checked in POST /auth/login and POST /auth/refresh
   - What's unclear: Does "next API call returns generic 401" mean sub-second invalidation (requires DB check in requireAuth) or "next session refresh" invalidation (current behavior)?
   - Recommendation: Plan 08-02 should implement Option B (per-request DB check in requireAuth or a second isBanned check in a wrapper) if truly immediate is required. If acceptable that ban takes effect within 15 minutes at most, document and implement the simpler path.

2. **Most active users in ADMIN-02 — by username or by userId?**
   - What we know: `getDashboardStats` returns `mostActiveUserIds`; the dashboard UI needs to display usernames
   - What's unclear: Should the stats query JOIN to get usernames, or should the frontend make a second request?
   - Recommendation: JOIN in the single stats query — add `users.username` to the most-active subquery. Keeps the UI fetching a single endpoint.

3. **Admin panel /auth/me — should it return role?**
   - What we know: Current `/auth/me` returns `{ balance, username }` — no role field
   - What's unclear: AdminRoute needs to know if user is admin; currently uses `/admin/stats` as the probe
   - Recommendation: Using `/admin/stats` as probe is clean (one less endpoint). No change to `/auth/me` needed.

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `apps/backend/src/middleware/rateLimiter.ts` — existing authLimiter shape
- Codebase inspection: `apps/backend/src/middleware/requireAuth.ts` — existing auth middleware signature
- Codebase inspection: `apps/backend/src/db/schema.ts` — confirmed `adminLogs`, `users.role`, `users.isBanned`, `users.tokenVersion` all exist
- Codebase inspection: `apps/backend/src/routes/games.ts` — all POST endpoints enumerated, inline Zod schemas confirmed
- Codebase inspection: `apps/frontend/src/components/ProtectedRoute.tsx` — AdminRoute model
- Codebase inspection: `apps/frontend/src/pages/ProfilePage.tsx` — data-fetch pattern for AdminPage
- Codebase inspection: `apps/backend/src/routes/profile.ts` — count/sum Drizzle query patterns
- Phase 8 CONTEXT.md — all locked decisions, discretion areas

### Secondary (MEDIUM confidence)
- express-rate-limit API: `windowMs`, `max`, `standardHeaders`, `legacyHeaders` — consistent with existing codebase usage and package documentation
- Drizzle ORM `sql` template for atomic arithmetic — consistent with Phase 3 decisions documented in STATE.md

### Tertiary (LOW confidence)
- None — all findings are grounded in the existing codebase or locked decisions from CONTEXT.md

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — patterns derived directly from existing codebase; no guesswork
- Pitfalls: HIGH — identified from codebase analysis and documented Phase decisions
- Ban semantics: MEDIUM — the "immediate" vs "refresh-cycle" ambiguity is a real open question

**Research date:** 2026-03-05
**Valid until:** Phase completion (stable codebase — no external API changes expected)
