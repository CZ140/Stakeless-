# Phase 2: Auth & Accounts - Research

**Researched:** 2026-02-27
**Domain:** JWT authentication — bcrypt hashing, refresh token rotation, email verification, session persistence, React in-memory token management
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Registration flow:**
- Email + password only at signup — no username or display name required
- Email verification required: account is inactive until the verification email is clicked
- Password minimum: 8 characters, any characters (no complexity rules)
- Validation errors: inline per-field, shown on submit (not real-time)

**Session behavior:**
- Access token: in-memory only (never stored in localStorage or cookies)
- Refresh token: httpOnly cookie, 7-day sliding expiry (window resets on each use)
- On access token expiry: silent background refresh using the refresh cookie — user never sees it
- Logout: invalidates current device's refresh token only (other devices stay logged in)
- On refresh token expiry: redirect to login with "Your session expired — please log in again"

**Password reset UX:**
- Reset link valid for 24 hours
- Single-use: link is invalidated immediately after password is reset
- New reset request invalidates any existing active reset token for that user
- After successful reset: auto-login the user and redirect to home

**Account data & balance initialization:**
- New user starting balance: 0 (no signup bonus)
- `daily_bonus_timestamp` field: stores last time the daily bonus was claimed (null on signup); bonus logic lives in a future phase
- Profile API (GET /me or /profile): returns the authenticated user's own data only — no cross-user reads
- Profile API is read-only in this phase; updating email/password is a later phase

**Specifics from roadmap:**
- 15-min access token + 7-day refresh cookie (JWT, httpOnly) — hard requirement
- Sliding refresh: as long as user is active within any 7-day window, they stay logged in indefinitely
- User record must store: `balance`, `total_wagered`, `total_profit`, `total_loss`, `daily_bonus_timestamp`, `account_creation_date`, `last_login_date` — all readable via profile API

### Claude's Discretion

