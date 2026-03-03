# Requirements: Virtual Casino Platform

**Defined:** 2026-02-27
**Core Value:** Players can jump in daily, claim their bonus, play fair-odds casino games with virtual coins, and compete on leaderboards — no real-money risk.

---

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: User can register an account with email and password
- [x] **AUTH-02**: User can log in and maintain a persistent session across browser refreshes (JWT)
- [x] **AUTH-03**: User can log out from any page
- [x] **AUTH-04**: User can reset password via email link
- [x] **AUTH-05**: User profile stores: balance, total wagered, total profit, total loss, daily bonus timestamp, account creation date, last login date

### Virtual Currency

- [x] **CURR-01**: New users receive a starting balance sufficient for approximately 50–100 minimum bets
- [x] **CURR-02**: User can claim a daily bonus once per 24 hours from the dashboard
- [x] **CURR-03**: User's balance is always visible in a persistent header/sidebar on every page
- [x] **CURR-04**: User's balance updates after each game round without a page refresh

### Game Infrastructure

- [x] **GINF-01**: All games deduct the bet amount from the user's balance before play begins
- [x] **GINF-02**: All game outcomes are calculated server-side using a cryptographically secure RNG (never client-side)
- [x] **GINF-03**: Winnings are credited to the user's balance after the outcome is resolved server-side
- [x] **GINF-04**: Every game round logs: UserID, GameType, BetAmount, Outcome, Profit, Timestamp
- [x] **GINF-05**: Each game enforces minimum and maximum bet limits; bets outside range are rejected before play
- [ ] **GINF-06**: Each game shows quick-select bet chips (e.g. 10 / 50 / 100 / 500 / Max) plus Half and Double buttons
- [ ] **GINF-07**: Each game pre-fills the bet amount with the user's last bet on that game
- [ ] **GINF-08**: Each game plays a win or loss animation and sound effect after each round outcome; mute toggle state persists across sessions via localStorage
- [ ] **GINF-09**: Each game has an accessible how-to-play rules panel (modal or collapsible section)

### Blackjack

- [x] **BJK-01**: User can play Blackjack single-player vs a dealer AI
- [ ] **BJK-02**: User can Hit, Stand, or Double Down during their turn
- [x] **BJK-03**: Game uses a standard 52-card deck; dealer stands on soft 17
- [ ] **BJK-04**: Cards are animated on deal; hand totals are displayed for player and dealer

### Roulette

- [ ] **ROUL-01**: User can play European Roulette (single zero, 37 pockets)
- [ ] **ROUL-02**: User can place Red/Black bets
- [ ] **ROUL-03**: User can place Odd/Even bets
- [ ] **ROUL-04**: User can place straight-up single number bets
- [ ] **ROUL-05**: User can place Dozens bets (1–12, 13–24, 25–36)
- [ ] **ROUL-06**: User can place Columns bets
- [ ] **ROUL-07**: Animated wheel spin reveals the result; ball decelerates realistically before stopping

### Plinko

- [x] **PLNK-01**: User can select a bet amount, risk level (Low / Medium / High), and row count before dropping
- [x] **PLNK-02**: Ball animation follows a plausible physical path through pegs to the final slot
- [x] **PLNK-03**: Final slot determines the payout multiplier; winnings are applied to the user's balance after animation completes

### Mines

- [x] **MINE-01**: User can select a bet amount and number of mines before starting a round
- [x] **MINE-02**: User clicks tiles; a safe tile reveals a gem and increases the active multiplier; a mine tile ends the round and loses the bet
- [x] **MINE-03**: User can cash out at any point during an active round to receive the current multiplier payout
- [x] **MINE-04**: Cash Out button is visually prominent during an active round and displays the current multiplier value
- [x] **MINE-05**: Mine grid state is stored server-side; client sends tile coordinates, server validates and returns outcome

### Leaderboards

