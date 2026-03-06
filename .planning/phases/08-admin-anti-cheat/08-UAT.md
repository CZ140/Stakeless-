---
status: diagnosed
phase: 08-admin-anti-cheat
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md
started: 2026-03-06T00:00:00Z
updated: 2026-03-06T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service, then start the application from scratch. Server boots without errors and a basic API call (or homepage load) returns live data.
result: pass

### 2. Rate Limit on Game Routes
expected: Spam a game action (e.g. click Roulette Bet repeatedly very fast — more than 30 times in a minute). After hitting the limit, the server returns a 429 error and you see a "Too many requests. Slow down." response. Normal play (under 30 req/min) continues without error.
result: issue
reported: "the something went wrong message is connected to the too many requests — rate limit fires but frontend shows generic error instead of the actual 429 message"
severity: major

### 3. Click Interval Protection
expected: Send two game requests within 100ms of each other (e.g. double-click a bet button programmatically or via DevTools). The second request is rejected with a 429 and message "Too fast. Slow down." A request sent after the 100ms window passes through normally.
result: pass

### 4. Max Bet Bounds Enforcement
expected: Enter a bet amount greater than 1,000,000 in any game (roulette, plinko, mines, blackjack). The request is rejected with a 400 error before any balance change occurs. Your wallet balance remains unchanged.
result: pass

### 5. Non-Admin Cannot Access Admin Routes
expected: Log in as a regular (non-admin) user and navigate to /admin in the browser. You should be redirected away (to / or /login). Calling GET /api/admin/stats directly as a non-admin should return 403 Forbidden.
result: pass

### 6. Admin Dashboard Stats
expected: Log in as an admin user and navigate to /admin. You see a dashboard with three stat cards showing: Total Users, Total Bets, and Coins in Circulation — each displaying a real number pulled from the database.
result: pass

### 7. Admin Player Search
expected: On the admin dashboard, type a player's username (or partial name) in the search box. Results appear in a table showing matching players with their ban status visible.
result: pass

### 8. Admin Game History Inspector
expected: On the admin dashboard, after searching for a player, click a player row. A game history section appears showing that player's last 50 game rounds (game type, result, bet amount, etc.).
result: pass

### 9. Ban Player
expected: On the admin dashboard, find a non-admin player and click the Ban button. The UI updates immediately (optimistic update) showing the player as banned. Attempting to call any game API as that player returns 401/403 (their token is invalidated).
result: pass

### 10. Banned User Session Invalidated
expected: When a player is banned, their existing refresh token is immediately deleted. If the banned user tries to refresh their access token (POST /api/auth/refresh), they receive a 401. They cannot continue playing without logging in again — and login fails because they're banned.
result: pass

### 11. Unban Player
expected: On the admin dashboard, find a banned player and click the Unban button. The UI updates immediately showing the player as no longer banned. The player can now log in and play again normally.
result: pass

## Summary

total: 11
passed: 10
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "When the rate limit is hit, user sees the server's error message ('Too many requests. Slow down.') — not a generic fallback"
  status: failed
  reason: "User confirmed 429 is firing but frontend shows generic 'something went wrong please try again' instead of the actual error message"
  severity: major
  test: 2
  root_cause: "Every game component catch block type-casts the error as { response?: { status?: number } } — no data field — so response.data.error is never read. Any non-402 status falls through to a hardcoded fallback string. Blackjack handleHit/handleStand use bare catch{} blocks with no error parameter at all."
  artifacts:
    - path: "apps/frontend/src/pages/MinesPage.tsx"
      issue: "handleStart, handleTileClick, handleCashOut — status-only cast, no 429 branch"
    - path: "apps/frontend/src/pages/RoulettePage.tsx"
      issue: "handleSpin — data in type shape but never read in else branch"
    - path: "apps/frontend/src/pages/PlinkoPage.tsx"
      issue: "handleDrop — status-only cast, no 429 branch"
    - path: "apps/frontend/src/pages/BlackjackPage.tsx"
      issue: "handleDeal, handleDouble — status-only cast; handleHit, handleStand — bare catch{} blocks"
  missing:
    - "Extend type assertion to include data?: { error?: string } in all 8 catch blocks"
    - "Replace hardcoded fallback with: setError(axiosErr.response?.data?.error ?? 'Something went wrong. Please try again.')"
    - "Add err parameter to handleHit and handleStand bare catch blocks"
  debug_session: ".planning/debug/429-error-message-not-displayed.md"
