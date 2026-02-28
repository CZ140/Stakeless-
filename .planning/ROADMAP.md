# Roadmap: Virtual Casino Platform

## Overview

Eight phases build the platform from the ground up, following a hard-constrained order: Foundation comes first so the schema is right before any code touches it; Auth and Wallet are fully proven before any game engine is wired in; games are delivered in complexity order (Roulette stateless first, then Plinko and Mines, then Blackjack with its multi-step session); leaderboards and profiles follow once game data exists; admin and anti-cheat close the build. Each phase delivers a working, verifiable capability — no horizontal layers, no partial features.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffold, PostgreSQL schema, Express skeleton, React scaffold — the base everything else sits on
- [ ] **Phase 2: Auth & Accounts** - User registration, login, sessions, password reset, and profile data model
- [ ] **Phase 3: Wallet & Currency** - Virtual coin system, starting balance, daily bonus, and atomic bet transaction pipeline
- [ ] **Phase 4: Game Infrastructure & Roulette** - Server-side RNG pattern, bet validation, game logging, and the first complete game (Roulette) end-to-end
- [ ] **Phase 5: Remaining Games** - Plinko (stateless), Mines (session state), and Blackjack (multi-step session) in complexity order
- [ ] **Phase 6: Leaderboards & Real-Time** - WebSocket server, balance push, and all three live leaderboard dimensions
- [ ] **Phase 7: Player Profile** - Public profile page with stats and balance/wagered charts
- [ ] **Phase 8: Admin & Anti-Cheat** - Role-gated admin panel, player management, audit log, rate limiting, and bot detection

## Phase Details

### Phase 1: Foundation
**Goal**: The project scaffolding is in place so that every subsequent phase builds on a stable, correct base with no schema rewrites
**Depends on**: Nothing (first phase)
**Requirements**: None (infrastructure phase — no user-facing behaviors yet; unblocks all other phases)
**Success Criteria** (what must be TRUE):
  1. The monorepo runs with a single start command and both the React frontend and Express backend serve without errors
  2. PostgreSQL database is reachable, Drizzle migrations run cleanly, and all tables (users, game_logs, game_sessions, daily_bonus_claims, admin_logs) exist with correct column types (balance as BIGINT, never FLOAT)
  3. Environment config (.env) loads and the app rejects startup if required variables are missing
  4. TypeScript compiles without errors across both frontend and backend packages
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — pnpm workspace skeleton, tsconfig.base.json, all package scaffolds, @gambling/shared types
- [x] 01-02-PLAN.md — Docker Compose (postgres), Drizzle schema (5 tables, BIGINT balance), migrations
- [x] 01-03-PLAN.md — Express skeleton (helmet, cors, health route), React/Vite scaffold, Vite proxy, pnpm dev smoke test

### Phase 2: Auth & Accounts
**Goal**: Users can securely create accounts, log in, maintain sessions across browser refreshes, and recover access — all user data is owned and protected
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. A user can register with email and password; the password is stored as a bcrypt hash (never plaintext)
  2. A user can log in and their session persists across browser tab closes and refreshes (JWT with httpOnly refresh cookie)
  3. A user can log out from any page and their session is immediately invalidated
  4. A user can request a password reset email and use the link to set a new password
  5. The user record stores balance, total wagered, total profit, total loss, daily bonus timestamp, account creation date, and last login date — all readable via the profile API
**Plans**: TBD

Plans:
- [ ] 02-01: User model, registration endpoint, bcrypt hashing
- [ ] 02-02: Login, JWT issuance (15-min access + 7-day refresh), authenticate middleware
- [ ] 02-03: Logout, token revocation, password reset flow

### Phase 3: Wallet & Currency
**Goal**: The virtual coin economy is live — users start with coins, can earn more daily, and every bet deduction/credit is atomic with no race condition possible
**Depends on**: Phase 2
**Requirements**: CURR-01, CURR-02, CURR-03, CURR-04, GINF-01, GINF-02, GINF-03, GINF-04, GINF-05
**Success Criteria** (what must be TRUE):
  1. A newly registered user automatically receives a starting balance sufficient for at least 50 minimum bets, visible immediately after registration
  2. A user can claim a daily bonus once per 24 hours from the dashboard; a second claim attempt within 24 hours is rejected with a clear countdown message
  3. The user's current balance is visible in the persistent header on every page at all times
  4. After any game round completes, the balance displayed in the header updates without a page refresh
  5. Ten simultaneous bet requests from the same user result in at most one successful deduction — no double-spend is possible
