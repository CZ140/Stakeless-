# Phase 7: Player Profile - Research

**Researched:** 2026-03-05
**Domain:** Profile API (Drizzle/Express), Recharts charting (LineChart + BarChart), AuthContext username exposure
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Chart: balance over time** — one data point per game round (not aggregated), all-time history, backend returns `{ x: createdAt, y: balanceAfter }[]` ordered by createdAt ASC
- **Chart: wagered per day** — aggregated by calendar day (GROUP BY date), all-time history, backend returns `{ date: string, wagered: number }[]` ordered by date ASC
- **Charts arrangement** — tabbed layout: "Balance History" | "Wagered / Day" tabs below the stats grid; only one chart rendered at a time
- **Stats layout** — username as prominent page heading; 5 stat cards in a grid (Balance, Leaderboard Rank, Total Wagered, Total Profit, Games Played)
- **Profile navigation** — Header: auth-gated "Profile" link to `/profile/{own username}`; Leaderboard: usernames become `<Link to="/profile/:username">`
- **Route** — `/profile/:username`, public (no ProtectedRoute wrapper)
- **Public access** — `GET /api/profile/:username` requires no auth; returns public stats and chart data
- **Chart library** — Recharts (LineChart for balance, BarChart for wagered per day)

### Claude's Discretion
- Exact stat card visual styling (size, icon, label/value arrangement) — consistent with existing dark theme
- Empty state for users with no game history (show stats at zero, hide or show empty charts)
- Chart axis formatting (coin values formatted with toLocaleString, dates formatted as MMM DD)
- Recharts component variants (LineChart for balance, BarChart for wagered per day)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROF-01 | Each user has a profile page displaying: username, current balance, leaderboard rank, total wagered, total profit, and total games played | `users` table has balance/totalWagered/totalProfit; rank via window function (same pattern as leaderboard); gamesPlayed via COUNT on gameLogs |
| PROF-02 | Profile page displays a balance over time chart | gameLogs.balanceAfter + createdAt already logged per round; Recharts LineChart with data points per row |
| PROF-03 | Profile page displays a wagered per day chart | gameLogs.betAmount + createdAt exist; aggregate with DATE_TRUNC + GROUP BY in one Drizzle sql`` query |
</phase_requirements>

---

## Summary

Phase 7 adds a public player profile page at `/profile/:username`. The backend needs one new route — `GET /api/profile/:username` — that is public (no auth required), looks up the user by username, aggregates stats from the `users` table plus a COUNT from `game_logs`, and returns two separate chart series drawn from `game_logs`. The frontend needs one new page component (ProfilePage), a public route in App.tsx, a Header modification (auth-gated Profile link), and a LeaderboardPage modification (username cells become links).

The critical new dependency is **Recharts** — it is NOT currently installed in the frontend package.json. It must be added before Plan 02 begins. Recharts 3.7.0 explicitly supports React 19 (`peerDependencies: react ^19.0.0`) and is the industry standard charting library for React.

**Primary recommendation:** Build the backend endpoint first (Plan 01), using `sql` template expressions with `DATE_TRUNC` for the wagered-per-day aggregation. Build the frontend (Plan 02) against the working API, installing Recharts as the first task. The AuthContext does NOT currently expose username — Plan 02 must expose it from `/api/auth/me` through AuthContext or decode it from the JWT in the Header component.

**Primary recommendation:** Use `GET /api/profile/:username` (public, no requireAuth), query user by username, compute rank with PostgreSQL window function (same pattern as leaderboard), compute gamesPlayed with `count(*)` on gameLogs, return chart data in two separate arrays.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 3.7.0 (latest) | LineChart + BarChart for balance/wagered charts | Project-specified in CONTEXT.md; peer-deps explicitly include React 19 |
| drizzle-orm | 0.45.0 (already installed) | Profile stats query + gameLogs aggregation | Already the project ORM |
| express | 4.18.x (already installed) | Profile router | Already the project backend framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-is | 19.x (transitive) | Recharts peer dependency | Auto-installed with recharts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | victory, nivo, chart.js | recharts is locked in by CONTEXT.md decision; no alternative needed |

