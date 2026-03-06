# Phase 7: Player Profile - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Public profile page at `/profile/:username` — shows a user's stats (balance, leaderboard rank, total wagered, total profit, games played) and two charts (balance over time, wagered per day) drawn from game_logs history. Navigation entry points: header "My Profile" link (auth-gated) and clickable usernames on the leaderboard page. Charts are tabbed.

</domain>

<decisions>
## Implementation Decisions

### Chart: balance over time
- One data point **per game round** (not aggregated by day) — each `game_logs` row is one point on the line
- **All-time** history — no time window, no truncation
- Backend: return `{ x: createdAt, y: balanceAfter }[]` ordered by createdAt ASC from game_logs WHERE userId = target
- Chart library: **Recharts** (already named in ROADMAP plan 07-02)

### Chart: wagered per day
- Aggregated by calendar day (GROUP BY date) — "per day" is in the requirement name
- **All-time** history — consistent with balance chart decision
- Backend: return `{ date: string, wagered: number }[]` ordered by date ASC from game_logs WHERE userId = target

### Charts arrangement
- **Tabbed** — two tabs: "Balance History" | "Wagered / Day"
- Both charts live in the same tabbed panel below the stats grid
- Only one chart rendered at a time (tab toggle)

### Stats display layout
- **Stat cards in a grid** — not a compact row
- Grid shows all 6 values: Username (header/hero), Balance, Leaderboard Rank, Total Wagered, Total Profit, Games Played
- Username displayed as a prominent page heading above the stat card grid (not as a card itself)
- Stat cards: 5 cards for the numeric values (Balance, Rank, Total Wagered, Total Profit, Games Played)

### Profile navigation & discovery
- **Header nav**: Add a "Profile" link — **auth-gated** (only shown when logged in); links to `/profile/{own username}` using the user from AuthContext
- **Leaderboard usernames**: Make each username in the leaderboard table a `<Link>` to `/profile/:username` — requires updating LeaderboardPage
- **Route**: `/profile/:username` — public, no ProtectedRoute wrapper (anyone can view any profile)

### Public access
- Profile page is public — guests can view profiles (same pattern as LeaderboardPage)
- API endpoint `GET /api/profile/:username` — requires no auth; returns public stats and chart data

### Claude's Discretion
- Exact stat card visual styling (size, icon, label/value arrangement) — consistent with existing dark theme
- Empty state for users with no game history (show stats at zero, hide or show empty charts)
- Chart axis formatting (coin values formatted with toLocaleString, dates formatted as MMM DD)
- Recharts component variants (LineChart for balance, BarChart for wagered per day)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Header.tsx` — needs one new `<Link to={/profile/${username}}>Profile</Link>` added to the nav, visible only when `accessToken` is truthy; uses existing nav link style (border, padding, color)
- `LeaderboardPage.tsx` — username cells in the table rows need to become `<Link to={/profile/${row.username}}>` — inline style override for link appearance (no underline, inherit color)
- `useAuth()` hook — provides `accessToken` and user context; Header already imports it for sign-out; use same import for conditional "Profile" link
- `apiClient` — used for all existing data fetching; use same pattern for `GET /api/profile/:username`

### Established Patterns
- Dark theme: `#0f0f1a` page bg, `#1a1a2e` panel bg, `#7c3aed` accent, `#e0d7ff` headings, `#a0a0c0` secondary text
- Inline styles only — no CSS modules, no Tailwind
- Public routes added to `App.tsx` without `<ProtectedRoute>`: `<Route path="/profile/:username" element={<ProfilePage />} />`
- Page structure: `<div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a' }}>` → `<Header />` → `<main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>`
- State management: simple `useState` for tab selection and loaded data (no Zustand store needed — profile data is per-page, not shared)

### Integration Points
- `App.tsx` — add `import { ProfilePage }` and `<Route path="/profile/:username" element={<ProfilePage />} />`
- `Header.tsx` — add conditional "Profile" link between Leaderboard and Sign Out, using `useAuth().accessToken` to gate visibility; need username from AuthContext (currently only `accessToken` and `signOut` are destructured — check if username is exposed)
- `LeaderboardPage.tsx` — wrap `{row.username}` in `<Link>` for all three tab tables
- Backend `apps/backend/src/app.ts` — register new profileRouter at `/api/profile`

### AuthContext username availability
- The existing `AuthContext` may not expose `username` — if not, the Header "Profile" link will need to fetch /api/auth/me or decode the access token to get username; check AuthContext during implementation
- Alternative: expose username in AuthContext alongside accessToken

</code_context>

<specifics>
## Specific Ideas

- No specific visual references given — standard stat card grid treatment consistent with the existing dark casino aesthetic
- Charts via Recharts (already specified in ROADMAP plan 07-02) — LineChart for balance, BarChart for wagered per day
- Leaderboard username links should feel natural — no underline, same text color as current username display, subtle hover state

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-player-profile*
*Context gathered: 2026-03-05*
