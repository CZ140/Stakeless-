---
phase: 07-player-profile
verified: 2026-03-05T00:00:00Z
status: human_needed
score: 17/17 must-haves verified
human_verification:
  - test: "Profile page loads with real data — open /profile/:username for a known user in the browser"
    expected: "Page shows username heading, 5 stat cards with database values (not zeros unless no play), two chart tabs"
    why_human: "Cannot confirm live API response from database or correct data binding without running the app"
  - test: "Balance History LineChart renders without console errors"
    expected: "Recharts LineChart displays with correct X-axis (ISO date labels) and Y-axis (balance values)"
    why_human: "Recharts rendering depends on browser DOM — cannot verify chart paint programmatically"
  - test: "Wagered / Day BarChart renders without console errors"
    expected: "Recharts BarChart displays with date-labeled X-axis and aggregated wagered values"
    why_human: "Same — chart rendering requires browser"
  - test: "Header Profile link appears when logged in and disappears on logout"
    expected: "Profile link visible after sign-in, gone after sign-out; Sign In link shown when logged out"
    why_human: "Auth state toggling requires live browser session interaction"
  - test: "Guest access: navigate to /profile/:username without logging in"
    expected: "Profile page loads without redirect to /login"
    why_human: "Route guard behaviour requires browser navigation flow"
---

# Phase 7: Player Profile Verification Report

**Phase Goal:** Every user has a public profile page showing their stats and visual history — players can track their own progression and compare themselves to others

**Verified:** 2026-03-05

**Status:** HUMAN NEEDED — all automated checks passed; 5 items require browser verification

**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Plan 01 — Backend)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/profile/:username returns 200 with stats + chart data for a known user | VERIFIED | `profile.ts` line 68: `res.json({...})` with all 8 fields after successful user lookup + 4 parallel queries |
| 2 | GET /api/profile/:username returns 404 for an unknown username | VERIFIED | `profile.ts` line 26: `res.status(404).json({ error: 'User not found' })` guarded by `if (!user)` |
| 3 | Response includes username, balance, balanceRank, totalWagered, totalProfit, gamesPlayed | VERIFIED | `profile.ts` lines 68-77: all 6 scalar fields present in `res.json()` return |
| 4 | Response includes balanceHistory array (one point per game round, ordered by createdAt ASC) | VERIFIED | `profile.ts` lines 47-54: Drizzle query selects `x: gameLogs.createdAt, y: gameLogs.balanceAfter` with `.orderBy(asc(gameLogs.createdAt))`; serialised via `.toISOString()` at line 75 |
| 5 | Response includes wageredPerDay array (aggregated by calendar day, ordered by date ASC) | VERIFIED | `profile.ts` lines 56-65: `date_trunc('day', createdAt)::date::text` + `sum(betAmount)` grouped by day, ordered by day |
| 6 | GET /api/auth/me now includes username in the response | VERIFIED | `authService.ts` lines 175 (select) and 192 (return): `username: users.username` and `username: user.username` both present |
| 7 | Profile endpoint requires no auth — guests can call it without a token | VERIFIED | `profile.ts`: no `requireAuth` middleware on the `profileRouter.get` handler |

