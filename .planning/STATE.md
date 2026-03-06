---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-03-06T03:52:21Z"
last_activity: "2026-03-06 — Completed 07-02: ProfilePage with Recharts charts verified by user (stat cards, balance history, wagered/day charts, header link, leaderboard links)"
progress:
  total_phases: 11
  completed_phases: 9
  total_plans: 24
  completed_plans: 24
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Players can jump in daily, claim their bonus, play fair-odds casino games with virtual coins, and compete on leaderboards — no real-money risk.
**Current focus:** Phase 6 — User Experience Polish (leaderboards, avatars, recent bets history)

## Current Position

Phase: 7 of 11 COMPLETE (Player Profile)
Plan: 2 of 2 complete in Phase 7 — Phase 7 fully complete
Status: Phase 7 complete — all features verified: profile backend (GET /api/profile/:username, username in /auth/me) + frontend (ProfilePage with Recharts charts, auth-gated Header link, clickable Leaderboard usernames)
Last activity: 2026-03-06 — Completed 07-02: ProfilePage verified by user (stat cards, balance history chart, wagered/day chart, header profile link, leaderboard username links)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 4 min
- Total execution time: 0.20 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 11 min | 4 min |
| 02-auth-accounts | 3 | 9 min | 3 min |

**Recent Trend:**
- Last 5 plans: 4 min, 4 min, 3 min, 3 min, 2 min
- Trend: stable

