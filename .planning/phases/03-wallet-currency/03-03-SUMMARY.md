---
phase: 03-wallet-currency
plan: "03"
subsystem: wallet-game-pipeline
tags: [wallet, bet, game-logs, rng, middleware, shared-types]
dependency_graph:
  requires: [03-01]
  provides: [POST /api/wallet/bet, validateBet middleware, BetRequest/BetResponse types]
  affects: [Phase 4 game engines, Phase 5 games]
tech_stack:
  added: [node:crypto randomInt]
  patterns: [deduct-then-settle, validateBet middleware, shared type exports]
key_files:
  created:
    - apps/backend/src/middleware/validateBet.ts
  modified:
    - apps/backend/src/routes/wallet.ts
    - packages/shared/src/index.ts
decisions:
  - "crypto.randomInt(0,2) used for coin-flip — never Math.random() in game resolution code (GINF-02)"
  - "validateBet rejects bets < 1 coin before any DB operation, satisfying GINF-05"
  - "deductBet and settleBet remain two separate transactions — stateful Phase 4/5 games need them separate"
  - "Math.random() in authService.ts username suffix generation is NOT game resolution code — GINF-02 compliant"
metrics:
  duration: "1 min"
  completed_date: "2026-03-02"
  tasks_completed: 2
  files_changed: 3
---

# Phase 3 Plan 03: Bet Pipeline (validateBet + POST /bet + BetRequest/BetResponse) Summary

**One-liner:** Atomic coin-flip endpoint with crypto.randomInt, validateBet Zod middleware, and BetRequest/BetResponse shared types completing the GINF-01..05 pipeline.

## What Was Built

### validateBet Middleware (GINF-05)
`apps/backend/src/middleware/validateBet.ts` — Zod-based Express middleware that validates `betAmount` is an integer >= 1 and `gameType` is a non-empty string (defaults to `'coin_flip'`). Rejects invalid bets with a 400 before any balance operation, satisfying GINF-05.

### POST /api/wallet/bet Endpoint (GINF-01..04)
Added to `apps/backend/src/routes/wallet.ts` — the complete bet pipeline for coin-flip:

1. `requireAuth` — ensures authenticated user
2. `validateBet` — rejects bet < 1 coin with 400 before any DB touch (GINF-05)
3. `deductBet(userId, betAmount, gameType)` — atomically deducts from balance; throws `INSUFFICIENT_FUNDS` → 402 (GINF-01)
4. `randomInt(0, 2)` — cryptographically secure coin flip (GINF-02)
5. `settleBet(userId, profit, betAmount, outcome, gameType)` — credits winnings + inserts `game_logs` row in one transaction (GINF-03, GINF-04)
6. Returns `{ outcome, profit, newBalance }`

### Shared Types (Phase 4+ readiness)
Added `BetRequest` and `BetResponse` interfaces to `packages/shared/src/index.ts` — ready for frontend game pages in Phase 4 to import.

## Decisions Made

1. **crypto.randomInt exclusively** — `randomInt(0, 2)` used for game outcome. `Math.random()` only appears in `authService.ts` for username suffix generation (not game resolution) — GINF-02 compliant.
2. **validateBet as standalone middleware** — Follows the existing `validate.ts` pattern but is purpose-built for bet params with a single first-error response (simpler than multi-field validation errors).
3. **Separate deductBet/settleBet transactions preserved** — Phase 4/5 stateful games (Mines, Blackjack) need deduct before game start and settle after outcome. Merging was explicitly rejected.
4. **402 for INSUFFICIENT_FUNDS** — Distinguishes payment-required errors from validation errors (400), giving clients a clear signal.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter backend exec tsc --noEmit` | PASSED (0 errors) |
| `randomInt` in wallet.ts | FOUND (import + usage) |
| `Math.random` in game resolution code | NONE (authService.ts usage is auth-only) |
| `validateBet` on /bet route | FOUND |
| `deductBet` AND `settleBet` in wallet.ts | BOTH FOUND |
| `BetRequest` + `BetResponse` in shared/index.ts | BOTH FOUND |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 87d4277 | validateBet middleware + BetRequest/BetResponse shared types |
| Task 2 | e5b8ae2 | POST /api/wallet/bet coin-flip endpoint with deduct/settle pipeline |

## Self-Check: PASSED

- validateBet.ts: FOUND
- wallet.ts: FOUND
- shared/index.ts: FOUND
- 03-03-SUMMARY.md: FOUND
- Commit 87d4277: FOUND
- Commit e5b8ae2: FOUND
