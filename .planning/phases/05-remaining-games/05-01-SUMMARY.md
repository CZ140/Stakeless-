---
phase: 05-remaining-games
plan: 01
subsystem: plinko
tags: [game, plinko, backend, frontend, tdd, svg-animation]
dependency_graph:
  requires: [04-game-infrastructure]
  provides: [plinko-backend, plinko-frontend]
  affects: [dashboard, app-router]
tech_stack:
  added: []
  patterns: [zustand-v5, svg-animation, galton-board-path]
key_files:
  created:
    - apps/backend/src/services/plinkoService.ts
    - apps/backend/src/services/plinkoService.test.ts
    - apps/frontend/src/stores/plinkoStore.ts
    - apps/frontend/src/pages/PlinkoPage.tsx
  modified:
    - apps/backend/src/routes/games.ts
    - apps/frontend/src/App.tsx
    - apps/frontend/src/pages/DashboardPage.tsx
decisions:
  - Bucket path pre-computed client-side using Fisher-Yates-shuffled L/R decisions constrained to land at server bucket
  - Frontend multiplier table mirrors backend — kept in sync manually (no shared package needed for v1.0)
  - PlinkoHowToPlay built inline in PlinkoPage (HowToPlayModal is roulette-specific)
  - Ball animation uses setTimeout chain at ~80ms/row, cancels on unmount via useRef
  - Result shown as inline banner below board, not full-screen overlay (Plinko UX is cleaner this way)
metrics:
  duration: 6 min
  completed_date: "2026-03-03"
  tasks_completed: 3
  files_changed: 7
---

# Phase 5 Plan 01: Plinko Game (Backend + Frontend) Summary

**One-liner:** Complete Plinko game with backend multiplier tables (4 risk levels × 9 row counts), `resolvePlinko` service, `POST /api/games/plinko/bet` endpoint, Zustand v5 store, SVG peg board with deterministic ball animation, and full bet controls panel.

## What Was Built

### Backend (Task 1, TDD)

**`plinkoService.ts`** exports:
- `PLINKO_MULTIPLIERS`: nested `Record<RiskLevel, Record<number, number[]>>` covering all 4 risk levels (`low`, `medium`, `high`, `expert`) × rows 8–16 × symmetric (rows+1) bucket arrays. Reference values from Stake.com for 8-row and 16-row extremes; interpolated for middle rows.
- `resolvePlinko(rows, riskLevel, bucketIndex)`: returns multiplier or `0` for invalid inputs.

**16 tests pass** covering: table structure, all bucket counts, reference values, all combinations of rows/risk/bucket, and invalid input fallback.

**`POST /api/games/plinko/bet`** appended to `games.ts`:
- Validates `{ betAmount, rows, riskLevel }` via Zod schema
- Pipeline: `deductBet` → `crypto.randomInt(0, rows+1)` → `resolvePlinko` → `settleBet`
- Returns `{ bucket, multiplier, profit, newBalance }`
- Error handling: 402 INSUFFICIENT_FUNDS, 400 BET_TOO_SMALL, 500 unexpected

### Frontend (Tasks 2 & 3)

**`plinkoStore.ts`**: Zustand v5 double-parens store with `betAmount`, `rows`, `riskLevel`, `gamePhase`, `isMuted`, `lastResult` and all actions. Persists `lastBet_plinko` and `isMuted_plinko` to `localStorage`.

**`PlinkoPage.tsx`**:
- SVG peg board: dynamically redraws as `rows` slider moves; pegs in triangle layout; buckets labeled with multipliers color-coded by payout tier; winning bucket highlighted in accent purple on result
- Ball animation: pre-computes path with Fisher-Yates-shuffled L/R decisions (exactly `targetBucket` R's) → deterministically arrives at server-determined bucket, ~80ms per row
- Controls panel: bet input with +/-, chip quick-select (10/50/100/500/Max), Half/Double buttons, row slider, risk level 4-button grid, Drop Ball button
- Result banner inline below board: shows multiplier, net profit/loss, Play Again button
- Mute/unmute toggle in header area
- Inline `PlinkoHowToPlay` modal (Framer Motion) explaining risk levels, row count, and server-side outcome

**App.tsx**: `/games/plinko` protected route added.

**DashboardPage.tsx**: Plinko `available` flipped from `false` to `true`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incorrect bucket counts in multiplier arrays**
- **Found during:** Task 1 TDD GREEN phase
- **Issue:** Several rows had wrong element counts (e.g., `expert[11]` had 11 elements, needs 12; `medium[15]` had 15 elements, needs 16)
- **Fix:** Counted and corrected all entries systematically; added center elements to symmetric arrays that were missing them
- **Files modified:** `apps/backend/src/services/plinkoService.ts`
- **Commit:** b6c4165 (included in final version)

**2. [Rule 1 - Bug] TypeScript errors in test file for `Record<number, number[]>` lookup**
- **Found during:** Task 1 TypeScript check
- **Issue:** `buckets.length` and iteration over `buckets` flagged as possibly undefined by tsc
- **Fix:** Added non-null assertion (`!`) and nullish coalescing (`?? []`) to test assertions
- **Files modified:** `apps/backend/src/services/plinkoService.test.ts`
- **Commit:** b6c4165

### Pre-existing deviations (observed, not caused by this plan)

**`games.ts` already contained Mines and Blackjack routes** — the file was more complete than the plan's read implied (it was read at the start as roulette-only, but linter/formatter had already expanded it). The plinko route was appended correctly without touching existing routes.

## Self-Check: PASSED

All created files verified on disk. All task commits verified in git log:
- `b6c4165` feat(05-01): add plinko backend service and POST /api/games/plinko/bet
- `e1ef1a2` feat(05-01): add plinkoStore and PlinkoPage UI
- `8e78691` feat(05-01): wire Plinko into App router and enable Dashboard card