- Email service/provider choice (SMTP library, transactional email setup)
- Token storage format in the database (hash vs plaintext refresh token — Claude should hash it)
- Exact error messages for auth failures (balance security: don't reveal whether email exists)
- Rate limiting on auth endpoints
- Verification email template design

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can register an account with email and password | bcrypt hashing, email verification flow, Drizzle migration for new tables, Zod validation middleware |
| AUTH-02 | User can log in and maintain persistent session across browser refreshes (JWT) | `jose` SignJWT (HS256), httpOnly refresh cookie with `cookie-parser`, 15-min access token + 7-day sliding refresh, Axios response interceptor for silent refresh |
| AUTH-03 | User can log out from any page | DELETE refresh token row from DB, `res.clearCookie()`, frontend clears in-memory token |
| AUTH-04 | User can reset password via email link | `crypto.randomBytes(32)` token, SHA-256 stored hash, 24-hour expiry, single-use invalidation, Nodemailer SMTP send, auto-login after reset |
| AUTH-05 | User profile stores balance, total wagered, total profit, total loss, daily bonus timestamp, account creation date, last login date — readable via profile API | `GET /api/auth/me` behind `requireAuth` middleware, returns Drizzle query result for authenticated user only |
</phase_requirements>

---

## Summary

Phase 2 implements a complete, production-correct JWT authentication system on top of the Phase 1 Express/Drizzle/PostgreSQL foundation. The architecture is: short-lived access tokens (15 min, HS256 JWT) stored only in React memory, plus long-lived refresh tokens (7 days, sliding) stored in httpOnly Secure SameSite=Strict cookies. The refresh token hash is persisted in a new `refresh_tokens` table in Postgres. Password hashing uses bcryptjs at 12 rounds. Email flows (verification, password reset) use opaque tokens stored as SHA-256 hashes in new `email_verification_tokens` and `password_reset_tokens` tables, and are sent via Nodemailer.

The stack is proven and well-understood. The two places requiring the most precision are: (1) the silent refresh pattern on the frontend — Axios response interceptors must queue concurrent 401 requests so only one refresh call fires at a time, and (2) correct cookie flags — the refresh token cookie must be `httpOnly`, `secure` (production), `sameSite: 'strict'`, and scoped to the path `/api/auth/refresh` to prevent it from being sent to unintended routes.

An important discovery: the project already uses `type: "module"` (ESM) in both `apps/backend/package.json` and `apps/frontend`. The `jsonwebtoken` library has known ESM compatibility issues. The `jose` library (v6.1.3) is the correct choice — it is pure ESM, has no dependencies, and provides the same signing/verification API with full TypeScript types.

**Primary recommendation:** Use `jose` (not `jsonwebtoken`), `bcryptjs` (no native compilation), `cookie-parser`, `express-rate-limit`, and `nodemailer` with Mailtrap for dev and a configurable SMTP_* env block for production. Use the existing `users` schema and add two new tables (`refresh_tokens`, `email_verification_tokens`) plus one column (`is_email_verified`) via a new Drizzle migration.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jose | ^6.1.3 | JWT sign/verify (HS256) | Pure ESM, no dependencies, full TypeScript, works in Node.js ESM project; `jsonwebtoken` is CJS-only and breaks in ESM projects |
| bcryptjs | ^2.4.3 | Password hashing | Pure JavaScript — no node-gyp native compilation; same API as bcrypt; works on all platforms; the STATE.md blocker about bcrypt native compilation is resolved by using bcryptjs instead |
| cookie-parser | ^1.4.7 | Parse httpOnly cookies in Express | Express ecosystem standard; parses `req.cookies` for the refresh token |
| express-rate-limit | ^7.x | Rate limiting for auth endpoints | Official Express ecosystem package; zero config; `skipSuccessfulRequests: true` for login |
| nodemailer | ^6.9.x | Send verification and reset emails | Most widely used Node.js email library; SMTP-agnostic; works with Mailtrap in dev, any SMTP in prod |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | ^1.x | HTTP client with interceptors | Frontend — interceptor pattern for silent refresh is the cleanest approach in React 19; add to frontend package |
| @types/bcryptjs | ^2.4.x | TypeScript types for bcryptjs | Always — bcryptjs ships without bundled types |
| @types/cookie-parser | ^1.4.x | TypeScript types for cookie-parser | Always |
| @types/nodemailer | included in nodemailer | Types ship with nodemailer v6+ | No separate install needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jose | jsonwebtoken | jsonwebtoken is CJS-only and does not work in ESM `type: "module"` packages without workarounds — this project uses ESM throughout |
| bcryptjs | bcrypt (native) | bcrypt is faster but requires node-gyp compilation; STATE.md calls this out as a risk. bcryptjs avoids the blocker with negligible performance difference at 12 rounds for an auth-only endpoint |
| nodemailer | Resend SDK | Resend requires an API key and paid account; nodemailer works with any SMTP including free Mailtrap dev accounts with no signup friction |
| axios | native fetch | fetch has no built-in interceptor mechanism; axios response interceptors cleanly handle the 401 → refresh → retry loop |
| express-rate-limit | custom middleware | Hand-rolling rate limiting misses edge cases (distributed memory, proper headers, sliding windows) |

**Installation (backend):**
```bash
pnpm --filter backend add jose bcryptjs cookie-parser express-rate-limit nodemailer
pnpm --filter backend add -D @types/bcryptjs @types/cookie-parser
```

**Installation (frontend):**
```bash
pnpm --filter frontend add axios
```

---

## Architecture Patterns

### New Tables Required (Drizzle Migration)

The existing Phase 1 migration created `users` with `token_version` and `is_banned` already added proactively. Phase 2 needs one new column on `users` and two entirely new tables.

**New column on `users`:**
- `is_email_verified: boolean` — NOT NULL DEFAULT false

**New table: `refresh_tokens`**
- `id: serial PK`
- `user_id: integer FK → users.id`
- `token_hash: varchar(64)` — SHA-256 hex of the raw token (64 chars)
- `expires_at: timestamp NOT NULL`
- `created_at: timestamp NOT NULL DEFAULT now()`

**New table: `email_verification_tokens`**
- `id: serial PK`
- `user_id: integer FK → users.id`
- `token_hash: varchar(64)` — SHA-256 hex
- `type: varchar(20)` — 'verify_email' or 'password_reset'
- `expires_at: timestamp NOT NULL`
- `used_at: timestamp` — null until consumed (single-use enforcement)
- `created_at: timestamp NOT NULL DEFAULT now()`

Using a single `email_verification_tokens` table for both email verification and password reset tokens reduces schema sprawl and the `type` column distinguishes them. When a new password reset is requested, DELETE all existing rows WHERE user_id = ? AND type = 'password_reset' before inserting a new one.

### Recommended File Structure

```
apps/backend/src/
├── db/
│   ├── schema.ts            # Add is_email_verified column + new tables
│   ├── migrations/          # New migration generated by drizzle-kit generate
│   └── index.ts             # Existing DB connection
├── routes/
│   ├── health.ts            # Existing
│   └── auth.ts              # New: all /api/auth/* endpoints
├── middleware/
│   └── requireAuth.ts       # New: JWT verification middleware
├── services/
│   ├── tokenService.ts      # New: sign/verify access tokens, issue/rotate refresh tokens
│   ├── emailService.ts      # New: nodemailer transporter + send helpers
│   └── authService.ts       # New: register, login, logout, reset password business logic
└── env.ts                   # Extend with JWT_SECRET, SMTP_* vars

apps/frontend/src/
├── contexts/
│   └── AuthContext.tsx       # New: in-memory access token, useAuth hook
├── api/
│   └── client.ts             # New: axios instance with interceptors
└── pages/
    ├── LoginPage.tsx          # New
    ├── RegisterPage.tsx       # New
    ├── ForgotPasswordPage.tsx # New
    └── ResetPasswordPage.tsx  # New
```

### Pattern 1: jose JWT Sign and Verify (HS256)

```typescript
// Source: github.com/panva/jose — SignJWT API
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(env.JWT_SECRET);

// Sign access token — 15 minutes
export async function signAccessToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
}

// Verify access token
export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload; // { sub: userId, iat, exp }
}
```

### Pattern 2: Refresh Token — Issue, Store (Hashed), Rotate

```typescript
// Source: SHA-256 hashing pattern from jwt security research
import { createHash, randomBytes } from 'node:crypto';

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// On login/refresh — issue raw token to cookie, store hash in DB
const rawToken = generateOpaqueToken();
const tokenHash = hashToken(rawToken);
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });

// Set cookie (Express)
res.cookie('refreshToken', rawToken, {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth/refresh',   // limits cookie scope to this endpoint only
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms — sliding: reset on each use
});
```

**Sliding expiry implementation:** On every POST /api/auth/refresh, DELETE the old `refresh_tokens` row and INSERT a new one with a fresh `expiresAt`. Set `res.cookie()` again with a new `maxAge`. This is the sliding window.

### Pattern 3: requireAuth Middleware

```typescript
// apps/backend/src/middleware/requireAuth.ts
import { jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, secret);
    req.user = { id: Number(payload.sub) };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
```

Express Request type extension needed in `apps/backend/src/types/express.d.ts`:
```typescript
declare global {
  namespace Express {
    interface Request {
      user?: { id: number };
    }
  }
}
```

### Pattern 4: Frontend — Axios with Silent Refresh Interceptor

```typescript
// apps/frontend/src/api/client.ts
import axios from 'axios';

let accessToken: string | null = null;

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

export const apiClient = axios.create({ baseURL: '/api', withCredentials: true });

// Attach Bearer token to every request
apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// On 401: try to refresh, then retry original request ONCE
let refreshingPromise: Promise<string | null> | null = null;

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      if (!refreshingPromise) {
        refreshingPromise = axios
          .post<{ accessToken: string }>('/api/auth/refresh', {}, { withCredentials: true })
          .then((r) => { accessToken = r.data.accessToken; return accessToken; })
          .catch(() => { accessToken = null; return null; })
          .finally(() => { refreshingPromise = null; });
      }
      const newToken = await refreshingPromise;
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);
```

**Key:** The `refreshingPromise` singleton prevents N concurrent 401 responses from each triggering their own refresh call. All queue behind the single in-flight refresh.

### Pattern 5: Email Token — Generate, Hash, Store, Verify

```typescript
// Both email verification and password reset use the same pattern
import { randomBytes, createHash } from 'node:crypto';

const rawToken = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(rawToken).digest('hex');
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

// Store hash — raw token goes in the email link
await db.insert(emailVerificationTokens).values({
  userId,
  tokenHash,
  type: 'verify_email', // or 'password_reset'
  expiresAt,
});

// Verification URL format
const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`;

// On click: hash incoming token, query DB, check expiry, check used_at is null
const incoming = createHash('sha256').update(req.query.token as string).digest('hex');
const record = await db.query.emailVerificationTokens.findFirst({
  where: (t, { eq, isNull }) =>
    eq(t.tokenHash, incoming) && eq(t.type, 'verify_email') && isNull(t.usedAt),
});
if (!record || record.expiresAt < new Date()) {
  return res.status(400).json({ error: 'Invalid or expired link' });
}
// Mark used — do not delete, so replayed links return "already used"
await db.update(emailVerificationTokens)
  .set({ usedAt: new Date() })
  .where(eq(emailVerificationTokens.id, record.id));
```

### Pattern 6: bcryptjs Password Hash

```typescript
import bcrypt from 'bcryptjs';

// Register
const passwordHash = await bcrypt.hash(plainPassword, 12); // 12 rounds ≈ 250-300ms

// Login
const isValid = await bcrypt.compare(plainPassword, user.passwordHash);
```

### Pattern 7: Rate Limiting Auth Endpoints

```typescript
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // max 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed attempts
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

// Apply per-route in auth router
router.post('/login', authLimiter, loginHandler);
router.post('/register', authLimiter, registerHandler);
router.post('/forgot-password', authLimiter, forgotPasswordHandler);
```

### Pattern 8: Nodemailer Setup

```typescript
// apps/backend/src/services/emailService.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,       // 587 for STARTTLS, 465 for SSL
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  await transporter.sendMail({
    from: `"Casino App" <${env.SMTP_FROM}>`,
    to,
    subject: 'Verify your email address',
    text: `Click this link to verify your email: ${verifyUrl}\n\nExpires in 24 hours.`,
    html: `<p>Click <a href="${verifyUrl}">here</a> to verify your email.</p><p>Expires in 24 hours.</p>`,
  });
}
```

**Dev setup:** Use Mailtrap (free, no real email sent). Set `SMTP_HOST=sandbox.smtp.mailtrap.io`, `SMTP_PORT=587`, `SMTP_USER`/`SMTP_PASS` from Mailtrap dashboard.

### Pattern 9: API Endpoint Map

```
POST /api/auth/register          — create account, send verification email
GET  /api/auth/verify-email      — ?token=<raw> — activate account
POST /api/auth/login             — validate credentials, issue tokens
POST /api/auth/refresh           — consume refresh cookie, rotate tokens
POST /api/auth/logout            — delete refresh token row, clear cookie
POST /api/auth/forgot-password   — send reset email
POST /api/auth/reset-password    — ?token=<raw> — set new password, auto-login
GET  /api/auth/me                — [requireAuth] return profile data
```

### Anti-Patterns to Avoid

- **Never store the raw refresh token in the DB.** If the DB leaks, attackers can impersonate any user. Store SHA-256 hash only.
- **Never store access tokens in localStorage or sessionStorage.** XSS can steal them. In-memory only.
- **Never reveal whether an email exists on login.** Always return `"Invalid credentials"` regardless of whether the email was found or the password was wrong (AUTH-04: same for forgot-password — always return "If this email exists, you'll receive a link").
- **Never skip `used_at` tracking for email tokens.** If you delete on use, a network race could allow two simultaneous clicks to both succeed. Mark `used_at` then reject if not null.
- **Never set `sameSite: 'none'` without thinking.** `sameSite: 'strict'` is correct here — frontend and backend are on same origin (proxied via Vite in dev, same domain in prod).
- **Never sign with a weak JWT secret.** JWT_SECRET must be at least 256 bits (32 bytes) — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom MD5/SHA hash of password | bcryptjs | bcrypt is specifically designed to be slow and resist GPU cracking; SHA-256 of a password is broken in minutes |
| JWT generation | Manual base64url encoding | jose SignJWT | Signing edge cases (padding, encoding, claim validation) are subtle and easy to get wrong |
| Rate limiting | In-process counter with setTimeout | express-rate-limit | Memory leak risk, restarts reset counters, no distributed support |
| Random tokens | Math.random() | crypto.randomBytes() | Math.random() is predictable; only CSPRNG is acceptable for security tokens |
| Email sending | Raw TCP SMTP | nodemailer | STARTTLS negotiation, MIME encoding, attachment handling, connection pooling — all complex |
| Cookie parsing | req.headers.cookie.split(';') | cookie-parser | Handles signed cookies, URL decoding, edge cases in cookie names |

**Key insight:** Auth is the domain where "good enough" implementations fail. Every hand-rolled component introduces subtle vulnerabilities that are exploited in practice. Use purpose-built libraries for every security-critical operation.

---

## Common Pitfalls

### Pitfall 1: jsonwebtoken in an ESM Project

**What goes wrong:** `import jwt from 'jsonwebtoken'` throws `ERR_REQUIRE_ESM` or similar import errors because jsonwebtoken is CJS-only and the backend is `"type": "module"`.

**Why it happens:** The project's `apps/backend/package.json` has `"type": "module"`, meaning `.js` files are treated as ESM. jsonwebtoken does not export ESM-compatible modules.

**How to avoid:** Use `jose` exclusively. The STATE.md blocker about bcrypt native compilation is the same category of risk — use bcryptjs (pure JS) and jose (pure ESM) to avoid all compilation and ESM compatibility issues.

**Warning signs:** GitHub issue #785 on node-jsonwebtoken is open and unresolved as of 2026.

### Pitfall 2: Refresh Cookie Not Sent on Same Origin

**What goes wrong:** The browser sends the httpOnly cookie on `/api/auth/refresh` fine in development, but CORS blocks it when the Axios request has `withCredentials: true`.

**Why it happens:** The Express CORS config in Phase 1 (`app.ts`) already has `credentials: true` and allows `http://localhost:5173`. This is correct. The new auth routes inherit it. But the Axios `apiClient` must also set `withCredentials: true` at the instance level.