- [ ] **LDR-01**: Balance leaderboard displays top users ranked by current balance
- [ ] **LDR-02**: Total Wagered leaderboard displays top users ranked by lifetime amount wagered
- [ ] **LDR-03**: Profit leaderboard displays top users ranked by total profit
- [ ] **LDR-04**: All leaderboards update in real-time via WebSocket push
- [ ] **LDR-05**: Each leaderboard shows the logged-in user's own rank even when they are not in the top 10

### Player Profile

- [ ] **PROF-01**: Each user has a profile page displaying: username, current balance, leaderboard rank, total wagered, total profit, and total games played
- [ ] **PROF-02**: Profile page displays a balance over time chart
- [ ] **PROF-03**: Profile page displays a wagered per day chart

### Admin Panel

- [ ] **ADMIN-01**: Admin login is restricted to accounts with the admin role; role is verified against the database on every admin request (not trusted from JWT payload alone)
- [ ] **ADMIN-02**: Admin dashboard displays: total registered users, total bets placed, total coins in circulation, most active users
- [ ] **ADMIN-03**: Admin can search for a player by username and view their balance and game/wager history
- [ ] **ADMIN-04**: Admin can ban a player account (immediately invalidates their active sessions)
- [ ] **ADMIN-05**: All admin actions are recorded in an audit log (AdminID, Action, TargetUserID, Timestamp)

### Anti-Cheat

- [ ] **ANTI-01**: Rate limiting is applied to all game bet endpoints and API routes
- [ ] **ANTI-02**: All bet amounts, game parameters, and outcomes are validated server-side before any balance change occurs
- [ ] **ANTI-03**: Click interval checks detect and reject requests at inhuman speed (anti-automation)

---

## v2 Requirements

Deferred to a future release. Tracked but not in current roadmap.

### Games

- **GAME-V2-01**: Slots game with multiple reels, symbols, and a paytable
- **GAME-V2-02**: CS:GO-style Case Spinner with tiered rarity drops (Common → Legendary) and coin-value conversion
- **GAME-V2-03**: Poker — Texas Hold'em with real-time multiplayer tables and optional bot fill
- **GAME-V2-04**: Blackjack split action

### Progression

- **PROG-V2-01**: Clicker system — clicks generate coins; upgrades increase coins-per-click and auto-click speed with exponential upgrade costs
- **PROG-V2-02**: Progressive daily bonus streak — escalating rewards per consecutive day claimed; missed day resets streak
- **PROG-V2-03**: Clicker leaderboard ranked by total clicks

### Admin

- **ADMIN-V2-01**: Admin can configure game RTP override per game (e.g. Slots default 96%, override to custom %)
- **ADMIN-V2-02**: Admin can set per-player win multiplier (0.8 = worse odds, 1.2 = better odds)
- **ADMIN-V2-03**: Admin can adjust a player's balance by a specific amount (+/-)

### History & Social

- **HIST-V2-01**: Bet history UI showing last 50 rounds per game on player profile
- **SOCL-V2-01**: Chat system (requires moderation infrastructure)
- **SOCL-V2-02**: Friend system and private tables

---

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real money, deposits, withdrawals | By design — platform is virtual currency only, never real financial value |
| Cryptocurrency | Explicitly excluded from project goals |
| Payment processors | No real-money component exists |
| Autoplay / auto-bet | Anti-feature: disengages players from the interactive loop; research shows +7–9% betting activity increase with associated harms |
| Marketplace / item trading | No currency purchasing is allowed; inventory system adds complexity with no v1 value |
| Provably fair RNG display | Trust differentiator for v2+ once credibility matters; not critical for v1 |
| Mobile app | Web-first; responsive design covers mobile browser access |
| Cosmetic marketplace | Requires monetization model decision; deferred indefinitely |
| Push/email re-engagement | Disproportionate infrastructure for v1 (password reset email is included) |
| Tournaments / seasonal resets | Requires time-bounded leaderboard infrastructure; v2+ |
| VIP tier system | Premature with unvalidated player base; leaderboard rank serves as social status for v1 |

