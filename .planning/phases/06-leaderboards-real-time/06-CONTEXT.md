# Phase 6: Leaderboards & Real-Time - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

WebSocket server with JWT handshake authentication, real-time balance push to the playing user, and three live leaderboards (Balance, Total Wagered, Profit) that broadcast updated standings on a throttled schedule. Leaderboard page is public-facing. Player profile page is a separate phase.

</domain>

<decisions>
## Implementation Decisions

### Leaderboard page location
- Dedicated `/leaderboard` route — separate page, not a dashboard section or sidebar widget
- Linked from the main header nav on all pages (logged in or out)
- Public access — no login required to view the leaderboard page

### Table structure
- Three tabs on the same page: **Balance** | **Total Wagered** | **Profit**
- Top **25** rows per tab
- Columns: **Rank | Username | Value** (value label changes per tab: Balance / Total Wagered / Total Profit)

### Own-rank display (LDR-05)
- Applies to **all 3 tabs**, not just Balance
- If the logged-in user is **inside** the top 25: their row is **highlighted in the main table** (e.g. accent border or background tint) — no separate pinned row
- If the logged-in user is **outside** the top 25: a **pinned own-rank row** appears below the table, separated by a visual divider (e.g. "— — —" or a thin rule), showing their actual rank and value
- Logged-out users see no own-rank row — just the top 25

### Real-time update strategy
- **Own balance**: instant targeted WebSocket push to the playing user after each game round settles — feeds into the existing `balanceStore.setBalance()` in the header
- **Leaderboard table**: throttled broadcast to all connected clients, approximately every 5–10 seconds — feels live without hammering the DB on every bet
- Two separate push paths: targeted (balance) vs broadcast (leaderboard)

### Claude's Discretion
- Exact throttle interval (5s vs 10s vs adaptive)
- Socket.IO room strategy (global room vs per-leaderboard rooms)
- How the backend triggers balance push — either from game routes post-settle or from within WalletService.settleBet
- Visual style of own-rank highlight and separator
- Loading/skeleton state while leaderboard data first loads

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `balanceStore.ts` — has `setBalance(n: number)`: WebSocket client calls this for instant balance push; no changes needed to the store itself
- `AuthContext.tsx` — stores `accessToken` in module-scope closure (`client.ts`) and React state: Socket.IO JWT handshake will use this token
- `Header.tsx` — needs a Leaderboard nav link added alongside existing nav items
- `App.tsx` — needs `/leaderboard` public route added (NOT behind ProtectedRoute — public access)

### Established Patterns
- Zustand v5 double-parens pattern: `create<State>()((set) => ...)` — use same pattern for any leaderboard store
- `users` schema already has `balance`, `totalWagered`, `totalProfit` as BIGINT columns — leaderboard queries are ORDER BY DESC LIMIT 25 on these columns; no new schema needed
- All game routes return the settled balance in their response — the backend already has settlement as a trigger point for the balance push

### Integration Points
- `apps/backend/src/index.ts` uses `app.listen()` directly — needs to be refactored to extract an `http.Server` (i.e., `const server = http.createServer(app); server.listen(...)`) so Socket.IO can attach to it
- `apps/backend/src/app.ts` — leaderboard REST router (`/api/leaderboard`) registered here alongside existing routers
- All game resolution endpoints (POST /games/roulette/bet, /plinko/bet, /mines/cashout, /blackjack/stand, /blackjack/double) are trigger points for the balance push event

</code_context>

<specifics>
## Specific Ideas

- No specific aesthetic references given — standard leaderboard table treatment is fine
- Own-rank row outside top 25: should clearly communicate "this is you, rank #47" — a soft accent color or "You" label makes it scannable at a glance

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-leaderboards-real-time*
*Context gathered: 2026-03-03*
