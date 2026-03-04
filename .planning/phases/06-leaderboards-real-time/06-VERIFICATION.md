---
phase: 06-leaderboards-real-time
verified: 2026-03-03T00:00:00Z
status: human_needed
score: 11/11 must-haves verified
re_verification: false
human_verification:
  - test: "Visit /leaderboard while logged out — verify three tabs render, data loads, and leaderboard updates live without login"
    expected: "Balance, Total Wagered, and Profit tabs visible. Top-25 rows appear after initial load. Within 10 seconds, table data refreshes automatically with no page action."
    why_human: "Requires a live Socket.IO connection and a running database. Cannot verify real-time WebSocket broadcast or tab rendering programmatically."
  - test: "Log in as a user outside the top 25. Visit /leaderboard. Check pinned own-rank row appears below divider on all three tabs."
    expected: "A 'your rank' divider appears below the main table, followed by a highlighted row showing the user's actual rank number and value. Switching tabs updates the pinned row for that tab's dimension."
    why_human: "Own-rank pinning requires a live user account with a specific rank position. Row highlight and pinned-row logic depends on runtime ownRanks data from the REST API."
  - test: "Log in as a user inside the top 25. Visit /leaderboard. Verify the user's row in the main table is highlighted with a 'You' badge."
    expected: "The user's row has a purple left border, subtle purple background tint, and a 'You' badge next to the username. No pinned row appears below the divider."
    why_human: "Requires a specific user with top-25 rank. Highlight rendering is conditional on runtime ownRanks data."
  - test: "Play a game round (any game). Verify the Header balance updates immediately after round completes without a page refresh."
    expected: "Balance display in the Header changes to the post-round balance within ~1 second of game resolution, driven by the balance:update WebSocket event."
    why_human: "Requires live gameplay and an active WebSocket connection. Cannot verify the timing of socket events programmatically."
  - test: "Verify the Header shows a 'Leaderboard' nav link on the Dashboard, Roulette, Plinko, Mines, and Blackjack pages."
    expected: "A 'Leaderboard' button/link is visible in the Header on every page that uses the Header component. Clicking it navigates to /leaderboard."
    why_human: "Requires visual inspection of all game pages. The link is present in Header.tsx code but rendering on each page needs human confirmation."
---

# Phase 6: Leaderboards & Real-Time — Verification Report

**Phase Goal:** Deliver a fully functional leaderboard system with real-time updates via WebSocket (Socket.IO). Users can see live rankings by balance, total wagered, and profit. Authenticated users see their own rank highlighted and pinned if outside the top 25. The header balance updates in real time after each game round.
**Verified:** 2026-03-03
**Status:** human_needed — all automated checks passed; 5 items require live environment testing
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/leaderboard returns top-25 rows for all three tabs (balance, wagered, profit) | VERIFIED | `leaderboard.ts` runs three parallel `ORDER BY DESC LIMIT 25` queries; response shape `{ byBalance, byWagered, byProfit, ownRanks }` confirmed at line 78 |
| 2 | GET /api/leaderboard returns ownRanks for authenticated callers and null for guests | VERIFIED | `leaderboard.ts` lines 47-76: when `userId !== null`, runs three `rank() OVER` window function queries; when guest, `ownRanks` stays `null` |
| 3 | Socket.IO server is reachable at ws://localhost:3000 — browser connection does not get CORS-blocked | VERIFIED | `socket/index.ts` lines 34-40: `new Server(server, { cors: { origin: ['http://localhost:5173'], credentials: true } })` wired to http.Server; `index.ts` lines 7-9 confirm `createServer(app)` + `createSocketServer(server)` |
| 4 | An authenticated socket client joins a user:N room and can receive a balance:update event | VERIFIED | `socket/index.ts` lines 44-48: `io.on('connection')` joins `user:${userId}` room; `ServerToClientEvents` interface declares `balance:update`; `AuthContext.tsx` lines 80-86 connect socket on accessToken presence |
| 5 | A leaderboard:update event is broadcast to all connected sockets every ~7 seconds | VERIFIED | `leaderboardBroadcast.ts`: `BROADCAST_INTERVAL_MS = 7000`; `setInterval` calls `io.emit('leaderboard:update', snapshot)`; duplicate-timer guard prevents hot-reload doubling |
| 6 | After every game settlement in games.ts, a balance:update event is emitted to the playing user's room | VERIFIED | `grep -c` confirms exactly 11 `io.to().emit('balance:update')` calls matching 11 `await settleBet` calls in `games.ts` |
| 7 | Visiting /leaderboard (logged out) shows three tabs and up to 25 rows — no login required | VERIFIED (code) | `App.tsx` line 71: `<Route path="/leaderboard" element={<LeaderboardPage />} />` — no `ProtectedRoute` wrapper; `LeaderboardPage.tsx` renders all three tab buttons unconditionally | NEEDS HUMAN for visual confirmation |
| 8 | Leaderboard table rows update live without a page refresh, including for guests | VERIFIED (code) | `useLeaderboard.ts`: if `!socket.connected`, calls `socket.connect()` for guests; registers `leaderboard:update` listener that calls `setSnapshot(data)` via Zustand store | NEEDS HUMAN for live confirmation |
| 9 | A logged-in user outside the top 25 sees a pinned own-rank row below a divider | VERIFIED (code) | `LeaderboardPage.tsx` lines 201-238: `!isLoading && ownRankEntry !== null && !ownInTopList` renders the divider + pinned row | NEEDS HUMAN for runtime confirmation |
| 10 | A logged-in user inside the top 25 sees their row highlighted in the main table | VERIFIED (code) | `LeaderboardPage.tsx` lines 172-178: `isOwnRow` applies `borderLeft: '3px solid #7c3aed'` + `backgroundColor: 'rgba(124,58,237,0.10)'` | NEEDS HUMAN for runtime confirmation |
| 11 | After a game round, the balance in the header updates immediately without page refresh | VERIFIED (code) | `AuthContext.tsx` lines 89-97: `socket.on('balance:update', onBalanceUpdate)` calls `useBalanceStore.getState().setBalance(balance)` in one registration point | NEEDS HUMAN for live confirmation |