**Installation (frontend only):**
```bash
pnpm --filter frontend add recharts
```

`react-is` is a peer dependency of recharts — confirm it installs transitively. If `pnpm` warns about missing peer, add explicitly:
```bash
pnpm --filter frontend add recharts react-is
```

---

## Architecture Patterns

### Recommended Project Structure

New files to create:
```
apps/backend/src/routes/
└── profile.ts              # GET /api/profile/:username — stats + chart data

apps/frontend/src/pages/
└── ProfilePage.tsx         # Public profile page at /profile/:username
```

Files to modify:
```
apps/backend/src/app.ts     # Register profileRouter at /api/profile
apps/frontend/src/App.tsx   # Add <Route path="/profile/:username" element={<ProfilePage />} />
apps/frontend/src/components/Header.tsx          # Add auth-gated Profile link
apps/frontend/src/pages/LeaderboardPage.tsx      # Wrap usernames in <Link>
apps/frontend/src/contexts/AuthContext.tsx        # Expose username (see critical finding below)
```

### Pattern 1: Profile Route — Public, Optional Auth (matches leaderboard pattern)

The profile endpoint is public. It does NOT use `requireAuth`. It resolves by username (not user ID), following the URL design `/profile/:username`.

**Backend query pattern:**
```typescript
// Source: leaderboard.ts (existing pattern in this project)
import { Router, type IRouter } from 'express';
import { db } from '../db/index.js';
import { users, gameLogs } from '../db/schema.js';
import { eq, sql, asc, count } from 'drizzle-orm';

export const profileRouter: IRouter = Router();

profileRouter.get('/:username', async (req, res) => {
  const { username } = req.params;

  // Look up user by username (public data only — no email/passwordHash)
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      balance: users.balance,
      totalWagered: users.totalWagered,
      totalProfit: users.totalProfit,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // ... queries below
});
```

### Pattern 2: Leaderboard Rank via Window Function (already proven in this project)

The existing leaderboard route uses PostgreSQL window function via Drizzle `sql` for rank. Reuse the same pattern:

```typescript
// Source: apps/backend/src/routes/leaderboard.ts (existing code)
const [balRank] = await db
  .select({
    rank: sql<number>`rank() over (order by ${users.balance} desc)`.mapWith(Number),
  })
  .from(users)
  .where(eq(users.id, user.id));

const balanceRank = balRank?.rank ?? null;
```

### Pattern 3: Games Played Count

The `game_logs` table has one row per game round. COUNT(*) WHERE userId = target gives gamesPlayed:

```typescript
// Source: schema.ts gameLogs table structure, Drizzle count import
import { count } from 'drizzle-orm';

const [gamesRow] = await db
  .select({ total: count() })
  .from(gameLogs)
  .where(eq(gameLogs.userId, user.id));

const gamesPlayed = gamesRow?.total ?? 0;
```

### Pattern 4: Balance Over Time Chart Data

One row per game round, ordered by `createdAt` ASC. The `balanceAfter` column is already recorded in `game_logs` by `settleBet()`:

```typescript
// Source: apps/backend/src/services/walletService.ts — settleBet inserts balanceAfter
const balanceHistory = await db
  .select({
    x: gameLogs.createdAt,   // timestamp
    y: gameLogs.balanceAfter, // bigint (number mode)
  })
  .from(gameLogs)
  .where(eq(gameLogs.userId, user.id))
  .orderBy(asc(gameLogs.createdAt));
```

### Pattern 5: Wagered Per Day Aggregation (GROUP BY DATE_TRUNC)

PostgreSQL `DATE_TRUNC('day', created_at)` groups rows into calendar day buckets. Use Drizzle `sql` template for this:

