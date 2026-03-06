---
phase: 08-admin-anti-cheat
plan: "01"
subsystem: backend-middleware
tags: [anti-cheat, rate-limiting, click-interval, zod-validation]
dependency_graph:
  requires: []
  provides: [gameLimiter, clickInterval, ANTI-01, ANTI-02, ANTI-03]
  affects: [apps/backend/src/routes/games.ts]
tech_stack:
  added: []
  patterns: [express-rate-limit, module-scoped Map for IP tracking, Zod .max() bounds]
key_files:
  created:
    - apps/backend/src/middleware/clickInterval.ts
  modified:
    - apps/backend/src/middleware/rateLimiter.ts
    - apps/backend/src/routes/games.ts
decisions:
  - gameLimiter applied before requireAuth on POST routes — rate limit checked before any DB auth query, maximizing bot rejection efficiency
  - clickInterval uses module-scoped Map with no cleanup timer — v1 in-memory is acceptable; Map grows only with unique IPs
  - MINIMUM_INTERVAL_MS exported as named constant — allows tests to import and assert the threshold value
  - GET routes (/mines/active-session, /blackjack/active-session) deliberately excluded from gameLimiter and clickInterval — polling is normal player behavior on these routes
  - .max(1_000_000) added to Zod schemas as server-side validation — frontend already enforces limits but schema is authoritative source of truth
metrics:
  duration: 1 min
  completed: 2026-03-05
  tasks: 2
  files: 3
---

# Phase 8 Plan 01: Anti-Cheat Rate Limiting and Bet Bounds Summary

Server-side anti-cheat layer: gameLimiter (30 req/min/IP), clickInterval (100ms min gap), and Zod .max(1_000_000) bounds applied to all 9 game POST routes before wallet mutation.

## What Was Built

Three anti-cheat protections hardening all game bet endpoints:

1. **ANTI-01 — gameLimiter**: `express-rate-limit` limiter allowing 30 POST requests per minute per IP. Returns 429 with `{ error: 'Too many requests. Slow down.' }` when exceeded.

2. **ANTI-03 — clickInterval**: Custom Express middleware using a module-scoped `Map<string, number>` tracking the last-seen timestamp per IP. Requests arriving within 100 ms of the previous from the same IP receive a 429 with `{ error: 'Too fast. Slow down.' }`. Uses `X-Forwarded-For` header first, falls back to `req.socket.remoteAddress`.

3. **ANTI-02 — Max bet bounds**: `.max(1_000_000)` added to all four betAmount Zod schemas (roulette `bets[].amount`, plinko `betAmount`, mines `betAmount`, blackjack `betAmount`). Returns 400 before any balance change occurs.

## Middleware Order

All 9 game POST routes now follow: `gameLimiter, clickInterval, requireAuth, async handler`.

This order ensures rate limiting and click interval checks reject bots BEFORE any database authentication queries occur.

## Routes Updated

**POST routes (gameLimiter + clickInterval applied):**
- `/roulette/bet`
- `/plinko/bet`
- `/mines/start`
- `/mines/tile`
- `/mines/cashout`
- `/blackjack/deal`
- `/blackjack/hit`
- `/blackjack/stand`
- `/blackjack/double`

**GET routes (unchanged — no rate limiting applied):**
- `/mines/active-session`
- `/blackjack/active-session`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `621eda0` | feat(08-01): add gameLimiter and clickInterval middleware |
| 2 | `8ccfde5` | feat(08-01): apply gameLimiter + clickInterval to all game POST routes, add max bet bounds |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- `apps/backend/src/middleware/rateLimiter.ts` — FOUND
- `apps/backend/src/middleware/clickInterval.ts` — FOUND
- `apps/backend/src/routes/games.ts` — FOUND

Commits exist:
- `621eda0` — FOUND
- `8ccfde5` — FOUND

TypeScript compile: PASSED (zero errors)