**Score:** 11/11 truths verified in code (5 additionally need human runtime confirmation)

---

## Required Artifacts

### Plan 01 Artifacts (Backend)

| Artifact | Status | Details |
|----------|--------|---------|
| `apps/backend/src/socket/index.ts` | VERIFIED | Exists, 54 lines, exports `createSocketServer` and `io`; typed `ServerToClientEvents` / `ClientToServerEvents` / `SocketData`; attaches `authMiddleware` and starts broadcast |
| `apps/backend/src/socket/authMiddleware.ts` | VERIFIED | Exists, 21 lines, exports `attachAuthMiddleware`; permissive JWT handling — guests pass through, authenticated sockets get `socket.data.userId` |
| `apps/backend/src/socket/leaderboardBroadcast.ts` | VERIFIED | Exists, 43 lines, exports `startLeaderboardBroadcast`; 7s interval, 3-tab snapshot queries, hot-reload guard |
| `apps/backend/src/routes/leaderboard.ts` | VERIFIED | Exists, 84 lines, exports `leaderboardRouter`; top-25 queries + window-function own-rank; `ownRanks: null` for guests |

### Plan 02 Artifacts (Frontend)

| Artifact | Status | Details |
|----------|--------|---------|
| `apps/frontend/src/socket.ts` | VERIFIED | Exists, 13 lines, exports `socket: Socket`; `autoConnect: false`; auth callback uses `getAccessToken()` for fresh token pickup |
| `apps/frontend/src/stores/leaderboardStore.ts` | VERIFIED | Exists, 37 lines, exports `useLeaderboardStore`; Zustand v5 double-parens pattern; `snapshot`, `ownRanks`, `activeTab` state |
| `apps/frontend/src/hooks/useLeaderboard.ts` | VERIFIED | Exists, 29 lines, exports `useLeaderboard`; guest-safe connect guard; `leaderboard:update` listener with cleanup; conditional disconnect on unmount |
| `apps/frontend/src/pages/LeaderboardPage.tsx` | VERIFIED | Exists, 244 lines; three tabs; skeleton loading; top-25 table; own-rank highlight + pinned row logic; calls `useLeaderboard()` on mount; fetches from `/leaderboard` REST on mount |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `apps/backend/src/index.ts` | `apps/backend/src/socket/index.ts` | `createSocketServer(server)` called after `http.createServer(app)` | WIRED | `index.ts` lines 8-9: `const server = createServer(app); createSocketServer(server);` |
| `apps/backend/src/socket/index.ts` | `apps/backend/src/socket/authMiddleware.ts` | `attachAuthMiddleware(io)` | WIRED | `socket/index.ts` line 42: `attachAuthMiddleware(io);` |
| `apps/backend/src/routes/games.ts` | `apps/backend/src/socket/index.ts` | `io.to('user:N').emit('balance:update', ...)` | WIRED | `games.ts` line 25: `import { io } from '../socket/index.js'`; 11 `io.to().emit()` calls confirmed |
| `apps/backend/src/app.ts` | `apps/backend/src/routes/leaderboard.ts` | `app.use('/api/leaderboard', leaderboardRouter)` | WIRED | `app.ts` line 9: `import { leaderboardRouter }`; line 37: `app.use('/api/leaderboard', leaderboardRouter)` |