```typescript
// Source: Drizzle sql`` template pattern (same technique used in walletService.ts)
import { sql, sum, asc } from 'drizzle-orm';

const wageredPerDay = await db
  .select({
    date: sql<string>`DATE_TRUNC('day', ${gameLogs.createdAt})::date::text`,
    wagered: sql<number>`SUM(${gameLogs.betAmount})`.mapWith(Number),
  })
  .from(gameLogs)
  .where(eq(gameLogs.userId, user.id))
  .groupBy(sql`DATE_TRUNC('day', ${gameLogs.createdAt})`)
  .orderBy(asc(sql`DATE_TRUNC('day', ${gameLogs.createdAt})`));
```

This returns `{ date: "2026-02-15", wagered: 1250 }[]` ordered chronologically.

### Pattern 6: Parallel Queries with Promise.all

All profile sub-queries are independent — run them in parallel (same as leaderboard route):

```typescript
const [balRankRow, gamesRow, balanceHistory, wageredPerDay] = await Promise.all([
  // rank query
  // gamesPlayed count query
  // balance history query
  // wagered per day query
]);
```

### Pattern 7: Backend Route Registration

Register the new router in `app.ts` using the established pattern:

```typescript
// Source: apps/backend/src/app.ts (existing registration pattern)
import { profileRouter } from './routes/profile.js';
// ...
app.use('/api/profile', profileRouter);
```

### Pattern 8: Frontend — Adding a Public Route (matches LeaderboardPage)

Leaderboard is already a public route (no ProtectedRoute wrapper). Profile follows the identical pattern:

```typescript
// Source: apps/frontend/src/App.tsx — LeaderboardPage route is the model
import { ProfilePage } from './pages/ProfilePage';
// ...
<Route path="/profile/:username" element={<ProfilePage />} />
```

### Pattern 9: React Router useParams for :username

```typescript
// ProfilePage.tsx
import { useParams } from 'react-router-dom';

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  // fetch /api/profile/:username
}
```

### Pattern 10: Recharts LineChart — Balance Over Time

```typescript
// Source: Recharts official docs recharts.org/api/LineChart
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// data shape: { x: string (ISO timestamp), y: number }[]
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={balanceHistory}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
    <XAxis
      dataKey="x"
      tickFormatter={(v: string) => {
        const d = new Date(v);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }}
      stroke="#a0a0c0"
    />
    <YAxis tickFormatter={(v: number) => v.toLocaleString()} stroke="#a0a0c0" />
    <Tooltip
      formatter={(v: number) => v.toLocaleString()}
      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)' }}
    />
    <Line type="monotone" dataKey="y" stroke="#7c3aed" dot={false} strokeWidth={2} />
  </LineChart>
</ResponsiveContainer>
```

### Pattern 11: Recharts BarChart — Wagered Per Day

```typescript
// Source: Recharts official docs recharts.org/api/BarChart
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// data shape: { date: string, wagered: number }[]
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={wageredPerDay}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
    <XAxis
      dataKey="date"
      tickFormatter={(v: string) => {
        const d = new Date(v + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }}
      stroke="#a0a0c0"
    />
    <YAxis tickFormatter={(v: number) => v.toLocaleString()} stroke="#a0a0c0" />
    <Tooltip
      formatter={(v: number) => v.toLocaleString()}
      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)' }}
    />
    <Bar dataKey="wagered" fill="#7c3aed" radius={[3, 3, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

### Pattern 12: Tab Toggle (simple useState — no Zustand needed)

```typescript
type ChartTab = 'balance' | 'wagered';
const [activeChart, setActiveChart] = useState<ChartTab>('balance');
```

Tab button style: match existing LeaderboardPage tab button pattern — `backgroundColor: activeChart === tab ? '#7c3aed' : '#1e1e3a'`.

### Pattern 13: Stat Card Grid

5 stat cards in a CSS Grid (inline style, matching project pattern):

```typescript
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '32px' }}>
  {/* one card per stat */}
</div>