### Observable Truths (Plan 02 — Frontend)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 8  | Visiting /profile/:username shows the user's username as a page heading | VERIFIED | `ProfilePage.tsx` line 83: `<h1>{profileData.username}</h1>` |
| 9  | 5 stat cards display: Balance, Rank, Total Wagered, Total Profit, Games Played | VERIFIED | `ProfilePage.tsx` lines 96-220: 5 distinct card `<div>` blocks with labels and `.toLocaleString()` values |
| 10 | Two chart tabs exist: 'Balance History' and 'Wagered / Day' — only one renders at a time | VERIFIED | `ProfilePage.tsx` lines 229-247: tab array `['balance', 'wagered']` mapped to buttons; conditional render at line 250 switches on `activeChart` |
| 11 | Balance History tab shows a LineChart with one point per game round | VERIFIED | `ProfilePage.tsx` lines 274-302: `<LineChart data={profileData.balanceHistory}>` with `dataKey="y"` bound to `balanceAfter` per-round values |
| 12 | Wagered / Day tab shows a BarChart aggregated by calendar day | VERIFIED | `ProfilePage.tsx` lines 328-357: `<BarChart data={profileData.wageredPerDay}>` with `dataKey="wagered"` |
| 13 | Users with no game history see an empty state message instead of charts | VERIFIED | `ProfilePage.tsx` lines 75-77, 251-264, 305-317: `balanceHistoryEmpty` / `wageredPerDayEmpty` guards render `"No game history yet."` panel |
| 14 | Visiting /profile/nonexistent shows a 'User not found' message | VERIFIED | `ProfilePage.tsx` lines 40-43: `err.response?.status === 404` sets `notFound=true`; lines 57-64 render `"User not found."` |
| 15 | Header shows a 'Profile' link when logged in, hidden when logged out | VERIFIED | `Header.tsx` lines 44-58: `{accessToken && username && (<Link to={/profile/${username}}>Profile</Link>)}` |
| 16 | Leaderboard usernames are clickable links to /profile/:username | VERIFIED | `LeaderboardPage.tsx` lines 186-191: `<Link to={/profile/${row.username}} style={{color:'inherit',textDecoration:'none'}}>{row.username}</Link>` |
| 17 | Profile route is public — no ProtectedRoute wrapper | VERIFIED | `App.tsx` line 73: `<Route path="/profile/:username" element={<ProfilePage />} />` — bare Route, no ProtectedRoute |

**Score: 17/17 truths verified**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/backend/src/routes/profile.ts` | GET /api/profile/:username handler | VERIFIED | 83 lines, full implementation: user lookup, 4 parallel sub-queries, 8-field response |
| `apps/backend/src/app.ts` | profileRouter registered at /api/profile | VERIFIED | Line 10: import; line 39: `app.use('/api/profile', profileRouter)` |
| `apps/backend/src/services/authService.ts` | getProfile returns username field | VERIFIED | Lines 175 + 192: `username: users.username` in select; `username: user.username` in return |
| `apps/frontend/src/pages/ProfilePage.tsx` | Public profile page component | VERIFIED | 362 lines, full implementation: fetch, states, stat grid, tabbed Recharts |
| `apps/frontend/src/contexts/AuthContext.tsx` | username field in AuthState and useAuth() | VERIFIED | Line 18: `username: string \| null`; set in mount effect (line 47), signIn effect (line 62), cleared in signOut (line 114) and expiry handler (line 75) |
| `apps/frontend/src/App.tsx` | Public /profile/:username route | VERIFIED | Line 73: `<Route path="/profile/:username" element={<ProfilePage />} />` — no ProtectedRoute |
| `apps/frontend/package.json` | recharts dependency | VERIFIED | Line 19: `"recharts": "^3.7.0"` |

---

## Key Link Verification

### Plan 01 — Backend

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `profile.ts` | `schema.ts (users + gameLogs)` | Drizzle ORM queries | WIRED | Line 4: `import { users, gameLogs } from '../db/schema.js'`; `gameLogs.userId` used in all 3 game-log queries (lines 44, 53, 63) |
| `app.ts` | `profile.ts` | `app.use('/api/profile', profileRouter)` | WIRED | Line 10 import, line 39 mount — identical pattern to leaderboard |

### Plan 02 — Frontend

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ProfilePage.tsx` | `/api/profile/:username` | `apiClient.get` in useEffect | WIRED | Lines 35-45: `apiClient.get<ProfileData>(/profile/${routeUsername})` with `.then(setProfileData)` and 404 handling |
| `Header.tsx` | `AuthContext.tsx` | `useAuth().username` | WIRED | Line 6: `const { signOut, accessToken, username } = useAuth()`; `username` used in JSX at line 44 |
| `LeaderboardPage.tsx` | `ProfilePage.tsx` | `<Link to={/profile/${row.username}}>` | WIRED | Lines 186-191: Link component wrapping username text |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROF-01 | 07-01, 07-02 | Profile page: username, balance, rank, total wagered, total profit, games played | SATISFIED | Backend returns all 6 fields; frontend renders all 5 stat cards + username heading |
| PROF-02 | 07-01, 07-02 | Balance over time chart | SATISFIED | `balanceHistory` array (one point per game round) sourced from `gameLogs.balanceAfter`; rendered as Recharts `LineChart` |
| PROF-03 | 07-01, 07-02 | Wagered per day chart | SATISFIED | `wageredPerDay` array (date-truncated aggregation of `betAmount`) rendered as Recharts `BarChart` |