**How to avoid:** Set `withCredentials: true` on the axios instance (not just on individual requests). Verify with browser DevTools that the `Set-Cookie` response header is present and the cookie appears in DevTools → Application → Cookies.

**Warning signs:** `POST /api/auth/refresh` returns 401 even when the user was previously logged in.

### Pitfall 3: Multiple Concurrent 401 Responses Triggering Parallel Refreshes

**What goes wrong:** A page makes 3 API calls simultaneously. All 3 return 401 (expired token). All 3 interceptors trigger refresh independently. The first one rotates the token — now the other two try to refresh with a deleted (already-rotated) token hash and get 401 from the refresh endpoint. User is logged out unexpectedly.

**Why it happens:** Without a queuing mechanism, each in-flight request independently handles its own 401.

**How to avoid:** Use the `refreshingPromise` singleton pattern shown in Pattern 4. All 401 responses after the first queue behind the single refresh call.

**Warning signs:** Intermittent unexpected logouts during page load when multiple API calls fire simultaneously.

### Pitfall 4: Sliding Expiry Not Actually Sliding

**What goes wrong:** Cookie's `maxAge` is set once on login. After 7 days the cookie expires even though the user was active every day.

**Why it happens:** The `maxAge` on a cookie is the duration from when it was SET, not from last use. You must re-issue the cookie on every refresh call.

