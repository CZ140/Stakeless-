# Phase 4: Game Infrastructure & Roulette - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the full game resolution pipeline end-to-end using Roulette as the first complete game: player places multi-type bets on a visual table layout, server resolves the outcome with cryptographic RNG, balance updates atomically, the round is logged, and the animated wheel reveals the result.

This phase also establishes shared game infrastructure (GINF-06..09) — bet chip panel, last-bet prefill, win/loss sound system, how-to-play rules panel — that all Phase 5+ games will inherit.

Building Plinko, Mines, or Blackjack is Phase 5. Leaderboard WebSocket push is Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Wheel Animation
- Library: GSAP (free tier) — Framer Motion is already installed but not chosen for the wheel; GSAP gives the smoothest deceleration curves for a 5–8 second dramatic spin
- Duration: 5–8 seconds (dramatic, builds tension)
- Ball behavior: Simple decelerate — the wheel itself decelerates and brings the server-determined pocket under the marker; no separate orbiting ball animation
- View: Top-down circular wheel (bird's-eye view), all 37 numbered pockets visible in a circle
- Numbers: Always legible while spinning (wheel rotates slowly enough that pockets are readable)

### Bet Placement UX (Multi-bet)
- Layout: Visual roulette table layout — green felt grid showing the numbered pockets (0–36) plus all outside bet zones (Red/Black, Odd/Even, Dozens, Columns)
- Players can place chips on multiple bet zones simultaneously per spin (multi-bet)
- Chip placement flow: player selects a chip denomination from the chip rack first, then clicks a table zone to place that chip value; each click places one chip
- Chip rack values: 10 / 50 / 100 / 500 / Max (satisfies GINF-06)
- Undo controls: "Undo Last" (removes the last chip placed) and "Clear All" (removes all chips)
- Half / Double buttons operate on the total bet amount across all placed chips (GINF-06)
- Post-spin: table clears after each round — player places fresh bets each spin
- Last-bet prefill (GINF-07): restore the previous round's chip layout via a "Rebet" button (or auto-restore from localStorage); pre-selects the last chip denomination used

### Game Navigation
- Game cards on the dashboard: all four games (Roulette, Plinko, Mines, Blackjack) appear as cards on the DashboardPage below the daily bonus section
- Non-built games (Phase 5) show as "Coming Soon" with a locked/dimmed appearance
- Card content: game icon/emoji + name + one-line description (e.g. "European wheel, 37 pockets") + Play button (or "Coming Soon" badge)
- Card layout: horizontal row
- Game pages use the same Header component (balance display + Sign Out) — consistent across all pages
- Roulette page route: /games/roulette

### Win/Loss Feedback (Subtle)
- After the wheel stops: the winning pocket on the wheel highlights/glows + the pocket number and color display as a result badge on the wheel
- Result box: a box overlaying or appearing near the wheel showing: winning number, pocket color, applicable multiplier for the player's bets, and net amount won/lost
- Result box stays until the player explicitly dismisses it (clicks "Play Again" or "Place Bets") — they control the pace
- Win sound: short bright chime via Web Audio API
- Loss sound: short low tone via Web Audio API
- Mute toggle persists across sessions via localStorage (GINF-08)

### How-To-Play Rules Panel (GINF-09)
- Accessible from within the Roulette game page
- Claude's Discretion: modal vs collapsible sidebar — pick whichever fits the layout better

### Claude's Discretion
- Exact GSAP easing curve for the wheel deceleration
- Result box visual design (position, size, animation in/out)
- How-to-play panel format (modal or collapsible)
- Web Audio API tone frequencies and durations
- Exact styling of the chip rack and table layout (colors, grid proportions) — must stay within the established dark theme
- Last-bet prefill storage mechanism (localStorage key per game)

</decisions>

<specifics>
## Specific Ideas

- The result box should show: winning number, the color of that pocket (red/black/green for zero), the multiplier that applied to the player's winning bets, and the net coins won/lost
- The result box stays up until the player actively dismisses it — they control when the next round begins
- GSAP free tier only — no paid plugins needed
- The chip rack (10/50/100/500/Max) is the primary bet input; the table layout is where chips land; Half/Double work on the running total

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BalanceDisplay.tsx` + `balanceStore.ts` (Zustand): after a Roulette bet resolves, call `balanceStore.getState().setBalance(newBalance)` from the API response — same pattern as the coin-flip route
- `Header.tsx`: import directly into `RoulettePage` — already has balance display and Sign Out
- `requireAuth` middleware (`apps/backend/src/middleware/requireAuth.ts`): wire into the roulette route
- `validateBet` middleware (`apps/backend/src/middleware/validateBet.ts`): reuse or extend for roulette multi-bet validation
- `deductBet` + `settleBet` (`walletService.ts`): the game engine calls these — same two-transaction pattern (deduct before play, settle after outcome)
- `walletRouter` pattern (`apps/backend/src/routes/wallet.ts`): create `gamesRouter` following the same structure, register at `/api/games`
- `apiClient` (`apps/frontend/src/api/client.ts`): use for `POST /api/games/roulette/bet`

### Established Patterns
- `crypto.randomInt` for RNG — never `Math.random()` in game resolution (GINF-02 established in Phase 3)
- `db.transaction() + .for('update')` for all balance mutations — single chokepoint for race-condition safety
- Separate `deductBet` and `settleBet` transactions — required for the stateful game pattern (deduct before play begins, settle after outcome known)
- Dark theme: `#0d0d1a` page background, `#1a1a2e` card/header background, `#e0d7ff` accent text
- Framer Motion spring for balance animation in `BalanceDisplay` — will animate the balance update automatically when `setBalance` is called after a Roulette round

### Integration Points
- `DashboardPage.tsx`: add game cards section below `<DailyBonusCard>` — four cards in a horizontal row
- `App.tsx`: add `<Route path="/games/roulette" element={<RoulettePage />} />` (protected)
- `apps/backend/src/app.ts`: register `gamesRouter` at `/api/games`
- GINF-07 last-bet prefill: store last chip layout per game in `localStorage` (key: `lastBet_roulette`) — no backend table needed at Phase 4

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-game-infrastructure-roulette*
*Context gathered: 2026-03-02*
