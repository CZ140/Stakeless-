---
phase: 04-game-infrastructure-roulette
plan: 03
subsystem: ui
tags: [react, gsap, framer-motion, zustand, roulette, animation, game-ui]

# Dependency graph
requires:
  - phase: 04-game-infrastructure-roulette
    provides: rouletteService.ts resolver + POST /api/games/roulette/bet endpoint
  - phase: 03-wallet-currency
    provides: balanceStore Zustand store + useBalanceStore hook
  - phase: 02-auth-accounts
    provides: apiClient with auth interceptors + Header component

provides:
  - Full roulette game UI at /games/roulette
  - RouletteWheel: GSAP conic-gradient wheel with correct rotation math (arrow aligns to winning pocket)
  - RouletteTable: betting grid with chip badge indicators per zone
  - ChipRack: denomination selector, bet controls (half/double/undo/clear/rebet), mute toggle, Spin button
  - ResultOverlay: animated result card (Framer Motion) showing winning number, color, net coins
  - rouletteStore: Zustand store (betting/spinning/result phases, chip placement, mute)
  - useGameSounds: Web Audio API win/loss chimes with mute support
  - HowToPlayModal: rules reference overlay

affects:
  - Phase 5 (Plinko, Mines, Blackjack) — same component patterns, store pattern, sound hook pattern
  - Phase 8 (anti-cheat/admin) — game round data shapes established here

# Tech tracking
tech-stack:
  added:
    - gsap (wheel rotation animation with power3.out easing)
    - "@gsap/react" (useGSAP hook for React lifecycle integration)
    - framer-motion (ResultOverlay AnimatePresence fade/scale)
  patterns:
    - conic-gradient wheel rendered as div background, rotated via GSAP rotation property
    - Accumulated rotation tracked in useRef (never modded) so subsequent spins always move forward
    - Pocket alignment: pocketCentreAngle = index * POCKET_ANGLE + POCKET_ANGLE/2; delta computed with (target - current + 360) % 360
    - Chip badge aggregation: useMemo over placedChips array → Record<zone, total> map
    - spinDisabled vs disabled separation in ChipRack: bet controls lock during spinning+result, Spin button locks only during spinning

key-files:
  created:
    - apps/frontend/src/stores/rouletteStore.ts
    - apps/frontend/src/hooks/useGameSounds.ts
    - apps/frontend/src/components/RouletteWheel.tsx
    - apps/frontend/src/components/RouletteTable.tsx
    - apps/frontend/src/components/ChipRack.tsx
    - apps/frontend/src/components/ResultOverlay.tsx
    - apps/frontend/src/components/HowToPlayModal.tsx
  modified:
    - apps/frontend/src/pages/RoulettePage.tsx

key-decisions:
  - "Wheel rotation: use pocketCentreAngle = index * POCKET_ANGLE + POCKET_ANGLE/2 so arrow aligns to centre of winning sector, not its leading edge"
  - "Accumulated rotation stored non-modded in useRef — modding to 360 caused subsequent spins to barely move because GSAP rotation is absolute"
  - "ChipRack spinDisabled/disabled split: bet controls disabled during result phase, Spin button enabled so user can click to dismiss overlay and play again"
  - "No standalone Play Again button — Spin handles overlay dismiss, keeps single action surface for the player"
  - "Chip badge uses absolute positioning within position:relative cell; pointerEvents:none prevents interfering with click handlers"
  - "Web Audio API for sounds — no audio file assets needed, pure programmatic tone generation"

patterns-established:
  - "Game phase enum (betting/spinning/result) in Zustand store — use same pattern for Plinko/Mines/Blackjack"
  - "Pending balance pattern: store newBalance from API response, apply to balanceStore only after wheel animation completes to sync UI with visual"
  - "Sound hook (useGameSounds) accepts isMuted boolean — stateless, reusable for future games"

requirements-completed: [ROUL-01, ROUL-02, ROUL-03, ROUL-04, ROUL-05, ROUL-06, ROUL-07, GINF-06, GINF-07, GINF-08, GINF-09]

# Metrics
duration: 45min
completed: 2026-03-02
---

# Phase 4 Plan 03: Roulette UI Summary

**GSAP-animated European roulette wheel with correct pocket alignment, chip badge indicators, betting controls, and Framer Motion result overlay — full playable roulette at /games/roulette**

## Performance

- **Duration:** 45 min
- **Started:** 2026-03-02
- **Completed:** 2026-03-02
- **Tasks:** 3 (including bug fix continuation task)
- **Files modified:** 8

## Accomplishments

- Full roulette game loop: place chips → spin wheel (GSAP 6s power3.out) → result overlay → play again
- Correct wheel rotation math: arrow points exactly to winning pocket centre on every spin, including subsequent spins
- Chip badge indicators on every betting table cell showing accumulated bet amount per zone
- Single Spin button handles both new spin and overlay dismiss — no separate Play Again button
- Zustand store for game phase, chip placement, mute state with localStorage persistence
- Web Audio API win/loss sounds with mute toggle

## Task Commits

Each task was committed atomically:

1. **Task 1: Install GSAP, create rouletteStore and useGameSounds** - `b4774cd` (feat)
2. **Task 2: Build all Roulette UI components and wire RoulettePage** - `baf247d` (feat)
3. **Task 3: Fix wheel rotation, chip indicators, UX flow** - `451eae8` (feat)

