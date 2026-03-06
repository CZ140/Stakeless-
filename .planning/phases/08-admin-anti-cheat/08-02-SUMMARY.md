---
phase: 08-admin-anti-cheat
plan: "02"
subsystem: api
tags: [express, drizzle-orm, postgres, middleware, admin, role-based-access]

# Dependency graph
requires:
  - phase: 02-auth-accounts
    provides: requireAuth middleware and JWT access token verification
  - phase: 01-foundation
    provides: DB schema with users.role, isBanned, tokenVersion, gameLogs, adminLogs tables

provides:
  - requireAdmin middleware (DB-verified role check, never trusts JWT payload)
  - adminService with getDashboardStats, searchPlayer, getPlayerHistory, banUser, unbanUser, logAdminAction
  - adminRouter with 5 endpoints registered at /api/admin
  - Audit log inserted on every admin action

affects: [08-admin-anti-cheat, admin-ui-plan-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - authPassed flag pattern for chaining middleware without double-response risk
    - sql template for atomic tokenVersion increment (avoids JS read-modify-write race)
    - adminRouter.use(requireAdmin) applied once at router level (not per-route)
    - logAdminAction called after every mutating operation and stats view

key-files:
  created:
    - apps/backend/src/middleware/requireAdmin.ts
    - apps/backend/src/services/adminService.ts
    - apps/backend/src/routes/admin.ts
  modified:
    - apps/backend/src/app.ts

key-decisions:
  - "requireAdmin chains requireAuth via authPassed flag pattern — prevents double-response headers when JWT validation fails"
  - "DB role lookup on every admin request (not JWT claim) — ADMIN-01 requirement for DB-authoritative role check"
  - "banUser uses sql template for atomic tokenVersion increment — avoids JS read-modify-write race condition"
  - "adminRouter.use(requireAdmin) applied once at top — all 5 endpoints protected without per-route repetition"
  - "Self-ban guard on POST /players/:id/ban — prevents admin from locking themselves out"
  - "logAdminAction after stats view and all mutations — full audit trail per ADMIN-05"

patterns-established:
  - "authPassed flag: let authPassed = false; await requireAuth(req, res, () => { authPassed = true; }); if (!authPassed) return;"
  - "Atomic tokenVersion increment: tokenVersion: sql`${users.tokenVersion} + 1`"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 8 Plan 02: Admin Backend Summary

**DB-verified admin role middleware, full admin service layer, and five REST endpoints at /api/admin covering stats, player search, game history, ban, and unban with complete audit logging**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T04:26:46Z
- **Completed:** 2026-03-06T04:28:12Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- requireAdmin middleware that chains requireAuth then does a DB role lookup — role is never read from JWT payload (ADMIN-01)
- adminService with getDashboardStats (JOIN for mostActiveUsers usernames), searchPlayer (ilike), getPlayerHistory (last 50 desc), banUser (atomic tokenVersion increment), unbanUser, logAdminAction
- adminRouter with 5 endpoints all protected by adminRouter.use(requireAdmin) at the router level; self-ban guard on ban route; logAdminAction called after every operation
- adminRouter registered at /api/admin in app.ts after profileRouter

## Task Commits

Each task was committed atomically:

1. **Task 1: Create requireAdmin middleware and adminService** - `b474c1e` (feat)
2. **Task 2: Create admin router and register in app.ts** - `e7fe393` (feat)

## Files Created/Modified
- `apps/backend/src/middleware/requireAdmin.ts` - requireAdmin middleware chaining requireAuth + DB role check
- `apps/backend/src/services/adminService.ts` - All admin service functions: stats, search, history, ban, unban, audit log
- `apps/backend/src/routes/admin.ts` - adminRouter with all 5 /api/admin/* endpoints
- `apps/backend/src/app.ts` - Added adminRouter import and app.use('/api/admin', adminRouter)

## Decisions Made
- **authPassed flag pattern:** `let authPassed = false; await requireAuth(req, res, () => { authPassed = true; }); if (!authPassed) return;` — prevents double-response headers if requireAuth sends 401 before calling next
- **DB role check (not JWT):** After JWT verification, a separate DB query checks `users.role === 'admin'` — JWT payload role claims are not trusted (ADMIN-01)
- **Atomic tokenVersion increment:** `tokenVersion: sql\`${users.tokenVersion} + 1\`` — avoids JS read-modify-write race condition, consistent with Phase 3 pattern
- **Router-level middleware:** `adminRouter.use(requireAdmin)` applied once at top of router — simpler and guarantees every future endpoint is also protected
- **Self-ban guard:** `if (targetId === req.user!.id)` check on the ban route prevents an admin from banning themselves and losing access
- **Audit after stats:** logAdminAction called on GET /stats (read-only) — full audit trail means even data reads are logged per ADMIN-05

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Admin routes are available immediately after DB is running and an admin user has `role='admin'` set in the database.

## Next Phase Readiness
- All admin backend API endpoints are live and ready for the admin UI (Plan 03) to consume
- requireAdmin middleware enforces DB-authoritative role check on all /api/admin/* routes
- Ban action atomically increments tokenVersion so banned user's refresh token is rejected on next POST /api/auth/refresh
- logAdminAction inserts to adminLogs for all admin actions

---
*Phase: 08-admin-anti-cheat*
*Completed: 2026-03-05*
