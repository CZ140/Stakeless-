# Roadmap: Virtual Casino Platform

## Overview

Eight phases build the platform from the ground up, following a hard-constrained order: Foundation comes first so the schema is right before any code touches it; Auth and Wallet are fully proven before any game engine is wired in; games are delivered in complexity order (Roulette stateless first, then Plinko and Mines, then Blackjack with its multi-step session); leaderboards and profiles follow once game data exists; admin and anti-cheat close the build. Each phase delivers a working, verifiable capability — no horizontal layers, no partial features.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffold, PostgreSQL schema, Express skeleton, React scaffold — the base everything else sits on
- [x] **Phase 2: Auth & Accounts** - User registration, login, sessions, password reset, and profile data model
- [x] **Phase 3: Wallet & Currency** - Virtual coin system, starting balance, daily bonus, and atomic bet transaction pipeline
- [ ] **Phase 3.1: Auth UI Gap Closure** *(INSERTED — gap closure)* - Add logout button to Header and fix session-expired redirect to close the AUTH-03 integration gap
- [x] **Phase 4: Game Infrastructure & Roulette** - Server-side RNG pattern, bet validation, game logging, and the first complete game (Roulette) end-to-end (completed 2026-03-03)
- [x] **Phase 5: Remaining Games** - Plinko (stateless), Mines (session state), and Blackjack (multi-step session) in complexity order (completed 2026-03-03)
- [ ] **Phase 5.1: Phase 04 Verification & Roulette Persistence Fix** *(INSERTED — gap closure)* - Create Phase 04 VERIFICATION.md and fix Roulette selectedChip localStorage seed
- [ ] **Phase 5.2: Blackjack Double Down & Header Profile Link Fix** *(INSERTED — gap closure)* - Fix missing dealerValue in /blackjack/double response and remove broken /profile header link
- [x] **Phase 6: Leaderboards & Real-Time** - WebSocket server, balance push, and all three live leaderboard dimensions (completed 2026-03-04)
- [x] **Phase 7: Player Profile** - Public profile page with stats and balance/wagered charts (completed 2026-03-06)
- [x] **Phase 8: Admin & Anti-Cheat** - Role-gated admin panel, player management, audit log, rate limiting, and bot detection (completed 2026-03-06)

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
**Plans**: 3 plans

Plans:
- [x] 02-01: User model, registration endpoint, bcrypt hashing
- [x] 02-02: Login, JWT issuance (15-min access + 7-day refresh), authenticate middleware
- [x] 02-03: Logout, token revocation, password reset flow

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
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — WalletService (SELECT FOR UPDATE atomicity), claimDailyBonus, settleBet/deductBet, starting balance on registration
- [ ] 03-02-PLAN.md — Zustand balance store, AuthContext wiring, Header with animated BalanceDisplay, DailyBonusCard, DashboardPage
- [ ] 03-03-PLAN.md — validateBet middleware, POST /api/wallet/bet coin-flip pipeline (GINF-01..05), BetRequest/BetResponse shared types

### Phase 3.1: Auth UI Gap Closure *(INSERTED — gap closure)*
**Goal:** Surface logout to users and make the session-expired banner reachable — closes the only remaining v1.0 milestone blocker
**Depends on:** Phase 3
**Requirements:** AUTH-03
**Gap Closure:** Closes gaps from v1.0 MILESTONE-AUDIT.md

Plans:
- [x] 03.1-01-PLAN.md — Add logout button to `Header.tsx`; fix `ProtectedRoute.tsx` session-expired redirect

---

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
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Backend: rouletteService.ts (pure resolver + TDD), gamesRouter POST /api/games/roulette/bet, register in app.ts
- [ ] 04-02-PLAN.md — App shell: GameCard component, dashboard game cards section, App.tsx /games/roulette protected route
- [ ] 04-03-PLAN.md — Full Roulette UI: GSAP wheel, CSS Grid table, ChipRack, rouletteStore, sound hook, ResultOverlay, HowToPlayModal, RoulettePage

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
**Plans**: 5 plans

Plans:
- [ ] 05-01-PLAN.md — Plinko backend (plinkoService + POST /api/games/plinko/bet) + full Plinko React UI (plinkoStore, PlinkoPage, board SVG, ball animation)
- [ ] 05-02-PLAN.md — Mines backend (minesService + 4 routes: start/tile/cashout/active-session)
- [ ] 05-03-PLAN.md — Mines frontend (minesStore, MinesPage with 5x5 grid and prominent Cash Out button)
- [ ] 05-04-PLAN.md — Blackjack backend (blackjackService + 5 routes: deal/hit/stand/double/active-session)
- [ ] 05-05-PLAN.md — Blackjack frontend (blackjackStore, BlackjackCard component, BlackjackPage with card animations)