*Updated after each plan completion*

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01-foundation P01 | 4 min | 2 tasks | 14 files |
| Phase 01-foundation P02 | 22 min | 2 tasks | 7 files |
| Phase 01-foundation P03 | 3 min | 2 tasks | 10 files |
| Phase 02-auth-accounts P01 | 3 min | 2 tasks | 11 files |
| Phase 02-auth-accounts P02 | 4 min | 2 tasks | 3 files |
| Phase 02-auth-accounts P03 | 2 min | 2 tasks | 12 files |
| Phase 03-wallet-currency P01 | 2 | 2 tasks | 5 files |
| Phase 03-wallet-currency P02 | 3 min | 2 tasks | 10 files |
| Phase 03-wallet-currency P03 | 1 | 2 tasks | 3 files |
| Phase 03.1-auth-ui-gap-closure P01 | 45 min | 2 tasks | 2 files |
| Phase 04-game-infrastructure P01 | 3 min | 2 tasks | 6 files |
| Phase 04-game-infrastructure P02 | 4 min | 2 tasks | 4 files |
| Phase 04-game-infrastructure P03 | 45 min | 3 tasks | 8 files |
| Phase 05-remaining-games P02 | 3 | 2 tasks | 3 files |
| Phase 05-remaining-games P04 | 5 | 2 tasks | 3 files |
| Phase 05-remaining-games P01 | 6 | 3 tasks | 7 files |
| Phase 05-remaining-games P03 | 2 | 2 tasks | 4 files |
| Phase 05-remaining-games P05 | 3 min | 2 tasks | 5 files |
| Phase 05.1-phase04-verification-roulette-fix P01 | 3 min | 2 tasks | 2 files |
| Phase 05.2-blackjack-double-header-fix P01 | 2 | 2 tasks | 2 files |
| Phase 06-leaderboards-real-time P01 | 8 min | 2 tasks | 8 files |
| Phase 06-leaderboards-real-time P02 | 4 min | 2 tasks | 8 files |
| Phase 07-player-profile P01 | 1 | 2 tasks | 3 files |
| Phase 07-player-profile P02 | 30 min | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Foundation → Auth → Wallet must be fully built before any game engine — hard constraint from architecture research
- [Roadmap]: Games ordered by complexity: Roulette (stateless) → Plinko (stateless) → Mines (session state) → Blackjack (multi-step session)
- [Roadmap]: Anti-cheat and admin are deferred to Phase 8 (depend on all prior phases); not skipped
- [Roadmap]: Balance stored as BIGINT integer coins — schema decision must be enforced in Phase 1 migration
- [Phase 01-foundation]: Used concurrently@9 as task runner for dev script — lightweight fit for pnpm workspace
- [Phase 01-foundation]: frontend tsconfig overrides module:ESNext and moduleResolution:Bundler — required for Vite (not NodeNext)
- [Phase 01-foundation]: @gambling/shared points main/types at src/index.ts directly — no build step needed at dev time
- [Phase 01-foundation]: Minimal placeholder src files added to backend/frontend to satisfy tsc --noEmit input requirement
- [Phase 01-foundation P02]: bigint({ mode: 'number' }) for all monetary columns — maps to PostgreSQL BIGINT, avoids integer overflow for balance storage
- [Phase 01-foundation P02]: drizzle.config.ts uses process.cwd() to resolve root .env — import.meta not available in drizzle-kit CJS bundle mode
- [Phase 01-foundation P02]: tokenVersion+isBanned added to users schema proactively — Phase 2 (token revocation) and Phase 8 (admin ban) need them without a future migration
- [Phase 01-foundation P03]: rootDir changed from ./src to . in both tsconfigs — drizzle.config.ts and vite.config.ts live at package root, not inside src/
- [Phase 01-foundation P03]: createApp() returns explicit Express type, healthRouter typed as IRouter — required to avoid TS2742 portability errors referencing internal pnpm paths
- [Phase 01-foundation P03]: Frontend tsconfig adds lib:[DOM,DOM.Iterable,ES2022] and allowImportingTsExtensions:true — browser globals and .tsx import extension required for React/Vite
- [Phase 02-auth-accounts P01]: POST /register always returns 201 regardless of duplicate email — prevents email enumeration attacks
- [Phase 02-auth-accounts P01]: bcrypt timing-attack prevention: hash a dummy string before throwing DUPLICATE_EMAIL to equalize response times
- [Phase 02-auth-accounts P01]: Store only SHA-256 hash of opaque tokens in DB — raw 64-hex-char token never persisted
- [Phase 02-auth-accounts P01]: email_verification_tokens.used_at marks single-use enforcement — row kept for audit trail, not deleted on use
- [Phase 02-auth-accounts P02]: requireAuth returns generic 401 for both missing and invalid/expired tokens — no distinction to prevent information leakage
- [Phase 02-auth-accounts P02]: Refresh cookie path scoped to /api/auth/refresh — browser only sends cookie to that single path
- [Phase 02-auth-accounts P02]: isBanned checked after password validation — prevents enumeration of banned accounts via different error response
- [Phase 02-auth-accounts P03]: refreshingPromise singleton in axios interceptor prevents N concurrent 401s from triggering N parallel refresh calls — one refresh attempt gates all queued requests
- [Phase 02-auth-accounts P03]: Access token stored in closure variable (client.ts module scope) and React state (AuthContext) — never localStorage/sessionStorage
- [Phase 02-auth-accounts P03]: auth:session-expired CustomEvent bridges axios interceptor to React state without coupling the two layers
- [Phase 02-auth-accounts P03]: POST /api/auth/forgot-password always returns 200 regardless of email existence — no enumeration even on server errors
- [Phase 02-auth-accounts P03]: POST /api/auth/reset-password auto-logs user in on success — returns accessToken + sets refresh cookie
- [Phase 03-wallet-currency]: All balance mutations use db.transaction() + .select().for('update') — single choke-point for all game engine phases (3-8)
- [Phase 03-wallet-currency]: Aggregate columns use sql template expressions — avoids lost-update anomalies from JS read-modify-write
- [Phase 03-wallet-currency]: No noWait/skipLocked on .for() calls — Drizzle ORM bug #3554 makes these options unreliable
- [Phase 03-wallet-currency]: crypto.randomInt(0,2) used for game outcome — Math.random() never in game resolution code (GINF-02)
- [Phase 03-wallet-currency]: deductBet and settleBet remain separate transactions — Phase 4/5 stateful games need them decoupled
- [Phase 03-wallet-currency P02]: Zustand v5 double-parens TypeScript pattern required: create<State>()((set) => ...) — single parens causes TS inference failure in v5
- [Phase 03-wallet-currency P02]: Balance initialization uses prevTokenRef to detect null→value accessToken transition — avoids double-fetch during mount refresh
- [Phase 03-wallet-currency P02]: Framer Motion spring animation (useSpring + useTransform) used for balance counter — react-countup is React 19 incompatible
- [Phase 03.1-auth-ui-gap-closure P01]: onClick={() => void signOut()} pattern — void operator discards Promise<void> to satisfy strict TS MouseEventHandler return type
- [Phase 03.1-auth-ui-gap-closure P01]: ?expired=true redirect in ProtectedRoute is unconditional — first-time visitors to protected pages will also see session-expired banner; accepted UX inaccuracy for v1.0
- [Phase 03.1-auth-ui-gap-closure P01]: Sign Out button scope limited to pages rendering Header (currently DashboardPage); game pages in Phase 4+ need Header in their layout to surface logout
- [Phase 04-game-infrastructure P01]: vitest installed as backend test runner; walletService.test.ts excluded (documentation stubs only, no runnable suites)
- [Phase 04-game-infrastructure P01]: resolveRouletteBets returns pure profit only — deductBet already removes the stake; profit = net winnings added back
- [Phase 04-game-infrastructure P01]: col_3 uses pocket % 3 === 0 safely — zero pocket guard handles zero before switch statement
- [Phase 04-game-infrastructure P01]: crypto.randomInt(0, 37) selects index into WHEEL_SEQUENCE — maps to actual European pocket number (not the index itself)
- [Phase 04-game-infrastructure P02]: GameCard id prop kept in interface even though not used in render — Phase 5 games may need it for analytics/tracking
- [Phase 04-game-infrastructure P02]: RoulettePage created as minimal placeholder (Header + loading text) so App.tsx import resolves without errors before Plan 03 implements the full UI
- [Phase 04-game-infrastructure P02]: GAMES array defined at module scope above DashboardPage function — constant data, no need to move inside component
- [Phase 04-game-infrastructure P03]: Wheel rotation accumulates non-modded in useRef — modding to 360 causes subsequent spins to barely move because GSAP rotation is absolute
- [Phase 04-game-infrastructure P03]: pocketCentreAngle = index * POCKET_ANGLE + POCKET_ANGLE/2 — brings pocket centre (not leading edge) under 12 o'clock arrow
- [Phase 04-game-infrastructure P03]: ChipRack spinDisabled vs disabled split — bet controls lock during spinning+result, Spin button locks only during spinning so it handles overlay dismiss
- [Phase 04-game-infrastructure P03]: No Play Again button — Spin button handles overlay dismiss and new round, reducing UI surface to single action verb
- [Phase 05-remaining-games]: calculateMinesMultiplier uses hypergeometric compound formula with 0.97 house factor — monotonically growing, higher mine count = higher multiplier per reveal
- [Phase 05-remaining-games]: Mines cashout: settleBet profit=payout (gross), not net profit — deductBet already removed stake; explode: settleBet profit=0, bet fully lost
- [Phase 05-remaining-games]: GET /mines/active-session hides grid boolean array from client mid-round — only revealed indices and mineCount returned (MINE-01)
- [Phase 05-remaining-games]: Dealer hole card never sent to client during player_turn — security by design
- [Phase 05-remaining-games]: Natural blackjack profit = betAmount + floor(betAmount * 0.5) for 3:2 payout (roulette profit semantics)
- [Phase 05-remaining-games]: dealerPlay returns new state (immutable) — avoids mutation bugs in disconnect auto-complete flow
- [Phase 05-remaining-games]: Plinko ball path pre-computed client-side using Fisher-Yates-shuffled L/R decisions constrained to land at server-determined bucket
- [Phase 05-remaining-games]: Frontend PLINKO_MULTIPLIERS table mirrors backend — maintained manually (no shared package needed for v1.0)
- [Phase 05-remaining-games]: Cash Out button only shown when tilesRevealed > 0 — prevents cashout before any safe tiles revealed (matches backend 400 guard)
- [Phase 05-remaining-games]: Balance not updated on mine hit — bet already deducted at start; no payout means no setBalance call needed
- [Phase 05-remaining-games]: BlackjackCard animation: CSS @keyframes injected once into document.head via animationInjected guard — avoids duplicate style injection on re-renders
- [Phase 05-remaining-games]: Blackjack dealer hand: shows only dealerUpCard + face-down during player_turn; full dealerHand revealed on stand/double/settle
- [Phase 05.1-phase04-verification-roulette-fix]: Use selectedChip_roulette key (not lastBet_roulette) — chip denomination is distinct from raw bet amount
- [Phase 05.1-phase04-verification-roulette-fix]: Normalize Roulette mute key from 'mute' to 'isMuted_roulette' to match isMuted_{game} pattern across all stores
- [Phase 05.1-phase04-verification-roulette-fix]: Accept one-time mute preference reset as acceptable UX tradeoff for v1 key normalization
- [Phase 05.2-blackjack-double-header-fix]: dealerValue added to both double handler response branches (bust and normal completion), mirroring stand handler pattern — no playerValue added per minimal-change policy
- [Phase 05.2-blackjack-double-header-fix]: Link wrapper around BalanceDisplay removed entirely; Link import retained because Logo link still uses it
- [Phase 06-leaderboards-real-time P01]: Socket.IO server attached to http.createServer(app) replacing app.listen() — required for WebSocket upgrade; Socket.IO cannot attach to an already-listening Express server
- [Phase 06-leaderboards-real-time P01]: Permissive auth middleware: invalid/expired JWT treated as guest — leaderboard page is public, blocking on bad tokens would break guest access
- [Phase 06-leaderboards-real-time P01]: 7-second leaderboard:update broadcast interval — within user-approved 5–10s discretion range; balances DB load vs perceived real-time freshness
- [Phase 06-leaderboards-real-time P01]: Module-scoped broadcastInterval guard prevents duplicate timers on hot reload (ts-node-dev restarts module, not process)
- [Phase 06-leaderboards-real-time P01]: PostgreSQL rank() OVER window function for ownRanks — fetching all users into JS would not scale; single indexed query is O(log n)
- [Phase 06-leaderboards-real-time P01]: Socket.IO CORS configured separately from Express cors() — Socket.IO has its own CORS layer for WebSocket upgrade handshake
- [Phase 06-leaderboards-real-time]: Explicit Socket type annotation required on socket.ts — pnpm dependency isolation causes TS2742 portability error without it
- [Phase 06-leaderboards-real-time]: Guest socket connect in useLeaderboard hook — AuthContext only connects when accessToken truthy; guests need explicit connect to receive live broadcasts
- [Phase 06-leaderboards-real-time]: balance:update listener registered once in AuthContext — prevents duplicate listeners across multiple game pages
- [Phase 06-leaderboards-real-time P02]: Explicit Socket type annotation (: Socket) required on socket.ts export — pnpm dependency isolation causes TS2742 portability error without it
- [Phase 06-leaderboards-real-time P02]: Conditional socket.disconnect() in useLeaderboard cleanup — only disconnects if no accessToken so it does not disrupt the AuthContext-owned lifecycle for authenticated users
- [Phase 06-leaderboards-real-time P02]: apiClient used for GET /leaderboard even for guests — sends no Authorization header when accessToken is null; backend returns null ownRanks for unauthenticated requests gracefully
- [Phase 07-player-profile]: Profile endpoint is fully public (no requireAuth) — guests can view any player profile
- [Phase 07-player-profile]: Profile lookup by username column (not userId) — public URL uses /profile/:username
- [Phase 07-player-profile]: balanceHistory.x serialized via .toISOString() — Drizzle returns Date objects, Recharts XAxis needs strings
- [Phase 07-player-profile P02]: Profile link conditionally rendered only when both accessToken and username are truthy — prevents stale link on logout
- [Phase 07-player-profile P02]: Sign In link shown in Header when logged out — replaces always-visible Sign Out button (bug fix)
- [Phase 07-player-profile P02]: LeaderboardPage username wrapped in Link with color:inherit — preserves existing font-weight logic while adding navigation

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2 — RESOLVED]: Email infrastructure → Nodemailer with Mailtrap for dev, configurable SMTP_* env vars for prod
- [Phase 2 — RESOLVED]: bcrypt native compilation → using bcryptjs (pure JS, same API, zero node-gyp risk)
- [Phase 2 P01 — PENDING]: Migration 0001_unusual_wrecking_crew.sql generated but not applied — Docker Desktop was not running. Run: docker compose up -d && pnpm --filter backend db:migrate
- [Phase 5 — RESOLVED]: Blackjack session storage → DB game_sessions table (same pattern as Mines). JSON-encoded BlackjackSessionState in state column.
- [Phase 4/5]: Roulette wheel animation complexity is HIGH — evaluate Motion 12 vs GSAP during Phase 4 planning before committing to implementation approach.

## Session Continuity

Last session: 2026-03-06T03:52:21Z
Stopped at: Completed 07-02-PLAN.md
Resume file: None