---

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 3.1 | Complete |
| AUTH-04 | Phase 2 | Complete |
| AUTH-05 | Phase 2 | Complete |
| CURR-01 | Phase 3 | Complete |
| CURR-02 | Phase 3 | Complete |
| CURR-03 | Phase 3 | Complete |
| CURR-04 | Phase 3 | Complete |
| GINF-01 | Phase 3 | Complete |
| GINF-02 | Phase 3 | Complete |
| GINF-03 | Phase 3 | Complete |
| GINF-04 | Phase 3 | Complete |
| GINF-05 | Phase 3 | Complete |
| GINF-06 | Phase 5.1 | Pending |
| GINF-07 | Phase 5.1 | Pending |
| GINF-08 | Phase 5.1 | Pending |
| GINF-09 | Phase 5.1 | Pending |
| BJK-01 | Phase 5 | Complete |
| BJK-02 | Phase 5.2 | Pending |
| BJK-03 | Phase 5 | Complete |
| BJK-04 | Phase 5.2 | Pending |
| ROUL-01 | Phase 5.1 | Pending |
| ROUL-02 | Phase 5.1 | Pending |
| ROUL-03 | Phase 5.1 | Pending |
| ROUL-04 | Phase 5.1 | Pending |
| ROUL-05 | Phase 5.1 | Pending |
| ROUL-06 | Phase 5.1 | Pending |
| ROUL-07 | Phase 5.1 | Pending |
| PLNK-01 | Phase 5 | Complete |
| PLNK-02 | Phase 5 | Complete |
| PLNK-03 | Phase 5 | Complete |
| MINE-01 | Phase 5 | Complete |
| MINE-02 | Phase 5 | Complete |
| MINE-03 | Phase 5 | Complete |
| MINE-04 | Phase 5 | Complete |
| MINE-05 | Phase 5 | Complete |
| LDR-01 | Phase 6 | Pending |
| LDR-02 | Phase 6 | Pending |
| LDR-03 | Phase 6 | Pending |
| LDR-04 | Phase 6 | Pending |
| LDR-05 | Phase 6 | Pending |
| PROF-01 | Phase 7 | Pending |
| PROF-02 | Phase 7 | Pending |
| PROF-03 | Phase 7 | Pending |
| ADMIN-01 | Phase 8 | Pending |
| ADMIN-02 | Phase 8 | Pending |
| ADMIN-03 | Phase 8 | Pending |
| ADMIN-04 | Phase 8 | Pending |
| ADMIN-05 | Phase 8 | Pending |
| ANTI-01 | Phase 8 | Pending |
| ANTI-02 | Phase 8 | Pending |
| ANTI-03 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 53 total (note: original count of 52 was a typo — actual enumerated requirements = 53)
- Mapped to phases: 53/53
- Unmapped: 0

**Phase distribution:**
- Phase 1 (Foundation): 0 requirements (infrastructure — unblocks all phases)
- Phase 2 (Auth): AUTH-01..05 — 5 requirements
- Phase 3 (Wallet): CURR-01..04, GINF-01..05 — 9 requirements
- Phase 4 (Game Infra + Roulette): GINF-06..09, ROUL-01..07 — 11 requirements
- Phase 5 (Remaining Games): BJK-01..04, PLNK-01..03, MINE-01..05 — 12 requirements
- Phase 6 (Leaderboards): LDR-01..05 — 5 requirements
- Phase 7 (Profile): PROF-01..03 — 3 requirements
- Phase 8 (Admin + Anti-Cheat): ADMIN-01..05, ANTI-01..03 — 8 requirements

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-03-03 — gap closure phases 5.1 and 5.2 assigned; 13 requirements reset to Pending (GINF-06..09, ROUL-01..07, BJK-02, BJK-04)*