**Plans**: TBD

Plans:
- [ ] 03-01: WalletService with atomic PostgreSQL transaction (SELECT FOR UPDATE), starting balance on registration
- [ ] 03-02: Daily bonus endpoint with 24-hour gate, balance read API, header balance display (React)
- [ ] 03-03: Bet deduct/credit pipeline (GINF-01, GINF-03), game_logs append (GINF-04), bet limit enforcement (GINF-05), server-side RNG setup (GINF-02)

### Phase 4: Game Infrastructure & Roulette
**Goal**: The full game resolution pipeline is proven end-to-end with Roulette — a player places a bet, the server resolves it with cryptographic RNG, the balance updates, the round is logged, and the animated wheel reveals the result
**Depends on**: Phase 3
**Requirements**: GINF-06, GINF-07, GINF-08, GINF-09, ROUL-01, ROUL-02, ROUL-03, ROUL-04, ROUL-05, ROUL-06, ROUL-07
**Success Criteria** (what must be TRUE):
  1. A user can open the Roulette game, place any of the six bet types (Red/Black, Odd/Even, Single Number, Dozens, Columns), and receive an outcome with the correct payout or loss applied to their balance
  2. The animated wheel spins and the ball decelerates to land on the server-determined outcome — the animation always matches the actual result
  3. Quick-select bet chips (10 / 50 / 100 / 500 / Max), Half, and Double buttons appear on the bet panel; the game pre-fills the bet with the user's last Roulette wager
  4. After a round, a win plays a win animation and sound; a loss plays a loss animation and sound; the mute toggle state persists across page refreshes
  5. A how-to-play rules panel is accessible from within the game and explains all bet types and payouts
**Plans**: TBD

Plans:
- [ ] 04-01: RNG utilities, GameEngine interface, BetLogService, bet validation middleware
- [ ] 04-02: Roulette game engine (server-side, pure function), POST /api/games/roulette/bet route
- [ ] 04-03: Roulette React UI — wheel animation, bet panel, quick-select chips, win/loss feedback, sound system, rules panel

### Phase 5: Remaining Games
**Goal**: All four v1 games are playable — Plinko and Mines complete the stateless and session-state patterns; Blackjack completes the multi-step session pattern
**Depends on**: Phase 4
**Requirements**: PLNK-01, PLNK-02, PLNK-03, MINE-01, MINE-02, MINE-03, MINE-04, MINE-05, BJK-01, BJK-02, BJK-03, BJK-04
**Success Criteria** (what must be TRUE):
  1. A user can play Plinko: select bet amount, risk level, and row count; the ball animates through pegs to a slot; the correct multiplier payout is applied to the balance
  2. A user can play Mines: select bet amount and mine count; click tiles to reveal gems (increasing multiplier) or mines (round ends, bet lost); cash out at any time for the current multiplier; the Cash Out button displays the live multiplier and is visually prominent during an active round
  3. Mines grid state is stored server-side — the client sends tile coordinates only and cannot fabricate an outcome
  4. A user can play Blackjack: the dealer AI follows standard rules (stands on soft 17); the user can Hit, Stand, or Double Down; cards animate on deal; hand totals display for both player and dealer
  5. All three games inherit the shared bet panel (quick-select chips, Half, Double, last-bet prefill), win/loss animations, sound system, and how-to-play panel from Phase 4 infrastructure
**Plans**: TBD

Plans:
- [ ] 05-01: Plinko engine (stateless, risk/rows → bucket), POST /api/games/plinko/bet, Plinko React UI with ball physics animation
- [ ] 05-02: Mines engine, game_sessions table integration, POST /api/games/mines/start + /tile + /cashout, Mines React UI
- [ ] 05-03: Blackjack engine (deal → player turn → dealer turn), multi-step session routes, Blackjack React UI with card animations