All 3 PROF requirements accounted for. No orphaned requirements for Phase 7.

REQUIREMENTS.md Traceability table (lines 199-201) marks all three PROF-01..03 as Phase 7 / Complete — consistent with implementation.

---

## Anti-Patterns Found

No anti-patterns detected.

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| All 7 modified files | None found | — | No TODOs, FIXMEs, placeholder returns, empty handlers, or static JSON returns |

---

## Commit Verification

All SUMMARY-documented commit hashes confirmed present in `git log`:

| Hash | Message | Plan |
|------|---------|------|
| `f6b2657` | feat(07-01): create GET /api/profile/:username route | 07-01 |
| `8179640` | feat(07-01): wire profileRouter and add username to /api/auth/me | 07-01 |
| `fac3a55` | feat(07-02): install recharts + extend AuthContext with username | 07-02 |
| `4741199` | feat(07-02): build ProfilePage + wire route, header link, leaderboard links | 07-02 |
| `42091e8` | fix(07-02): hide sign out button when logged out, show sign in link | 07-02 (bug fix) |

---

## Human Verification Required

### 1. Profile page data rendering

**Test:** Start the dev server (`pnpm dev` from project root). Navigate to `/profile/:username` for a known user (e.g. click a name on the Leaderboard).

**Expected:** Page renders username heading, "Player Profile" subtitle, 5 stat cards with database values (balance, rank, wagered, profit, games played — non-zero if the user has played), and two chart tabs.

**Why human:** Live database values and correct component binding cannot be verified without running the app.

### 2. Balance History chart render

**Test:** On the profile page, with the "Balance History" tab active (default), observe the chart area.

**Expected:** Recharts LineChart renders with labelled axes (month/day format) and a visible line tracing balance over game rounds. No console errors.

**Why human:** Recharts requires a browser DOM to paint — cannot be verified statically.

### 3. Wagered / Day chart render

**Test:** Click the "Wagered / Day" tab on the profile page.

**Expected:** Recharts BarChart renders with date-labelled X-axis and bars representing per-day bet totals. No console errors.

**Why human:** Same as above.

### 4. Auth-gated Header Profile link

**Test:** Sign in, check the header. Sign out, check the header.

**Expected:** "Profile" link visible and correct when authenticated; absent when signed out. "Sign In" link visible when signed out; "Sign Out" button visible when authenticated.

**Why human:** Requires live auth state transitions in the browser.

### 5. Guest access to profile page

**Test:** Without logging in, navigate directly to `/profile/:username` for a known user.

**Expected:** Profile page loads and shows data — no redirect to /login.

**Why human:** Requires browser navigation without an active session.

---

## Summary

Phase 7 goal is substantively achieved. All 17 observable truths are verified against the actual codebase (not just SUMMARY claims):

- The backend `GET /api/profile/:username` endpoint is fully implemented with real Drizzle ORM queries — user lookup by username, 4 parallel sub-queries (rank window function, game count, balance history per round, wagered-per-day aggregation), and the correct 8-field response shape. No auth middleware applied — endpoint is genuinely public.
- `authService.ts getProfile()` correctly selects and returns `username`, wiring `/api/auth/me` to include it.
- `ProfilePage.tsx` is a complete 362-line component — not a stub. All render states handled (loading, 404, data). All 5 stat cards render live data. Both chart tabs wire to correct Recharts chart types with the exact data keys from the API response. Empty state guards prevent chart render errors for users with no history.
- `AuthContext.tsx` correctly propagates `username` through all three code paths (mount refresh, post-signIn effect, reset on signOut/expiry).
- `App.tsx` mounts the profile route without `ProtectedRoute`.
- `Header.tsx` conditionally gates the Profile link on both `accessToken` and `username` being truthy.
- `LeaderboardPage.tsx` wraps each username in a `<Link>` with `color: inherit` and `textDecoration: none`.
- `recharts: ^3.7.0` is in `apps/frontend/package.json` dependencies.
- All 5 documented commit hashes exist in git history.
- All 3 PROF requirements fully satisfied — REQUIREMENTS.md traceability is consistent.

The 5 human verification items are visual/behavioral checks that cannot be confirmed programmatically (chart rendering, live auth state, database-backed values). They do not represent implementation gaps — the code supporting each is in place.

---

_Verified: 2026-03-05_
_Verifier: Claude (gsd-verifier)_
