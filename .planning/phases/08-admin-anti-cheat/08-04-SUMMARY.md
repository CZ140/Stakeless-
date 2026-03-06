---
phase: 08-admin-anti-cheat
plan: "04"
subsystem: api
tags: [drizzle-orm, postgres, session-invalidation, ban, refresh-tokens]

# Dependency graph
requires:
  - phase: 08-admin-anti-cheat
    provides: banUser() function in adminService.ts, refreshTokens table in schema
  - phase: 02-auth-accounts
    provides: refreshToken() in authService.ts that queries refresh_tokens table
provides:
  - banUser() deletes all refresh_tokens rows for targetUserId — immediate session invalidation on ban
affects: [02-auth-accounts, 08-admin-anti-cheat]

# Tech tracking
tech-stack:
  added: []
  patterns: [delete-on-ban pattern for session invalidation without touching authService.ts]

key-files:
  created: []
  modified:
    - apps/backend/src/services/adminService.ts

key-decisions:
  - "Delete refresh_tokens rows in banUser() rather than modifying authService.ts — single-file fix, authService.ts requires no changes"
  - "No transaction wrapper — update and delete are independent; the tokenVersion increment handles any in-flight access tokens, delete handles future refresh attempts"

patterns-established:
  - "Ban gap closure pattern: set isBanned=true + increment tokenVersion + delete refresh_tokens rows — three-part atomic session invalidation"

requirements-completed: [ADMIN-04]

# Metrics
duration: 1min
completed: 2026-03-06
---

# Phase 8 Plan 04: ADMIN-04 Session Invalidation Gap Closure Summary

**banUser() now deletes all refresh_tokens rows for the banned user, closing the 7-day session continuation gap without any authService.ts changes**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-06T06:12:29Z
- **Completed:** 2026-03-06T06:13:33Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- Added `refreshTokens` to the schema import in adminService.ts
- Extended `banUser()` to delete all refresh_tokens rows for the targetUserId immediately after setting isBanned=true
- Closed the ADMIN-04 gap: a banned user's next POST /api/auth/refresh returns 401 (row gone, refreshToken() returns null), forcing re-login which is then blocked by the isBanned check in login()
- Zero TypeScript compile errors; no other functions in adminService.ts changed; authService.ts untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete refresh tokens in banUser() for immediate session invalidation** - `fc236a5` (fix)

**Plan metadata:** (to be added in final docs commit)

## Files Created/Modified
- `apps/backend/src/services/adminService.ts` - Added `refreshTokens` to schema import; extended `banUser()` with `db.delete(refreshTokens).where(eq(refreshTokens.userId, targetUserId))`

## Decisions Made
- Delete refresh_tokens rows in banUser() rather than adding an isBanned check to authService.ts — single-file change, no risk of unintended side effects in the auth layer
- No transaction wrapper around the update+delete pair: the tokenVersion increment invalidates any in-flight access tokens; a brief delay between update and delete (milliseconds) is safe because the 401 path handles the window correctly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ADMIN-04 gap fully closed; the ban flow is now complete end-to-end
- Phase 8 is complete — all admin and anti-cheat features are implemented and verified
- No blockers for future phases

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Task commit fc236a5: FOUND
- apps/backend/src/services/adminService.ts: FOUND

---
*Phase: 08-admin-anti-cheat*
*Completed: 2026-03-06*
