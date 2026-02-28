# Phase 2: Auth & Accounts - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Secure account creation (email + password), email verification, login with persistent JWT sessions, logout, password recovery via email, and a read-only profile API exposing the user's own data. Display names, profile editing, and daily bonus mechanics are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Registration flow
- Email + password only at signup — no username or display name required
- Email verification required: account is inactive until the verification email is clicked
- Password minimum: 8 characters, any characters (no complexity rules)
- Validation errors: inline per-field, shown on submit (not real-time)

### Session behavior
- Access token: in-memory only (never stored in localStorage or cookies)
- Refresh token: httpOnly cookie, 7-day sliding expiry (window resets on each use)
- On access token expiry: silent background refresh using the refresh cookie — user never sees it
- Logout: invalidates current device's refresh token only (other devices stay logged in)
- On refresh token expiry: redirect to login with "Your session expired — please log in again"

### Password reset UX
- Reset link valid for 24 hours
- Single-use: link is invalidated immediately after password is reset
- New reset request invalidates any existing active reset token for that user
- After successful reset: auto-login the user and redirect to home

### Account data & balance initialization
- New user starting balance: 0 (no signup bonus)
- `daily_bonus_timestamp` field: stores last time the daily bonus was claimed (null on signup); bonus logic lives in a future phase
- Profile API (GET /me or /profile): returns the authenticated user's own data only — no cross-user reads
- Profile API is read-only in this phase; updating email/password is a later phase

### Claude's Discretion
- Email service/provider choice (SMTP library, transactional email setup)
- Token storage format in the database (hash vs plaintext refresh token — Claude should hash it)
- Exact error messages for auth failures (balance security: don't reveal whether email exists)
- Rate limiting on auth endpoints
- Verification email template design

</decisions>

<specifics>
## Specific Ideas

- The roadmap specifies: 15-min access token + 7-day refresh cookie (JWT, httpOnly) — this is a hard requirement
- Sliding refresh: as long as user is active within any 7-day window, they stay logged in indefinitely
- The user record must store: `balance`, `total_wagered`, `total_profit`, `total_loss`, `daily_bonus_timestamp`, `account_creation_date`, `last_login_date` — all readable via profile API

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-auth-accounts*
*Context gathered: 2026-02-27*