### Phase 5.1: Phase 04 Verification & Roulette Persistence Fix *(INSERTED — gap closure)*
**Goal:** Create the missing Phase 04 VERIFICATION.md to resolve 11 orphaned requirements, and fix the Roulette selectedChip localStorage seeding bug found during audit
**Depends on**: Phase 5
**Requirements**: GINF-06, GINF-07, GINF-08, GINF-09, ROUL-01, ROUL-02, ROUL-03, ROUL-04, ROUL-05, ROUL-06, ROUL-07
**Gap Closure:** Closes gaps from v1.0 MILESTONE-AUDIT.md (all 11 orphaned requirements; GINF-07 code bug)
**Success Criteria** (what must be TRUE):
  1. A Phase 04 VERIFICATION.md exists and marks GINF-06..09 and ROUL-01..07 as SATISFIED with evidence from the codebase
  2. Roulette page loads with the user's last selected chip denomination pre-filled (same localStorage behavior as Plinko, Mines, and Blackjack)
**Plans**: 1 plan

Plans:
- [x] 05.1-01-PLAN.md — Fix `rouletteStore.ts` selectedChip + mute localStorage persistence; write Phase 04 VERIFICATION.md with evidence for all 11 requirements

### Phase 5.2: Blackjack Double Down & Header Profile Link Fix *(INSERTED — gap closure)*
**Goal:** Fix the critical Blackjack Double Down API defect that leaves dealer hand total blank, and remove the broken /profile header link
**Depends on**: Phase 5
**Requirements**: BJK-02, BJK-04, AUTH-05
**Gap Closure:** Closes gaps from v1.0 MILESTONE-AUDIT.md (critical code defect + broken flow)
**Success Criteria** (what must be TRUE):
  1. After a Blackjack Double Down round, the dealer hand total displays correctly (not "?")
  2. Clicking the balance display in the Header no longer silently redirects to Dashboard — the link is removed or routes to a valid destination

Plans:
- [ ] 05.2-01-PLAN.md — Add `dealerValue` to both res.json calls in the `/blackjack/double` handler (`games.ts`); remove or stub the `<Link to="/profile">` wrapper in `Header.tsx`

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
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md — Public GET /api/profile/:username endpoint (public, no auth); stats aggregation + rank window function + chart data queries; username added to /api/auth/me response
- [ ] 07-02-PLAN.md — ProfilePage (Recharts LineChart + BarChart, tabbed, stat cards); AuthContext username field; Header Profile nav link; Leaderboard username links; App.tsx public route

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
**Plans**: 3 plans

Plans:
- [ ] 08-01-PLAN.md — gameLimiter (30 req/min/IP) + clickInterval (100ms) on all game POST routes; explicit .max(1_000_000) Zod bounds on betAmount schemas (ANTI-01, ANTI-02, ANTI-03)
- [ ] 08-02-PLAN.md — requireAdmin middleware (DB role check), adminService, admin router with 5 endpoints (/stats, /players, /players/:id/history, /players/:id/ban, /players/:id/unban), registered in app.ts (ADMIN-01..05)
- [ ] 08-03-PLAN.md — AdminRoute guard, AdminPage (stats cards, player search, game history inspector, ban/unban controls), /admin route in App.tsx (ADMIN-01..04)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-02-28 |
| 2. Auth & Accounts | 3/3 | Complete   | 2026-03-02 |
| 3. Wallet & Currency | 3/3 | Complete   | 2026-03-02 |
| 3.1. Auth UI Gap Closure | 1/1 | Complete   | 2026-03-02 |
| 4. Game Infrastructure & Roulette | 3/3 | Complete   | 2026-03-03 |
| 5. Remaining Games | 5/5 | Complete   | 2026-03-03 |
| 5.1. Phase 04 Verification & Roulette Fix | 1/1 | Complete   | 2026-03-03 |
| 5.2. Blackjack Double Down & Header Fix | 0/1 | Not started | - |
| 6. Leaderboards & Real-Time | 2/2 | Complete   | 2026-03-04 |
| 7. Player Profile | 2/2 | Complete   | 2026-03-06 |
| 8. Admin & Anti-Cheat | 4/4 | Complete   | 2026-03-06 |