**How to avoid:** In `POST /api/auth/refresh`: (1) delete old DB row, (2) insert new row with fresh `expiresAt = now + 7 days`, (3) call `res.cookie(...)` again with the same `maxAge`. The browser replaces the old cookie.

**Warning signs:** Users complaining they get logged out every 7 days even when actively using the site.

### Pitfall 5: Using `token_version` Without a Strategy

**What goes wrong:** The Phase 1 schema proactively added `token_version` to the users table (for global revocation of all tokens — e.g., password change). Phase 2 uses per-device refresh token rows in `refresh_tokens` for normal logout. `token_version` is NOT needed for Phase 2 logout — it's reserved for Phase 8 admin ban and future "log out all devices" feature.

**Why it happens:** Confusion between two revocation strategies: (a) per-device via refresh_tokens table, (b) global via token_version in JWT payload.

**How to avoid:** For Phase 2, do NOT embed `tokenVersion` in the access token JWT. Keep `token_version` in the schema but leave the JWT validation middleware free of version checks — that's a Phase 8 concern (admin ban). Document this clearly in code comments.

### Pitfall 6: Sending Plaintext Reset Tokens in Emails (Already Mitigated)

**What goes wrong:** If the reset email is intercepted or email provider is breached, the raw token in the email can be replayed.