// Each card:
<div style={{ backgroundColor: '#1a1a2e', borderRadius: '8px', padding: '20px 16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
  <div style={{ fontSize: '0.75rem', color: '#a0a0c0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Balance</div>
  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0d7ff' }}>12,345</div>
</div>
```

### Pattern 14: Auth-Gated Header Link

The Header currently only destructures `signOut` from `useAuth()`. Add `accessToken` to detect auth state, then expose `username` (see Critical Finding below):

```typescript
// Header.tsx — add Profile link
const { signOut, accessToken, username } = useAuth();
// ...
{accessToken && username && (
  <Link
    to={`/profile/${username}`}
    style={{
      color: '#e0d7ff',
      textDecoration: 'none',
      fontSize: '0.875rem',
      padding: '6px 14px',
      borderRadius: '4px',
      border: '1px solid rgba(255,255,255,0.15)',
    }}
  >
    Profile
  </Link>
)}
```

### Anti-Patterns to Avoid

- **Fetching username from JWT on the frontend:** The access token is stored as an opaque string in closure scope (`accessToken` module variable in `client.ts`). Do not decode it client-side — expose `username` through `AuthContext` via `/api/auth/me` instead.
- **Using `requireAuth` on the profile endpoint:** Profile is public. Using requireAuth blocks guest viewing. Use optional auth pattern from leaderboard if needed (not needed here — profile returns public data only).
- **Returning sensitive fields in profile API response:** Never include email, passwordHash, tokenVersion, isBanned from the profile endpoint — public route, public data only.
- **Not handling the 404 case on ProfilePage:** If `GET /api/profile/:username` returns 404, display "User not found" state, not a broken page.
- **Rendering Recharts at 0-height:** Recharts `ResponsiveContainer` requires a parent with defined height. Wrap in a container with `style={{ height: 300 }}` or set `height={300}` directly on `ResponsiveContainer`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Charts | Custom SVG charts | `recharts` LineChart + BarChart | Axis scaling, tooltips, responsive sizing are non-trivial; Recharts handles all of it |
| Rank computation | JS sort of all users | PostgreSQL `rank() OVER (ORDER BY ...)` window function | Already proven working in leaderboard route; DB-native, scales |
| Date grouping | JS reduce with date string keys | `DATE_TRUNC('day', ...)` GROUP BY in SQL | SQL aggregation is one round-trip; JS approach needs all rows in memory first |
| Tab state | Zustand store | `useState<'balance' | 'wagered'>` | Profile data is local to this page, not shared — no need for global store |

**Key insight:** Every aggregation should happen in PostgreSQL, not JavaScript. The `game_logs` table can grow large; loading all rows into JS to count or group them is wasteful.

---

## Common Pitfalls

### Pitfall 1: AuthContext Does Not Expose Username

**What goes wrong:** The Header "Profile" link needs to link to `/profile/{username}`. But the current `AuthContext` interface (`AuthState` + `AuthContextValue`) only exposes `accessToken`, `isLoading`, `sessionExpired`, `signIn`, and `signOut`. There is NO `username` field.

**Why it happens:** `getProfile()` in `authService.ts` does return username (it's in the `users` select) — but `/api/auth/me` responds with `{ id, email, balance, totalWagered, totalProfit, totalLoss, dailyBonusTimestamp, createdAt, lastLoginAt }` — **username is NOT in the /api/auth/me response shape.**

**How to avoid:** Plan 02 must extend `getProfile()` to include `username` in the returned object, extend `AuthContext` to hold `username: string | null`, and populate it from the `/api/auth/me` call that already happens on mount and on token refresh. Then Header can read `username` from `useAuth()`.

**Warning signs:** TypeScript error when destructuring `username` from `useAuth()` — means AuthContext interface hasn't been updated.

### Pitfall 2: Recharts Not Installed

**What goes wrong:** `import { LineChart } from 'recharts'` causes a module-not-found error at build time.

**Why it happens:** Recharts is not in `apps/frontend/package.json`. The CONTEXT.md names it as the library, but it has never been installed.

**How to avoid:** Plan 01 (or the start of Plan 02 — whichever handles setup) must run `pnpm --filter frontend add recharts`. Confirm with `grep recharts apps/frontend/package.json`.

### Pitfall 3: DATE_TRUNC Returns Timestamp, Not Date String

**What goes wrong:** PostgreSQL `DATE_TRUNC('day', ...)` returns a `timestamptz`, not a `date` string. Without casting, Drizzle may return a JavaScript `Date` object rather than the ISO string the frontend expects.

**Why it happens:** The Drizzle `sql` template passes the raw SQL result through; without explicit casting to `::date::text`, the pg driver may coerce it differently.

**How to avoid:** Use the explicit cast in the SQL template:
```sql
DATE_TRUNC('day', ${gameLogs.createdAt})::date::text
```
This guarantees a YYYY-MM-DD string in the response.

### Pitfall 4: Recharts ResponsiveContainer Requires Non-Zero Parent Height

**What goes wrong:** Chart renders with 0 height — visible as an empty div with no error.

**Why it happens:** `ResponsiveContainer width="100%" height={300}` requires the parent element to have a rendered height. If the parent is `display: flex` with no height constraint, ResponsiveContainer may not resolve its size correctly.

**How to avoid:** Wrap each chart in a `<div style={{ width: '100%', height: 300 }}>` before `<ResponsiveContainer width="100%" height="100%">`, OR use `height={300}` directly on `<ResponsiveContainer>` without a wrapper (simpler).

### Pitfall 5: Leaderboard Rank for Profile Uses Balance Rank Only

**What goes wrong:** The profile spec says "Leaderboard Rank" (singular) — but there are three leaderboard types (balance, wagered, profit). Displaying all three ranks clutters the stat cards; displaying the wrong one is misleading.

**Why it happens:** Ambiguity in the requirement. PROF-01 says "leaderboard rank" without specifying which.

**How to avoid:** Show **balance rank** as the primary leaderboard rank (it's the most prominent leaderboard, shown first on LeaderboardPage). This is consistent with "rank" as most players understand it. The backend only needs the balance rank window function for the profile endpoint.

### Pitfall 6: Leaderboard Username Links Lose Color

**What goes wrong:** Adding `<Link to="/profile/...">` to username cells in LeaderboardPage causes the default browser link styling (blue underline) to appear.

**Why it happens:** React Router `<Link>` renders an `<a>` tag with browser default styles.

**How to avoid:** Add inline style override on the link:
```typescript
<Link
  to={`/profile/${row.username}`}
  style={{ color: 'inherit', textDecoration: 'none' }}
>
  {row.username}
</Link>
```

### Pitfall 7: Empty State When User Has No Game History

**What goes wrong:** Recharts throws or renders nothing if `data={[]}` is passed.

**Why it happens:** New users have zero rows in `game_logs`.

**How to avoid:** Conditionally render charts. If `balanceHistory.length === 0`, show an empty state message ("No game history yet") instead of a chart. Keep stats at 0 (Balance, Total Wagered, Total Profit, Games Played all default to 0 in the database).

---

## Code Examples

### Complete Backend Response Shape

```typescript
// GET /api/profile/:username
// Returns:
{
  username: string,
  balance: number,           // from users.balance (BIGINT → number)
  balanceRank: number,       // PostgreSQL rank() over balance desc
  totalWagered: number,      // from users.totalWagered
  totalProfit: number,       // from users.totalProfit
  gamesPlayed: number,       // COUNT(*) from game_logs
  balanceHistory: { x: string, y: number }[],   // ISO timestamp, balanceAfter
  wageredPerDay: { date: string, wagered: number }[], // YYYY-MM-DD, sum(betAmount)
}
```

### Drizzle: All Profile Queries in Parallel

```typescript
// Source: leaderboard.ts parallel query pattern
const [user] = await db
  .select({ id: users.id, username: users.username, balance: users.balance,
            totalWagered: users.totalWagered, totalProfit: users.totalProfit })
  .from(users)
  .where(eq(users.username, username))
  .limit(1);

if (!user) { res.status(404).json({ error: 'User not found' }); return; }

const [rankRow, gamesRow, balanceHistory, wageredPerDay] = await Promise.all([
  db.select({ rank: sql<number>`rank() over (order by ${users.balance} desc)`.mapWith(Number) })
    .from(users).where(eq(users.id, user.id)),

  db.select({ total: count() }).from(gameLogs).where(eq(gameLogs.userId, user.id)),

  db.select({ x: gameLogs.createdAt, y: gameLogs.balanceAfter })
    .from(gameLogs).where(eq(gameLogs.userId, user.id)).orderBy(asc(gameLogs.createdAt)),

  db.select({
      date: sql<string>`DATE_TRUNC('day', ${gameLogs.createdAt})::date::text`,
      wagered: sql<number>`SUM(${gameLogs.betAmount})`.mapWith(Number),
    })
    .from(gameLogs).where(eq(gameLogs.userId, user.id))
    .groupBy(sql`DATE_TRUNC('day', ${gameLogs.createdAt})`)
    .orderBy(asc(sql`DATE_TRUNC('day', ${gameLogs.createdAt})`)),
]);

res.json({
  username: user.username,
  balance: user.balance,
  balanceRank: rankRow[0]?.rank ?? 1,
  totalWagered: user.totalWagered,
  totalProfit: user.totalProfit,
  gamesPlayed: gamesRow[0]?.total ?? 0,
  balanceHistory: balanceHistory.map(r => ({ x: r.x.toISOString(), y: r.y })),
  wageredPerDay,
});
```

### AuthContext Extension for Username

```typescript
// Source: apps/frontend/src/contexts/AuthContext.tsx — extend existing interface

// Change AuthState to add username
interface AuthState {
  accessToken: string | null;
  username: string | null;   // ADD THIS
  isLoading: boolean;
  sessionExpired: boolean;
}

// Initial state:
const [state, setState] = useState<AuthState>({
  accessToken: null,
  username: null,  // ADD THIS
  isLoading: true,
  sessionExpired: false,
});

// In the mount effect where /api/auth/me is called:
.then((meRes) => {
  useBalanceStore.getState().setBalance(meRes.data.balance);
  setState(prev => ({ ...prev, username: meRes.data.username })); // ADD THIS
})

// authService.ts getProfile() must also return username — add to select and return object
```

### ProfilePage Page Structure

```typescript
// Source: LeaderboardPage.tsx page structure (the template for public pages)
export function ProfilePage() {
  const { username: routeUsername } = useParams<{ username: string }>();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeChart, setActiveChart] = useState<'balance' | 'wagered'>('balance');

  useEffect(() => {
    if (!routeUsername) return;
    setIsLoading(true);
    apiClient.get(`/profile/${routeUsername}`)
      .then(res => setProfileData(res.data))
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setIsLoading(false));
  }, [routeUsername]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', color: '#ffffff' }}>
      <Header />
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
        {/* username heading, stat cards, chart tabs, chart panel */}
      </main>
    </div>
  );
}
```

---

## Critical Findings

### Finding 1: Username NOT in /api/auth/me Response (MUST FIX)

`authService.getProfile()` selects from the `users` table but does NOT include `username` in the returned object:

```typescript
// Current getProfile() return shape (authService.ts line 188-198):
return {
  id: user.id,
  email: user.email,
  balance: user.balance,
  totalWagered: user.totalWagered,
  totalProfit: user.totalProfit,
  totalLoss: user.totalLoss,
  dailyBonusTimestamp: ...,
  createdAt: ...,
  lastLoginAt: ...,
  // *** NO username field ***
};
```

**Plan 02 must:** (1) Add `username` to `authService.getProfile()` return, (2) Add `username: string | null` to `AuthState` in AuthContext, (3) Set username when /api/auth/me resolves.

### Finding 2: Recharts 3.7.0 is React 19 Compatible (CONFIRMED)

```
npm info recharts peerDependencies
{ react: '^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0' }
```

No compatibility shim needed. Install cleanly with `pnpm --filter frontend add recharts`.

### Finding 3: game_logs Has balanceAfter Column (CONFIRMED)

```typescript
// schema.ts line 39:
balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
```

And `settleBet()` in walletService.ts always writes `balanceAfter: newBalance` when inserting a game log row. All game rounds since Phase 3 have complete balance history data — no backfill needed.

### Finding 4: gamesPlayed Has No Stored Column (COMPUTE ON-THE-FLY)

The `users` table has `totalWagered`, `totalProfit`, `totalLoss` as stored aggregate columns but NO `gamesPlayed` counter. Plan 01 must compute this with `count(*)` from `game_logs WHERE userId = target`. This is a single indexed query (userId is a foreign key).

### Finding 5: Route Parameter is :username (not :id)

The public URL is `/profile/:username`. The backend endpoint is `GET /api/profile/:username`. Lookup is by `users.username` (varchar, unique index). This avoids exposing internal user IDs in URLs.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chart.js (imperative, DOM refs) | Recharts (declarative React components) | ~2018+ | Clean JSX syntax, no useRef for canvas needed |
| Recharts v1/v2 (no React 19 support) | Recharts 3.x (explicit React 19 peer dep) | 2024-2025 | Safe to use with this project's React 19 |

**Deprecated/outdated:**
- `victory`, `nivo`: Valid alternatives but not chosen — CONTEXT.md locked Recharts.
- Manual SVG charts: Never appropriate when Recharts covers the use case.

---

## Open Questions

1. **Leaderboard rank — which leaderboard?**
   - What we know: PROF-01 says "leaderboard rank" (singular). Three leaderboard types exist.
   - What's unclear: Whether to show balance rank only, or all three ranks.
   - Recommendation: Show balance rank as "Rank" — it's the primary/first leaderboard and the most intuitive for players. Implementation uses the same `rank() OVER (ORDER BY balance DESC)` window function from the leaderboard route.

2. **react-is peer dependency**
   - What we know: Recharts 3.7.0 lists `react-is ^19.0.0` as a peer dependency.
   - What's unclear: Whether pnpm auto-installs it or warns.
   - Recommendation: Run `pnpm --filter frontend add recharts` and verify. If pnpm warns about missing `react-is`, add `pnpm --filter frontend add react-is` as a follow-up step.

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `apps/backend/src/db/schema.ts` — confirmed gameLogs.balanceAfter, gameLogs.betAmount, gameLogs.createdAt, gameLogs.userId column names
- Codebase inspection: `apps/backend/src/services/authService.ts` — confirmed getProfile() does not return username; confirmed users.username is selected from DB
- Codebase inspection: `apps/backend/src/services/walletService.ts` — confirmed settleBet() always writes balanceAfter to game_logs
- Codebase inspection: `apps/backend/src/routes/leaderboard.ts` — confirmed window function pattern `rank() over (order by ...)` works in this project
- Codebase inspection: `apps/frontend/src/contexts/AuthContext.tsx` — confirmed username is NOT in AuthState interface
- Codebase inspection: `apps/frontend/package.json` — confirmed recharts is NOT installed
- `npm info recharts version` → 3.7.0; `npm info recharts peerDependencies` → explicitly includes React ^19.0.0

### Secondary (MEDIUM confidence)
- WebSearch: Recharts React 19 compatibility confirmed via GitHub issues (React 19 support added in recharts 3.x series)
- Official Recharts docs (recharts.github.io) — LineChart, BarChart, ResponsiveContainer API

### Tertiary (LOW confidence)
- None — all critical findings verified from first-party sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — recharts version confirmed via npm; all other stack is existing project stack
- Architecture: HIGH — all patterns derived from existing working code in this repo
- Pitfalls: HIGH — AuthContext username gap and Recharts install gap confirmed by direct file inspection
- Chart API examples: MEDIUM — derived from official docs structure; exact prop names should be verified against recharts 3.x API during implementation

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (Recharts patch releases are backward-compatible; architecture findings are codebase-specific and don't expire)