## Files Created/Modified

- `apps/frontend/src/stores/rouletteStore.ts` - Zustand store: selectedChip, placedChips, gamePhase, isMuted; placeChip/undoLast/clearAll/halfBet/doubleBet/rebet actions
- `apps/frontend/src/hooks/useGameSounds.ts` - Web Audio API win (bright chime) and loss (low tone) with mute gate
- `apps/frontend/src/components/RouletteWheel.tsx` - Conic-gradient wheel div rotated via GSAP with accumulated rotation tracking; top-marker arrow
- `apps/frontend/src/components/RouletteTable.tsx` - Full betting grid (0 + 1-36 numbers + 10 outside zones) with ChipBadge per zone
- `apps/frontend/src/components/ChipRack.tsx` - Chip denomination buttons (10/50/100/500/Max), bet controls, Spin button with spinDisabled/showingResult props
- `apps/frontend/src/components/ResultOverlay.tsx` - Framer Motion AnimatePresence overlay: winning number, color label, net coins, "Press Spin to play again" hint
- `apps/frontend/src/components/HowToPlayModal.tsx` - Rules reference modal
- `apps/frontend/src/pages/RoulettePage.tsx` - Page orchestrator: handleSpin (API call + state), handleWheelSettled (balance sync + sound), handlePlayAgain (reset)

## Decisions Made

- Wheel rotation accumulates in a non-modded `useRef` — modding to 360 after each spin causes GSAP's absolute `rotation` property to interpret subsequent targets as tiny movements
- `pocketCentreAngle = index * POCKET_ANGLE + POCKET_ANGLE / 2` brings pocket centre under 12 o'clock marker, not the pocket's leading edge
- `delta = (pocketCentreAngle - currentNorm + 360) % 360` ensures we always spin clockwise (forward) regardless of where the current norm falls
- `spinDisabled` (only true during `spinning` phase) decoupled from `disabled` (true during `spinning | result`) so Spin remains clickable while overlay is visible
- No separate Play Again button — reduces UI surface and keeps the user's single action verb as "Spin"

## Deviations from Plan

### Auto-fixed Issues (during human verification checkpoint continuation)

**1. [Rule 1 - Bug] Fixed wheel arrow/number mismatch**
- **Found during:** Task 3 (human verification)
- **Issue:** The formula `360 - pocketIndex * POCKET_ANGLE` rotated to the leading edge of the previous pocket, not the winning pocket's centre. Winning number shown in overlay did not match where the arrow pointed.
- **Fix:** Changed to `pocketCentreAngle = pocketIndex * POCKET_ANGLE + POCKET_ANGLE / 2` with forward-delta calculation
- **Files modified:** apps/frontend/src/components/RouletteWheel.tsx
- **Committed in:** `451eae8`

**2. [Rule 1 - Bug] Fixed subsequent spins barely moving**
- **Found during:** Task 3 (human verification)
- **Issue:** `currentRotationRef.current = targetRotation % 360` modded the stored rotation. GSAP `rotation` is absolute, so next spin's target (modded_base + 1800 + delta) was nearly equal to GSAP's internal accumulated rotation, causing almost no movement.
- **Fix:** Store `targetRotation` directly (not modded) so every spin always adds 5*360 + delta on top of the true cumulative rotation
- **Files modified:** apps/frontend/src/components/RouletteWheel.tsx
- **Committed in:** `451eae8`

**3. [Rule 2 - Missing Critical] Added chip badge visual indicators**
- **Found during:** Task 3 (human verification)
- **Issue:** Placing chips updated the totalBet counter but table cells showed no visual feedback — user couldn't see where chips were placed
- **Fix:** Added `chipsByZone` useMemo aggregation and `ChipBadge` component with absolute-positioned purple badge inside each cell
- **Files modified:** apps/frontend/src/components/RouletteTable.tsx
- **Committed in:** `451eae8`

**4. [Rule 1 - UX Bug] Removed Play Again button, unified into Spin button**
- **Found during:** Task 3 (human verification)
- **Issue:** Two separate buttons (Spin + Play Again) created a confusing UX; Play Again just reset state, no chip management opportunity
- **Fix:** Removed Play Again from ResultOverlay. ChipRack Spin button now shows "Play Again" label when `showingResult` is true. Clicking Spin in result phase calls `handlePlayAgain()` returning to betting, then next Spin starts a new round. Added `spinDisabled`/`showingResult` props to ChipRack.
- **Files modified:** apps/frontend/src/components/ResultOverlay.tsx, apps/frontend/src/components/ChipRack.tsx, apps/frontend/src/pages/RoulettePage.tsx
- **Committed in:** `451eae8`

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing critical, 1 Rule 1 UX bug)
**Impact on plan:** All fixes necessary for correctness and usability. No scope creep.

## Issues Encountered

None beyond the user-reported bugs fixed above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Roulette is fully playable end-to-end at /games/roulette
- Game phase pattern (betting/spinning/result), sound hook pattern, and chip store pattern are established for reuse in Phase 5 (Plinko, Mines, Blackjack)
- Pending balance sync pattern (apply balance after animation completes) should be reused in Phase 5 games
- No blockers for Phase 5

---
*Phase: 04-game-infrastructure-roulette*
*Completed: 2026-03-02*