**Why it happens:** Lazy implementation stores the same string sent in the email.

**How to avoid:** Store SHA-256(token) in DB. Send raw token in email. On POST /reset-password, hash the incoming token and compare to stored hash. Raw token is never persisted.

### Pitfall 7: Cookie `path` Scope Too Broad

**What goes wrong:** Setting the refresh cookie at `path: '/'` means it gets sent with every single API request (game bets, profile loads, etc.). This increases attack surface — any compromised backend route leaks the cookie.

**Why it happens:** Omitting `path` defaults to the root.

**How to avoid:** Set `path: '/api/auth/refresh'` so the browser only sends the cookie to the refresh endpoint. This is the narrowest scope needed.

---

## Code Examples

### New Environment Variables

Extend `apps/backend/src/env.ts` to validate:

```typescript
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().min(1024).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().email(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});
```

Add to `.env.example`:
```
NODE_ENV=development
JWT_SECRET=generate-with-node-crypto-randomBytes-32-toHex
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your-mailtrap-user
SMTP_PASS=your-mailtrap-pass
SMTP_FROM=noreply@casino.local
FRONTEND_URL=http://localhost:5173
```

### Drizzle Schema Additions (schema.ts)

```typescript
// Add to users table: is_email_verified
isEmailVerified: boolean('is_email_verified').notNull().default(false),

// New table: refresh_tokens
export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// New table: email_verification_tokens (covers both verify_email and password_reset)
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  type: varchar('type', { length: 20 }).notNull(), // 'verify_email' | 'password_reset'
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

After editing schema, run:
```bash
pnpm --filter backend db:generate   # creates new migration file
pnpm --filter backend db:migrate    # applies it to DB
```

### Zod Validation Middleware (reusable)

```typescript
// apps/backend/src/middleware/validate.ts
import type { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data; // replace with parsed/coerced data
    next();
  };
}