### Plan 02 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `apps/frontend/src/contexts/AuthContext.tsx` | `apps/frontend/src/socket.ts` | `socket.connect()` on accessToken; `socket.disconnect()` on null; `balance:update` listener | WIRED | `AuthContext.tsx` lines 14, 80-86, 89-97 |
| `apps/frontend/src/hooks/useLeaderboard.ts` | `apps/frontend/src/socket.ts` | Guest `socket.connect()` if `!socket.connected`; disconnect on cleanup | WIRED | `useLeaderboard.ts` lines 2, 12-13, 23-25 |
| `apps/frontend/src/pages/LeaderboardPage.tsx` | `apps/frontend/src/hooks/useLeaderboard.ts` | `useLeaderboard()` called on mount | WIRED | `LeaderboardPage.tsx` line 23: `useLeaderboard();` |
| `apps/frontend/src/pages/LeaderboardPage.tsx` | `/api/leaderboard` | `apiClient.get('/leaderboard')` on mount | WIRED | `LeaderboardPage.tsx` lines 28-51 |
| `apps/frontend/src/App.tsx` | `apps/frontend/src/pages/LeaderboardPage.tsx` | Public `<Route path="/leaderboard" ...>` not behind ProtectedRoute | WIRED | `App.tsx` line 12 (import) + line 71 (route — no ProtectedRoute wrapper) |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| LDR-01 | 06-01, 06-02 | Balance leaderboard displays top users ranked by current balance | SATISFIED | `leaderboard.ts` top-25 `ORDER BY balance DESC`; `LeaderboardPage.tsx` Balance tab renders `snapshot.byBalance` |
| LDR-02 | 06-01, 06-02 | Total Wagered leaderboard displays top users ranked by lifetime amount wagered | SATISFIED | `leaderboard.ts` top-25 `ORDER BY total_wagered DESC`; `LeaderboardPage.tsx` Total Wagered tab renders `snapshot.byWagered` |
| LDR-03 | 06-01, 06-02 | Profit leaderboard displays top users ranked by total profit | SATISFIED | `leaderboard.ts` top-25 `ORDER BY total_profit DESC`; `LeaderboardPage.tsx` Profit tab renders `snapshot.byProfit` |
| LDR-04 | 06-01, 06-02 | All leaderboards update in real-time via WebSocket push | SATISFIED (code) | `leaderboardBroadcast.ts` emits `leaderboard:update` every 7s to all sockets; `useLeaderboard.ts` registers listener and calls `setSnapshot` which drives re-render | NEEDS HUMAN for live confirmation |
| LDR-05 | 06-01, 06-02 | Each leaderboard shows the logged-in user's own rank even when not in the top 10 | SATISFIED (code) | `leaderboard.ts` window-function `rank() OVER` for own-rank; `LeaderboardPage.tsx` pinned row logic for ranks outside top 25; highlight for inside top 25 | NEEDS HUMAN for runtime confirmation |

**Note on LDR-05:** REQUIREMENTS.md states "top 10" but the user-approved CONTEXT.md locked decision specifies top 25. The implementation correctly uses top 25 per the locked decision. No gap.

**Note on ROADMAP Success Criterion 2:** ROADMAP says "within 1-2 seconds" but the user-approved CONTEXT.md specifies "approximately every 5-10 seconds". The 7-second interval is within the approved range. No gap.

**Orphaned requirements check:** REQUIREMENTS.md maps LDR-01 through LDR-05 exclusively to Phase 6. All five are covered by both plans (06-01 and 06-02). No orphaned requirements.

---

## Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| `LeaderboardPage.tsx` line 47-49 | Empty catch: `.catch(() => { // Non-fatal })` | Info | Intentional — REST failure shows empty state, documented in plan as acceptable fallback |
| `socket/index.ts` line 23-25 | `ClientToServerEvents` is empty interface | Info | Correct by design — Phase 6 clients do not emit custom events; documented in plan |
| `AuthContext.tsx` | `auth:session-expired` sets `accessToken: null` which triggers `socket.disconnect()` indirectly | Info | Correct indirect wiring — session expiry sets state, state change triggers socket lifecycle effect. Not a gap. |

No blocker anti-patterns found. No TODO/FIXME/placeholder patterns detected in phase-created files.

---

## Human Verification Required

### 1. Guest leaderboard page load and live updates

**Test:** Start both servers (`pnpm dev`). Open `http://localhost:5173/leaderboard` without logging in.
**Expected:** Three tab buttons visible (Balance, Total Wagered, Profit). After initial skeleton clears, top-25 rows appear. No own-rank row shown. Within 10-15 seconds, table data updates automatically with no page action from the viewer.
**Why human:** Requires live Socket.IO connection, running database, and real-time broadcast observation.

### 2. Pinned own-rank row (rank outside top 25)

**Test:** Log in as a user whose rank on any leaderboard dimension is above 25 (i.e., not in the top 25). Visit `/leaderboard`.
**Expected:** Below the main table, a horizontal divider appears labeled "your rank" with a highlighted row showing the user's actual rank number (e.g., "#47") and their value. Switching tabs shows the correct pinned rank for each dimension.
**Why human:** Requires a specific user account with a rank above 25. Cannot fabricate runtime ownRanks data statically.

### 3. Highlighted own-rank row (rank inside top 25)

**Test:** Log in as a user whose rank is in the top 25 on at least one tab. Visit `/leaderboard`.
**Expected:** The user's row in the main table has a purple left border, purple background tint, and a "You" badge next to the username. No pinned row appears below the table.
**Why human:** Requires a specific user account with a top-25 rank.

### 4. Real-time balance header update after game round

**Test:** While logged in, navigate to any game page (e.g., `/games/roulette`). Note the balance in the Header. Place a bet and complete the round.
**Expected:** The balance in the Header changes to the new post-round balance within ~1-2 seconds, without any page navigation or manual refresh. This is driven by the `balance:update` WebSocket event.
**Why human:** Requires live gameplay and an observable WebSocket event effect on the Header component.

### 5. Leaderboard Header nav link on all pages

**Test:** Log in and visit: Dashboard, Roulette, Plinko, Mines, and Blackjack. Check the Header on each page.
**Expected:** A "Leaderboard" link is visible in the Header nav on every page. Clicking it navigates to `/leaderboard`.
**Why human:** Requires visual inspection across all game pages to confirm the Header renders consistently.

---

## Commits Verified

All commits documented in summaries are present in git history:

| Commit | Summary | Verified |
|--------|---------|---------|
| `ab60f4e` | feat(06-01): Socket.IO server infrastructure | Present |
| `1381e69` | feat(06-01): Leaderboard REST route + balance:update pushes | Present |
| `3dfd0e5` | feat(06-02): Socket singleton, leaderboard store, useLeaderboard, AuthContext | Present |
| `edba841` | feat(06-02): LeaderboardPage, Header nav link, App.tsx public route | Present |

---

## Summary

Phase 6 code is complete and correctly implemented. All 11 must-have truths are verified in the codebase:

- Backend: Socket.IO server attached to `http.createServer`, CORS configured for the frontend origin, JWT-permissive auth middleware, user:N room joins, 7-second throttled `leaderboard:update` broadcast, and all 11 game settlement points emit `balance:update` immediately after `settleBet`.
- Frontend: Socket singleton with `autoConnect: false` and fresh-token auth callback, Zustand leaderboard store, guest-safe `useLeaderboard` hook, public `/leaderboard` route with three tabs, skeleton loading, own-rank highlight and pinned-row logic, `balance:update` listener registered once in AuthContext updating the balance store for the Header.
- Wiring: All 5 Plan 01 key links and all 5 Plan 02 key links are verified wired. No orphaned artifacts.
- Requirements: LDR-01 through LDR-05 all satisfied. No orphaned requirements.

Five human verification items remain — these are live-runtime behaviors (WebSocket events, visual rendering, real-time updates) that cannot be confirmed by static code analysis alone.

---

_Verified: 2026-03-03_
_Verifier: Claude (gsd-verifier)_
