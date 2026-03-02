---
phase: 02-auth-accounts
plan: "02"
subsystem: auth
tags: [jwt, bcrypt, express, drizzle-orm, refresh-tokens, middleware]

# Dependency graph
requires:
  - phase: 02-01
    provides: tokenService (signAccessToken, verifyAccessToken, generateOpaqueToken, hashToken), schema (users, refreshTokens), rateLimiter (authLimiter), express.d.ts (req.user type), authService (register, verifyEmail), authRouter (POST /register, GET /verify-email)
provides:
  - login() service function with email enumeration prevention and lastLoginAt update
  - refreshToken() service function with sliding-expiry token rotation (delete+insert)
  - getProfile() service function returning full user profile
  - requireAuth middleware (JWT Bearer verification, populates req.user.id)
  - POST /api/auth/login endpoint (returns accessToken JSON + httpOnly refresh cookie scoped to /api/auth/refresh)
  - POST /api/auth/refresh endpoint (rotates refresh token, sliding 7-day window)
  - GET /api/auth/me endpoint (protected by requireAuth, returns full profile)
affects: [03-auth-accounts, all-protected-routes, wallet, games, leaderboards]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Refresh token rotation: delete old DB row, insert new row on every refresh call
    - Cookie scoped to single path (/api/auth/refresh) to prevent unintended cookie sends
    - Email enumeration prevention: constant-time bcrypt compare even when user not found
    - requireAuth middleware pattern: Bearer extraction, JWT verify, req.user population

key-files:
  created:
    - apps/backend/src/middleware/requireAuth.ts
  modified:
    - apps/backend/src/services/authService.ts
    - apps/backend/src/routes/auth.ts

key-decisions:
  - "requireAuth middleware returns 401 for both missing token and invalid/expired token — no distinction to prevent information leakage"
  - "Refresh cookie maxAge reset on every /refresh call — sliding expiry resets the 7-day window each time"
  - "isBanned checked after password validation — prevents timing-based banned account detection"

patterns-established:
  - "requireAuth: import from '../middleware/requireAuth.js' and use as route middleware for any protected route"
  - "Error codes on thrown errors (code property) map to specific HTTP status codes in route handlers"
  - "Token rotation: always delete before insert to prevent duplicate token hash conflicts"

requirements-completed: [AUTH-02, AUTH-05]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 2 Plan 02: Login, Token Refresh, and Protected Profile Endpoint Summary

**Login endpoint with constant-time enumeration prevention, sliding refresh token rotation via DB row replacement, and requireAuth JWT middleware gating GET /me profile**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T04:40:31Z
- **Completed:** 2026-03-02T04:44:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- login() function validates credentials with bcrypt timing-attack prevention (dummy hash when user not found), checks email verification and ban status, issues JWT access token + opaque refresh token, stores token hash in DB, updates lastLoginAt
- refreshToken() rotates tokens on every call: validates hash + expiry from DB, deletes old row, inserts new row with fresh 7-day window, returns new access + refresh tokens
- getProfile() queries user profile with all required fields (balance, wagered, profit, loss, dailyBonusTimestamp, createdAt, lastLoginAt)
- requireAuth middleware extracts Bearer token, verifies JWT via jose, populates req.user.id for downstream handlers
- POST /login, POST /refresh, GET /me routes added to existing authRouter without touching Plan 01 routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add login and refresh token logic to authService.ts** - `d0c44fe` (feat)
2. **Task 2: Create requireAuth middleware, add login + refresh + me routes** - `835f42a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/backend/src/middleware/requireAuth.ts` - JWT Bearer middleware, populates req.user.id, 401 for missing/invalid/expired tokens
- `apps/backend/src/services/authService.ts` - Added login(), refreshToken(), getProfile() to existing file (register/verifyEmail untouched)
- `apps/backend/src/routes/auth.ts` - Added POST /login, POST /refresh, GET /me routes to existing authRouter

## Decisions Made
- requireAuth returns generic 401 "Unauthorized" for both missing Bearer header and failed JWT verification — no distinction to avoid leaking token presence
- Refresh cookie path scoped to `/api/auth/refresh` — browser only sends cookie to that path, preventing accidental exposure to other routes
- isBanned check placed after password validation — ensures banned user still has to provide valid credentials (prevents enumeration of banned accounts by different error response)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- requireAuth middleware ready for use by all future protected routes (wallet, games, leaderboards, admin)
- Login/refresh session lifecycle complete — frontend can implement silent token refresh
- Plan 03 (logout, password reset) can proceed in parallel — reads same schema, same tokenService, different files
- Migration still pending from Plan 01 (Docker Desktop needed): `docker compose up -d && pnpm --filter backend db:migrate`

---
*Phase: 02-auth-accounts*
*Completed: 2026-03-01*
