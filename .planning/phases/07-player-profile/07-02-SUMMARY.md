---
phase: 07-player-profile
plan: "02"
subsystem: frontend
tags: [react, recharts, profile, charts, auth-context]
dependency_graph:
  requires: [07-01]
  provides: [ProfilePage, profile-route, header-profile-link, leaderboard-username-links]
  affects: [AuthContext, Header, LeaderboardPage, App]
tech_stack:
  added: [recharts]
  patterns: [recharts-line-chart, recharts-bar-chart, tabbed-chart-panel, conditional-nav-link]
key_files:
  created:
    - apps/frontend/src/pages/ProfilePage.tsx
  modified:
    - apps/frontend/src/contexts/AuthContext.tsx
    - apps/frontend/src/components/Header.tsx
    - apps/frontend/src/pages/LeaderboardPage.tsx
    - apps/frontend/src/App.tsx
decisions:
  - "Recharts chosen for profile charts — already in project planning, compatible with React 18, dark-theme-friendly via prop overrides"
  - "Profile link conditionally rendered only when both accessToken and username are truthy — prevents stale link on logout"
  - "Sign In link shown in Header when logged out — replaces always-visible Sign Out button (bug fix applied post-checkpoint)"
  - "LeaderboardPage username wrapped in Link with color:inherit to preserve existing font-weight logic while adding navigation"
metrics:
  duration: "~30 min (including human verify checkpoint)"
  completed_date: "2026-03-06"
  tasks_completed: 3
  files_modified: 5
  commits:
    - hash: fac3a55
      message: "feat(07-02): install recharts + extend AuthContext with username"
    - hash: 4741199
      message: "feat(07-02): build ProfilePage + wire route, header link, leaderboard links"
    - hash: 42091e8
      message: "fix(07-02): hide sign out button when logged out, show sign in link"
---

# Phase 07 Plan 02: Player Profile Frontend Summary

**One-liner:** ProfilePage with Recharts stat cards + tabbed LineChart/BarChart at /profile/:username, with auth-gated Header link and clickable Leaderboard usernames.

## What Was Built

**ProfilePage component** (`/profile/:username`) — public route showing:
- Username heading + "Player Profile" subtitle
- 5 stat cards in auto-fit grid: Balance, Rank, Total Wagered, Total Profit, Games Played
- Tabbed chart panel: "Balance History" (Recharts LineChart, one point per game round) and "Wagered / Day" (Recharts BarChart, aggregated by calendar day)
- Empty state ("No game history yet.") when data arrays are empty
- User-not-found state when API returns 404

**AuthContext extended** — `username: string | null` added to `AuthState`; set on both mount refresh and sign-in effect; reset to null on sign-out and session expiry.

**Header updated** — Profile link conditionally rendered when `accessToken && username`; Sign Out button gated by `accessToken` (shows Sign In link when logged out).

**LeaderboardPage updated** — Each username cell wrapped in `<Link to={/profile/${row.username}}>` with `color: inherit; text-decoration: none` to preserve existing styling.

**App.tsx updated** — Public route `<Route path="/profile/:username" element={<ProfilePage />} />` added (no ProtectedRoute wrapper).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install Recharts + extend AuthContext with username | fac3a55 | AuthContext.tsx |
| 2 | Build ProfilePage + wire route, Header link, Leaderboard links | 4741199 | ProfilePage.tsx, App.tsx, Header.tsx, LeaderboardPage.tsx |
| 3 (checkpoint) | Human verify profile page end-to-end | — | Approved by user (all 7 checks passed) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Header always showing Sign Out button when logged out**
- **Found during:** Post-checkpoint user testing
- **Issue:** Header.tsx always rendered the Sign Out button regardless of auth state; logged-out users saw Sign Out instead of Sign In
- **Fix:** Wrapped Sign Out button in `{accessToken ? <button>Sign Out</button> : <Link>Sign In</Link>}` ternary
- **Files modified:** apps/frontend/src/components/Header.tsx
- **Commit:** 42091e8

## Verification Results

All plan verification criteria passed:
1. `pnpm --filter frontend exec tsc --noEmit` — exits 0 (clean)
2. Profile page loads at /profile/:username for valid usernames — confirmed
3. 404 state shown for invalid usernames — confirmed
4. Stat cards show correct values — confirmed
5. Both chart tabs render without console errors — confirmed
6. Header Profile link appears when authenticated, hidden when not — confirmed
7. Leaderboard usernames navigate to profile pages — confirmed

## Requirements Satisfied

- **PROF-01:** /profile/:username shows username heading + 5 stat cards (Balance, Rank, Total Wagered, Total Profit, Games Played)
- **PROF-02:** "Balance History" tab shows Recharts LineChart drawn from game_logs, one point per round
- **PROF-03:** "Wagered / Day" tab shows Recharts BarChart drawn from game_logs, aggregated by calendar day

## Self-Check: PASSED

- ProfilePage.tsx: exists at apps/frontend/src/pages/ProfilePage.tsx
- Commits fac3a55, 4741199, 42091e8: all present in git log
- TypeScript: compiles without errors (tsc --noEmit exits 0)
- All 7 human verification checks: approved by user