### Phase 6: Leaderboards & Real-Time
**Goal**: All three leaderboards update live via WebSocket push — players see themselves ranked and watch standings change in real time without refreshing
**Depends on**: Phase 3, Phase 4
**Requirements**: LDR-01, LDR-02, LDR-03, LDR-04, LDR-05
**Success Criteria** (what must be TRUE):
  1. The Balance leaderboard, Total Wagered leaderboard, and Profit leaderboard each display the top-ranked users with correct values
  2. When a player completes a game round, all three leaderboards update within 1-2 seconds without any page action from the viewer
  3. A logged-in user whose rank is outside the top 10 still sees their own rank displayed on every leaderboard (e.g., "You: #47")
  4. Balance updates after a game round reach the playing user's balance display via WebSocket without a page refresh
**Plans**: TBD

Plans:
- [ ] 06-01: Socket.IO server with JWT handshake authentication, userSockets registry, pushBalanceUpdate (targeted), broadcastLeaderboard (throttled)
- [ ] 06-02: LeaderboardService (indexed queries on denormalized columns), GET /api/leaderboard endpoints, own-rank inclusion logic, WebSocket client hook in React

### Phase 7: Player Profile
**Goal**: Every user has a public profile page showing their stats and visual history — players can track their own progression and compare themselves to others
**Depends on**: Phase 3, Phase 6
**Requirements**: PROF-01, PROF-02, PROF-03
**Success Criteria** (what must be TRUE):
  1. Visiting /profile/:username shows the user's username, current balance, leaderboard rank, total wagered, total profit, and total games played
  2. The profile page displays a balance over time chart drawn from game log history
  3. The profile page displays a wagered per day chart drawn from game log history
**Plans**: TBD

Plans:
- [ ] 07-01: GET /api/profile/:id endpoint (with ownership check), stats aggregation queries against game_logs
- [ ] 07-02: Profile React page with stats display, Recharts balance-over-time chart, wagered-per-day chart

### Phase 8: Admin & Anti-Cheat
**Goal**: The operator can monitor and moderate the platform — admins can inspect players, ban accounts (with immediate session invalidation), and the platform actively rejects automated and cheating requests
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ANTI-01, ANTI-02, ANTI-03
**Success Criteria** (what must be TRUE):
  1. An admin can log in and access the admin dashboard; a non-admin account attempting to access any /admin route receives a 403 error — the role check hits the database on every request, not the JWT claim alone
  2. The admin dashboard displays: total registered users, total bets placed, total coins in circulation, and the most active users
  3. An admin can search for a player by username and view their balance and full game/wager history
  4. An admin can ban a player; the banned user's active sessions are immediately invalidated (they cannot make another bet or page load without re-login, which is also rejected)
  5. Every admin action is recorded in an audit log with AdminID, Action, TargetUserID, and Timestamp
  6. Automated bot requests (inhuman click intervals) and bets outside valid ranges are rejected server-side before any balance change occurs
**Plans**: TBD

Plans:
- [ ] 08-01: Rate limiting on all game/API endpoints (ANTI-01), bet param server-side validation middleware (ANTI-02), click interval detection (ANTI-03)
- [ ] 08-02: Admin router (/api/admin/*) with authenticate + requireAdmin (DB-verified) middleware, AdminService (user lookup, ban with token_version increment, balance reset), AdminLogs audit trail
- [ ] 08-03: Admin React UI — dashboard stats, player search/inspector, ban controls (behind role-gated routes)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-28 |
| 2. Auth & Accounts | 0/3 | Not started | - |
| 3. Wallet & Currency | 0/3 | Not started | - |
| 4. Game Infrastructure & Roulette | 0/3 | Not started | - |
| 5. Remaining Games | 0/3 | Not started | - |
| 6. Leaderboards & Real-Time | 0/2 | Not started | - |
| 7. Player Profile | 0/2 | Not started | - |
| 8. Admin & Anti-Cheat | 0/3 | Not started | - |