// Usage:
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
router.post('/register', authLimiter, validate(registerSchema), registerHandler);
```

### Profile API Response Shape

```typescript
// GET /api/auth/me — authenticated user's own data
{
  id: number,
  email: string,
  balance: number,          // bigint stored as number per Phase 1 decision
  totalWagered: number,
  totalProfit: number,
  totalLoss: number,
  dailyBonusTimestamp: string | null,  // ISO datetime
  createdAt: string,                   // maps to account_creation_date
  lastLoginAt: string | null,          // update on every successful login
}
```

The `lastLoginAt` field must be updated on every successful `POST /api/auth/login`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jsonwebtoken (CJS) | jose (ESM) | jose v5+ (2023), now v6 | ESM projects must use jose; jsonwebtoken breaks |
| bcrypt (native) | bcryptjs (pure JS) | N/A — parallel options | Eliminates node-gyp compilation risk in CI/CD and cross-platform dev |
| Store raw refresh token in DB | Store SHA-256 hash | Industry best practice since ~2020 | DB breach doesn't compromise sessions |
| Separate tables for email/reset tokens | Single table with `type` column | Common DRY refactor | Reduces migration sprawl; same code path |
| localStorage for JWT | In-memory (React state) | ~2019 OWASP guidance | Eliminates XSS token theft; httpOnly cookie for refresh |
| 10 bcrypt rounds | 12 rounds (2025 standard) | PHP 8.4 default bump, 2024 | ~0.25s per hash on modern hardware — still acceptable |

**Deprecated/outdated:**
- `passport.js`: Useful for OAuth flows but unnecessary overhead for simple email+password JWT auth. Don't add it.
- `express-jwt` middleware package: Superseded by writing a small `requireAuth.ts` middleware using `jose.jwtVerify` directly — fewer dependencies, full control.
- `crypto.createHmac` for token signing: Use `jose.SignJWT` instead; handles all JWT spec compliance automatically.

---

## Open Questions

1. **SMTP Provider for Production**
   - What we know: Claude has discretion; Nodemailer works with any SMTP
   - What's unclear: The user hasn't specified a production email provider (SendGrid, Postmark, Mailgun, AWS SES, etc.)
   - Recommendation: Use Mailtrap in dev (zero config, no real email sent). Document `SMTP_*` env vars clearly so the user can plug in their provider of choice before going live. Do not hard-code any provider SDK.

2. **Frontend routing library**
   - What we know: React 19 is installed; no router is installed (Phase 1 only added the React scaffold)
   - What's unclear: React Router vs TanStack Router preference
   - Recommendation: Add `react-router-dom v7` in this phase — it is needed to implement `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` pages and protected route wrappers. This is a Claude's Discretion area. React Router v7 is the standard choice.

3. **`username` column on users table**
   - What we know: The Phase 1 schema has `username varchar(50) NOT NULL UNIQUE` but Phase 2 decisions say "email + password only at signup — no username or display name required"
   - What's unclear: The column exists in the DB already and is NOT NULL with a UNIQUE constraint. Registration cannot succeed without providing a value.
   - Recommendation: Phase 2 registration should either (a) accept a username field that defaults to the email prefix server-side, or (b) generate a placeholder like `user_<id>` after insert. Option (b) requires a two-step insert (insert without username, then update). Option (a) is simpler. Recommend (a): derive a unique username on the server from email prefix + random suffix if collision. This avoids a breaking migration to make username nullable.

---

## Sources

### Primary (HIGH confidence)

- github.com/panva/jose v6.1.3 — ESM JWT library, SignJWT API, HS256 support confirmed
- github.com/kelektiv/node.bcrypt.js — native compilation requirement confirmed; ESM import confirmed in docs
- expressjs.com — cookie-parser middleware, CORS credentials: true pattern
- orm.drizzle.team — drizzle-kit generate/migrate workflow for adding tables to existing schema

### Secondary (MEDIUM confidence)

- dev.to/silentwatcher_95 — "Why You Should Delete jsonwebtoken in 2025" (confirmed against jose GitHub)
- freecodecamp.org — JWT + refresh token architecture patterns (verified against multiple sources)
- dev.mochafreddo — bcrypt 12 rounds production recommendation (consistent across 3+ sources)
- gist.github.com/mkjiau — axios refresh token interceptor pattern (confirmed against axios docs)
- nodemailer.com — SMTP configuration, secure flag behavior at port 465 vs 587 (official docs)

### Tertiary (LOW confidence)

- Medium articles on password reset flow patterns — used as supplementary reference; patterns verified independently

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — jose and bcryptjs are direct verified fits for the ESM project; cookie-parser, express-rate-limit, nodemailer are all official/battle-tested
- Architecture: HIGH — JWT + httpOnly refresh cookie is well-documented industry pattern; token hashing with SHA-256 is verified best practice
- Pitfalls: HIGH — ESM/jsonwebtoken pitfall is confirmed by open GitHub issue; refresh queuing pattern is verified against multiple implementations; cookie path scope pitfall is verified against Express docs

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable libraries; 30-day validity)
