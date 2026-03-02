# Phase 3: Wallet & Currency - Research

**Researched:** 2026-03-02
**Domain:** PostgreSQL atomic transactions, React state management, virtual coin economy, server-side RNG
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Balance header display**
- Format: coin icon + abbreviated number — 🪙 1.25M (not full digits, not plain text)
- Position: top-right of the persistent header, always visible on every page
- Change animation: animated count-up (win) / count-down (loss) to new value — not a flash, not silent
- Clickable: yes — links to the player profile/stats page

**Daily bonus UX**
- Presentation: prominent card/banner on the dashboard with a large Claim button — hard to miss
- Already-claimed state: countdown timer showing time until next claim (e.g., "Next bonus in 14h 32m")
- Success feedback: simple toast notification — "Bonus claimed! +100 coins"
- Bonus amount: fixed flat amount every day (no streaks, no random range)

**Coin economy values**
- Minimum bet: 1 coin
- Starting balance: 1,000 coins
- Daily bonus: 100 coins
- Maximum bet: uncapped

**Balance refresh strategy**
- After a bet resolves: optimistic update from the bet API response — POST /bet returns the new balance, frontend updates store directly
- Frontend state: separate React Context or Zustand store for balance — single responsibility, does not merge into auth state
- Initial balance on page load: included in the GET /api/me response (no separate wallet fetch on startup)
- Phase 6 WebSocket will later push balance updates into the same store without changing the store interface

### Claude's Discretion
- Exact balance store implementation (Context vs Zustand) — pick based on Phase 2 patterns already in the codebase
- Server-side RNG algorithm selection (crypto.randomInt or equivalent)
- Exact animation easing/duration for the count-up/count-down
- Error state handling for failed bet transactions (UI messaging)
- Toast library choice (or custom)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CURR-01 | New users receive a starting balance sufficient for approximately 50–100 minimum bets | Starting balance set to 1,000 coins in `register()` service; schema already has `balance BIGINT DEFAULT 0`; Phase 3 changes the default or sets it explicitly on insert |
| CURR-02 | User can claim a daily bonus once per 24 hours from the dashboard | `lastBonusClaimedAt` column exists in users schema; `dailyBonusClaims` table exists; 24-hour gate uses timestamp comparison; POST /api/wallet/bonus endpoint |
| CURR-03 | User's balance is always visible in a persistent header/sidebar on every page | Zustand `useBalanceStore` feeds a `<Header>` layout component; initial balance from GET /api/me on auth; clean `setBalance(n)` interface |
| CURR-04 | User's balance updates after each game round without a page refresh | POST /bet returns `{ newBalance }` in response body; frontend calls `setBalance(newBalance)` on response; no polling required |
| GINF-01 | All games deduct the bet amount from the user's balance before play begins | WalletService `deductBet()` inside `db.transaction()` with `.for('update')` row lock; returns updated balance or throws `INSUFFICIENT_FUNDS` |
| GINF-02 | All game outcomes are calculated server-side using a cryptographically secure RNG | Node.js built-in `crypto.randomInt(min, max)` — CSPRNG, no extra package; available since Node 14.10 |
| GINF-03 | Winnings are credited to the user's balance after the outcome is resolved server-side | WalletService `creditWin()` inside same transaction or as follow-up; atomically updates balance + totalProfit |
| GINF-04 | Every game round logs: UserID, GameType, BetAmount, Outcome, Profit, Timestamp | `game_logs` table already exists in schema with all required columns; append inside the bet transaction |
| GINF-05 | Each game enforces minimum and maximum bet limits; bets outside range are rejected before play | Zod schema validation on bet endpoint: `betAmount: z.number().int().min(1)` (no max — uncapped); service throws `BET_TOO_SMALL` before touching balance |
</phase_requirements>

---

## Summary

Phase 3 builds the virtual coin economy on top of the existing Express + Drizzle + PostgreSQL + React 19 stack from Phase 2. The core technical challenge is preventing double-spend under concurrent bet requests — solved with PostgreSQL's `SELECT FOR UPDATE` row lock inside a `db.transaction()`. The schema for this phase already exists in full: `users.balance` (BIGINT), `users.last_bonus_claimed_at`, `dailyBonusClaims` table, and `game_logs` table were all created in Phase 1 migrations. No new migrations are needed — only service logic and frontend UI.

On the frontend, the balance store should use Zustand v5 (a new dependency) rather than React Context because: (1) Phase 2 established that AuthContext handles auth state — balance is a separate concern with different update triggers; (2) Zustand's `setBalance(n)` interface is directly callable from anywhere (axios interceptors, game pages, WebSocket handler in Phase 6) without prop drilling or event gymnastics; (3) the Context pattern in this codebase wraps async state initialization inside `useEffect` on mount — a second Context for balance would duplicate that pattern unnecessarily. Balance is initialized from `GET /api/me` response (which already returns `balance` from `getProfile()`) when auth succeeds.

The animated balance display uses `react-countup` v6.5.3 (MEDIUM confidence — has TypeScript warnings with React 19 refs but is functionally compatible) or a simple inline Framer Motion spring (HIGH confidence — `framer-motion` is already being considered for Phase 4 animations). Given the project has no current animation dependency, the recommendation is to implement the count animation as a small inline Framer Motion component (using `useSpring` + `useTransform`) to avoid adding a stale dependency and to reuse what Phase 4 will need anyway. Toast notifications use `sonner` v2.0.7 — React 19 compatible, <4kb, adopted by shadcn/ui ecosystem.

**Primary recommendation:** WalletService with `db.transaction()` + `.for('update')` for all balance mutations; Zustand v5 balance store with `setBalance(n)` interface; `framer-motion` for count animation; `sonner` for toasts; `crypto.randomInt` for RNG — zero new backend dependencies.

---

## Standard Stack

### Core (no new backend dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.0 (existing) | Database transactions with row locking | Already in project; `db.transaction()` + `.for('update')` pattern for atomic wallet ops |
| pg (node-postgres) | ^8.11.0 (existing) | PostgreSQL connection pool | Already in project; Pool handles connection reuse |
| zod | ^3.22.0 (existing) | Bet request validation | Already in project; pattern established in Phase 2 |
| crypto (Node built-in) | Node 22 (existing) | CSPRNG for game outcomes | `crypto.randomInt(min, max)` — no package needed, cryptographically secure |
| express-rate-limit | ^8.2.1 (existing) | Bet endpoint rate limiting (Phase 8 full implementation) | Already in project |

### New Frontend Dependencies

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.0 | Global balance store | Lightweight, React 19 compatible, `setBalance(n)` callable outside components, no provider boilerplate |
| sonner | ^2.0.7 | Toast notifications (daily bonus, bet feedback) | Opinionated, zero-config, adopted by shadcn/ui, React 19 compatible |
| framer-motion | ^11.0.0 | Animated count-up/count-down on balance change | Planned for Phase 4 anyway; `useSpring`+`useTransform` pattern needs no external animation lib |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zustand | React Context | Context causes full re-render of consumers on every balance change; Zustand re-renders only subscribed components; balance changes frequently (every bet) making this meaningful |
| framer-motion | react-countup | react-countup v6.5.3 last published 2+ years ago, has open React 19 TypeScript ref issues; framer-motion v11 is current, maintained, and Phase 4 needs it anyway |
| sonner | react-hot-toast | Both are fine; sonner is slightly more modern API, better shadcn/ui alignment |
| crypto.randomInt | nanoid/uuid | Those are for IDs — `crypto.randomInt` is the correct primitive for game outcome generation |

**Installation (new frontend dependencies only):**
```bash
pnpm --filter frontend add zustand sonner framer-motion
```

---

## Architecture Patterns

### Recommended Project Structure (additions to existing layout)

```
apps/backend/src/
├── services/
│   ├── authService.ts           # existing
│   └── walletService.ts         # NEW — all balance mutation logic
├── routes/
│   ├── auth.ts                  # existing
│   └── wallet.ts                # NEW — /api/wallet/* endpoints
└── middleware/
    └── validate.ts              # existing — reused for bet validation

apps/frontend/src/
├── stores/
│   └── balanceStore.ts          # NEW — Zustand balance store
├── components/
│   ├── Header.tsx               # NEW — persistent header with balance display
│   ├── BalanceDisplay.tsx       # NEW — animated coin counter
│   └── DailyBonusCard.tsx       # NEW — dashboard bonus card
└── contexts/
    └── AuthContext.tsx          # existing — unchanged
```

### Pattern 1: Atomic Wallet Mutation (SELECT FOR UPDATE)

**What:** Every balance deduction or credit runs inside a `db.transaction()` with `.for('update')` to lock the user row, preventing concurrent reads of a stale balance before write.

**When to use:** Any operation that reads balance then writes balance — bet deduction, win credit, daily bonus claim.

**Example:**
```typescript
// Source: drizzle-orm GitHub discussion #1337 + official transactions docs
// apps/backend/src/services/walletService.ts

import { db } from '../db/index.js';
import { users, gameLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function deductBet(
  userId: number,
  betAmount: number,
  gameType: string,
): Promise<{ newBalance: number }> {
  return db.transaction(async (tx) => {
    // Lock the user row — blocks concurrent reads until this tx commits
    const [user] = await tx
      .select({ id: users.id, balance: users.balance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

    if (user.balance < betAmount) {
      throw Object.assign(new Error('Insufficient funds'), { code: 'INSUFFICIENT_FUNDS' });
    }

    const newBalance = user.balance - betAmount;

    const [updated] = await tx
      .update(users)
      .set({
        balance: newBalance,
        totalWagered: user.balance, // will need full read for totalWagered — see note
      })
      .where(eq(users.id, userId))
      .returning({ balance: users.balance });

    return { newBalance: updated!.balance };
  });
}
```

**Critical note on totalWagered/totalLoss/totalProfit:** These aggregates should be updated with SQL expressions to avoid read-modify-write on separate columns:
```typescript
// Use sql template for atomic increments — never read-modify-write separate columns
import { sql } from 'drizzle-orm';

await tx.update(users).set({
  balance: newBalance,
  totalWagered: sql`${users.totalWagered} + ${betAmount}`,
}).where(eq(users.id, userId));
```

### Pattern 2: Credit Win (same transaction as deduction or follow-up)

**What:** After server computes outcome, credit winnings in the same session. For stateless games (Phase 3 test endpoint), deduction and credit happen in one round trip.

```typescript
// Source: drizzle-orm official docs — transactions
export async function settleBet(
  userId: number,
  betAmount: number,
  profit: number,         // positive = win, 0 = push, negative = loss (already 0 here — loss handled by deductBet)
  outcome: string,
  gameType: string,
): Promise<{ newBalance: number }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

    // profit > 0: win; profit === 0: loss (bet already deducted)
    const newBalance = user.balance + profit;
    const balanceAfter = newBalance;

    await tx.update(users).set({
      balance: newBalance,
      totalProfit: profit > 0 ? sql`${users.totalProfit} + ${profit}` : users.totalProfit,
      totalLoss: profit <= 0 ? sql`${users.totalLoss} + ${betAmount}` : users.totalLoss,
    }).where(eq(users.id, userId));

    // Append game log inside same transaction
    await tx.insert(gameLogs).values({
      userId,
      gameType,
      betAmount,
      outcome,
      profit,
      balanceAfter,
    });

    return { newBalance };
  });
}
```

### Pattern 3: Daily Bonus with 24-Hour Gate

**What:** Check `lastBonusClaimedAt` inside a transaction, reject if within 24 hours, otherwise credit + update timestamp.

```typescript
// apps/backend/src/services/walletService.ts
const BONUS_AMOUNT = 100;
const BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function claimDailyBonus(userId: number): Promise<{
  newBalance: number;
  nextClaimAt: string;
}> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ balance: users.balance, lastBonusClaimedAt: users.lastBonusClaimedAt })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

    const now = Date.now();
    if (user.lastBonusClaimedAt) {
      const msUntilNext = user.lastBonusClaimedAt.getTime() + BONUS_COOLDOWN_MS - now;
      if (msUntilNext > 0) {
        throw Object.assign(
          new Error('Bonus not available yet'),
          { code: 'BONUS_NOT_READY', msUntilNext }
        );
      }
    }

    const newBalance = user.balance + BONUS_AMOUNT;
    const claimedAt = new Date(now);

    await tx.update(users).set({
      balance: newBalance,
      lastBonusClaimedAt: claimedAt,
    }).where(eq(users.id, userId));

    await tx.insert(dailyBonusClaims).values({
      userId,
      amount: BONUS_AMOUNT,
      claimedAt,
    });

    const nextClaimAt = new Date(now + BONUS_COOLDOWN_MS).toISOString();
    return { newBalance, nextClaimAt };
  });
}
```

### Pattern 4: Zustand Balance Store

**What:** Single-responsibility global store for balance. Clean `setBalance(n)` interface that Phase 6 WebSocket can use without refactoring.

```typescript
// Source: Zustand v5 official docs — TypeScript pattern
// apps/frontend/src/stores/balanceStore.ts
import { create } from 'zustand';

interface BalanceState {
  balance: number | null;   // null = not yet loaded
  setBalance: (n: number) => void;
  clearBalance: () => void;
}

export const useBalanceStore = create<BalanceState>()((set) => ({
  balance: null,
  setBalance: (n) => set({ balance: n }),
  clearBalance: () => set({ balance: null }),
}));
```

**Initialization in AuthContext (extend existing):**
```typescript
// In AuthContext.tsx — after successful refresh or login, set balance from /me response
import { useBalanceStore } from '../stores/balanceStore';

// In signIn callback or refresh effect:
const { balance } = await apiClient.get<{ balance: number }>('/auth/me').then(r => r.data);
useBalanceStore.getState().setBalance(balance);

// In signOut callback:
useBalanceStore.getState().clearBalance();
```

**Note:** `useBalanceStore.getState()` allows calling store actions outside React components (axios interceptors, event handlers) without hooks.

### Pattern 5: Animated Balance Display

**What:** Framer Motion `useSpring` + `useTransform` animates from old balance to new balance on every `setBalance()` call.

```typescript
// Source: buildui.com/recipes/animated-number (verified pattern using framer-motion)
// apps/frontend/src/components/BalanceDisplay.tsx
import { useEffect, useRef } from 'react';
import { useSpring, useTransform, motion } from 'framer-motion';
import { useBalanceStore } from '../stores/balanceStore';

function formatCoins(n: number): string {
  // Source: MDN Intl.NumberFormat compact notation
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumSignificantDigits: 3,
  }).format(n);
}

export function BalanceDisplay() {
  const balance = useBalanceStore((s) => s.balance);
  const spring = useSpring(balance ?? 0, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (v) => formatCoins(Math.round(v)));

  useEffect(() => {
    if (balance !== null) spring.set(balance);
  }, [balance, spring]);

  if (balance === null) return null;

  return (
    <span>
      🪙 <motion.span>{display}</motion.span>
    </span>
  );
}
```

### Pattern 6: Server-Side RNG

**What:** Node.js built-in `crypto.randomInt` for cryptographically secure random numbers.

```typescript
// Source: Node.js 22 built-in crypto module
import { randomInt } from 'node:crypto';

// Returns a cryptographically secure integer in [min, max)
// Example: roulette spin 0-36
const spinResult = randomInt(0, 37); // returns integer in [0, 36]

// Example: coin flip
const isWin = randomInt(0, 2) === 1; // 50% probability
```

**No package needed.** `crypto.randomInt` is a built-in since Node 14.10 and uses OS entropy (same as `crypto.randomBytes`). Never use `Math.random()` for game outcomes.

### Pattern 7: Starting Balance on Registration

**What:** Set `balance = 1000` when inserting a new user in `register()`.

```typescript
// Modify existing authService.ts register() function
const [newUser] = await db.insert(users).values({
  email: email.toLowerCase(),
  passwordHash,
  username,
  balance: 1000,   // CURR-01: 1,000 coins starting balance
}).returning({ id: users.id });
```

**No migration needed** — `balance` column already exists with `DEFAULT 0`. This is just changing the insert value, not the schema.

### Pattern 8: Toast Notification (Sonner)

**What:** Add `<Toaster>` to app root once; call `toast()` from anywhere.

```typescript
// apps/frontend/src/main.tsx — add Toaster to root
import { Toaster } from 'sonner';

// Inside render():
<Toaster position="top-right" richColors />

// From DailyBonusCard.tsx — after successful claim:
import { toast } from 'sonner';
toast.success('Bonus claimed! +100 coins');

// On claim rejection:
toast.error(`Next bonus in ${formatCountdown(msUntilNext)}`);
```

### Anti-Patterns to Avoid

- **Read-modify-write outside a transaction:** Never `SELECT balance` then `UPDATE balance` without `.for('update')` — creates a TOCTOU race condition that allows double-spend.
- **Storing balance in AuthContext:** Auth state and wallet state have different lifetimes and update triggers. Merging them causes unnecessary re-renders on every balance change.
- **Math.random() for game outcomes:** Not cryptographically secure; results can be predicted. Always use `crypto.randomInt`.
- **Updating totalWagered/totalProfit with read-modify-write:** Use `sql\`${users.totalWagered} + ${amount}\`` expression — never read the aggregate, add to it in JS, then write back.
- **Polling for balance updates:** The POST /bet response includes `newBalance` — use that directly. No polling needed (Phase 6 adds WebSocket push).
- **Deleting dailyBonusClaims rows:** Keep the audit trail — only update `lastBonusClaimedAt` on users and insert a row in `dailyBonusClaims`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent balance protection | Custom mutex / in-memory lock | PostgreSQL `SELECT FOR UPDATE` inside `db.transaction()` | DB-level lock survives process restarts, works across multiple server instances, guaranteed by ACID |
| Cryptographic randomness | Seeded PRNG, shuffled arrays | `crypto.randomInt` (Node built-in) | Math-based PRNGs are predictable; crypto.randomInt uses OS entropy pool |
| Number abbreviation (1.25M) | Custom string formatter | `Intl.NumberFormat` with `notation: 'compact'` | Handles locale edge cases, K/M/B/T correctly, zero dependency |
| Animated number transitions | CSS keyframe animation | Framer Motion `useSpring` + `useTransform` | Physics-based spring feels natural; handles interruption (balance changes mid-animation) |
| Toast notifications | Custom React modal/snackbar | Sonner | Accessibility, stacking, dismissal, position — dozens of edge cases |
| Global balance state | React Context with useReducer | Zustand store | Context re-renders all consumers; Zustand re-renders only subscribed components |

**Key insight:** The wallet domain looks deceptively simple (read balance, subtract, write) but has two rewrite-causing failure modes: (1) race conditions under concurrent requests producing negative balance or double-spend, and (2) aggregation drift (totalWagered/totalProfit) from read-modify-write outside transactions. Both require proper DB-level primitives, not application-layer workarounds.

---

## Common Pitfalls

### Pitfall 1: Missing FOR UPDATE — Race Condition on Concurrent Bets

**What goes wrong:** Ten simultaneous POST /bet requests all read `balance = 1000`, all subtract `betAmount = 200`, all write `800` — resulting in the balance being 800 instead of -1000 (or properly rejecting 9 of them). SUCCESS CRITERION 5 explicitly tests this.

**Why it happens:** Without `SELECT FOR UPDATE`, each transaction reads the pre-lock value. All 10 see 1000 available and all succeed.

**How to avoid:** Always use `.for('update')` on the user row SELECT inside `db.transaction()` before any balance math. The first transaction to acquire the lock proceeds; the rest queue and read the updated balance from the previous commit.

**Warning signs:** Integration test with 10 concurrent bets results in negative balance or more successful transactions than expected.

### Pitfall 2: Incorrect 24-Hour Gate Logic

**What goes wrong:** Using `new Date() - lastBonusClaimedAt < 86400000` with local time or timezone differences causing bonus to be available after 22 hours in some timezones.

**Why it happens:** JavaScript `Date` objects and PostgreSQL `timestamp` (without timezone) can behave differently depending on server locale.

**How to avoid:** Store and compare using `Date.now()` (UTC milliseconds) consistently. The schema uses `timestamp` (no timezone) — always compare as `user.lastBonusClaimedAt.getTime() + COOLDOWN_MS > Date.now()`. PostgreSQL stores `timestamp` values in server timezone — ensure server is set to UTC (Docker default is UTC, so this is safe here).

**Warning signs:** Users can claim bonus at unexpected intervals.

### Pitfall 3: Starting Balance Migration vs. Insert Default

**What goes wrong:** Changing `DEFAULT 0` to `DEFAULT 1000` in the schema and running a migration — this changes the DB-level default but does NOT update existing users' balances. Existing test users still have 0.

**Why it happens:** Schema `DEFAULT` only applies to new rows. Old rows are unaffected by `ALTER COLUMN SET DEFAULT`.

**How to avoid:** Don't change the schema default. Instead, pass `balance: 1000` explicitly in the `INSERT` statement inside `register()`. The schema default of 0 remains (a safe fallback), but every registration sets it to 1000 explicitly.

**Warning signs:** New users have 0 balance despite migration.

### Pitfall 4: Drizzle `.for('update')` Only Available on `.select()` Builder — Not Relational Query API

**What goes wrong:** Attempting `db.query.users.findFirst({ where: ..., for: 'update' })` — this throws or silently ignores the lock because `for()` is only on the query builder (`db.select().from().where().for('update')`), not the relational query API (`db.query.*`).

**Why it happens:** Drizzle has two separate query APIs. The relational API (`db.query.*`) does not expose `for()`.

**How to avoid:** Use the query builder API (`tx.select().from(users).where(...).for('update')`) inside transactions. Never use `db.query.*` for operations requiring row locks.

**Warning signs:** TypeScript error "Property 'for' does not exist" on a relational query — or worse, no error but no lock being acquired.

### Pitfall 5: `noWait` and `skipLocked` Options Are Buggy in Drizzle

**What goes wrong:** Using `.for('update', { noWait: true })` produces invalid SQL (`syntax error at or near "no"`) in PostgreSQL 16.

**Why it happens:** Known Drizzle bug reported November 2024 (GitHub issue #3554). The generated SQL is malformed.

**How to avoid:** Do not use `{ noWait: true }` or `{ skipLocked: true }` options. Plain `.for('update')` works correctly.

**Warning signs:** PostgreSQL syntax error in bet endpoint logs.

### Pitfall 6: react-countup React 19 TypeScript Ref Incompatibility

**What goes wrong:** Using `react-countup` with React 19 produces TypeScript errors on `RefObject<HTMLElement | null>` not matching expected ref type.

**Why it happens:** `react-countup` v6.5.3 was last published over 2 years ago and predates React 19. The `useCountUp` hook's ref type is incompatible.

**How to avoid:** Use the Framer Motion `useSpring`+`useTransform` pattern instead (buildui.com recipe). No extra dependency beyond what Phase 4 will need anyway.

**Warning signs:** TypeScript errors in `useCountUp` usage, `@ts-ignore` needed.

### Pitfall 7: Balance Store Reset on Logout Not Wired

**What goes wrong:** User A logs out, user B logs in — the balance display still shows user A's balance briefly until the next `/me` fetch completes.

**Why it happens:** `clearBalance()` not called in `signOut()` in AuthContext.

**How to avoid:** Call `useBalanceStore.getState().clearBalance()` in the `signOut` callback in AuthContext, and call `useBalanceStore.getState().setBalance(data.balance)` after successful refresh/login in AuthContext's `useEffect`.

**Warning signs:** Stale balance visible for a moment on user switch.

---

## Code Examples

Verified patterns from official sources:

### Drizzle Transaction with Row Lock
```typescript
// Source: drizzle-orm GitHub Discussion #1337 (confirmed working pattern)
// Source: drizzle-orm official transactions docs (https://orm.drizzle.team/docs/transactions)
await db.transaction(async (tx) => {
  const [row] = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for('update');        // Acquires row-level lock; concurrent txs queue here

  // Safe to read-modify-write — no other tx can read this row until commit
  const newBalance = row.balance - betAmount;
  await tx.update(users)
    .set({ balance: newBalance })
    .where(eq(users.id, userId));
});
```

### Atomic Aggregate Update (no separate read needed)
```typescript
// Source: drizzle-orm official docs — Magic sql`` operator (https://orm.drizzle.team/docs/sql)
import { sql } from 'drizzle-orm';

await tx.update(users).set({
  totalWagered: sql`${users.totalWagered} + ${betAmount}`,
}).where(eq(users.id, userId));
```

### Cryptographically Secure RNG
```typescript
// Source: Node.js 22 built-in crypto module docs
import { randomInt } from 'node:crypto';

// Range [min, max) — max is exclusive
const rouletteResult = randomInt(0, 37);  // 0-36 inclusive
const coinFlip = randomInt(0, 2);          // 0 or 1
const diceRoll = randomInt(1, 7);          // 1-6 inclusive
```

### Compact Number Formatting
```typescript
// Source: MDN Intl.NumberFormat (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
const formatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumSignificantDigits: 3,
});
formatter.format(1250000);  // "1.25M"
formatter.format(1234);     // "1.23K"
formatter.format(999);      // "999"
```

### Zustand v5 TypeScript Store
```typescript
// Source: Zustand v5 official docs (https://zustand.docs.pmnd.rs/)
// Note: create<T>()() double parens required for TypeScript with v5
import { create } from 'zustand';

interface BalanceState {
  balance: number | null;
  setBalance: (n: number) => void;
  clearBalance: () => void;
}

export const useBalanceStore = create<BalanceState>()((set) => ({
  balance: null,
  setBalance: (n) => set({ balance: n }),
  clearBalance: () => set({ balance: null }),
}));
```

### Sonner Toast Setup
```typescript
// Source: Sonner official docs / GitHub (https://github.com/emilkowalski/sonner)
// In main.tsx / App root:
import { Toaster } from 'sonner';
<Toaster position="top-right" richColors />

// From any component or service:
import { toast } from 'sonner';
toast.success('Bonus claimed! +100 coins');
toast.error('Next bonus in 14h 32m');
```

### Wallet Route Pattern (follows Phase 2 router pattern)
```typescript
// apps/backend/src/routes/wallet.ts — mirrors auth.ts structure
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { claimDailyBonus, deductBet, settleBet } from '../services/walletService.js';

export const walletRouter: IRouter = Router();

// POST /api/wallet/bonus
walletRouter.post('/bonus', requireAuth, async (req, res) => {
  try {
    const result = await claimDailyBonus(req.user!.id);
    res.json({ newBalance: result.newBalance, nextClaimAt: result.nextClaimAt });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'BONUS_NOT_READY') {
      const msUntilNext = (err as { msUntilNext?: number }).msUntilNext ?? 0;
      res.status(429).json({ error: 'Bonus not available yet', msUntilNext });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Application-level mutex (in-memory) for concurrent writes | PostgreSQL `SELECT FOR UPDATE` inside transactions | PostgreSQL baseline | DB-level lock survives server restarts and works across multiple instances |
| Math.random() for game outcomes | `crypto.randomInt` (built-in since Node 14.10) | 2020 (Node 14.10) | CSPRNG — outcomes cannot be predicted or manipulated |
| Redux for client state | Zustand v5 (2024) | 2024 | 5x less boilerplate, no provider wrapper, same performance |
| Toastr / react-toastify | Sonner (current shadcn/ui default) | 2023-2024 | Zero-config, better accessibility, lighter bundle |
| Framer Motion standalone | `motion` package (unified) | 2024 | Same library, renamed package; `framer-motion` still works and is alias |
| Custom number formatter | `Intl.NumberFormat` compact notation | ES2020+ | Browser built-in, no dependency |

**Deprecated/outdated:**
- `react-countup`: Last published 2+ years ago, open React 19 type issues — use Framer Motion spring pattern instead
- `redux` / `redux-toolkit`: Overkill for a single global value; Zustand is the current lightweight standard
- `Math.random()` for gambling: Never use — not cryptographically secure

---

## Open Questions

1. **Migration needed for `game_logs.balance_after` column?**
   - What we know: `game_logs` table already exists in migration 0000 with `balance_after bigint NOT NULL` — this column exists.
   - What's unclear: The migration SQL confirms the column; the Drizzle schema also has it. No new migration is needed.
   - Recommendation: No action — column is already in place.

2. **Should the WalletService handle both deduction and credit in one transaction, or separate calls?**
   - What we know: For stateless games (e.g., a test coin-flip endpoint in Phase 3), the outcome is known immediately after deduction, so one transaction can deduct + determine outcome + credit + log.
   - What's unclear: Phase 4 introduces stateful games (Mines) where the player may cash out at any point — those need separate deduct/credit calls.
   - Recommendation: Design `WalletService` with separate `deductBet()` and `settleBet()` methods from the start. The Phase 3 test endpoint calls both sequentially. Stateful games in Phase 4 call them at different points.

3. **Framer Motion version — `framer-motion` vs `motion` package?**
   - What we know: The library rebranded `framer-motion` to `motion` in 2024. Both package names work (framer-motion is an alias). v11 is current and React 19 compatible.
   - What's unclear: Phase 4 planning may use `motion` — consistency matters.
   - Recommendation: Use `framer-motion` package name for now (Phase 4 researcher can decide on `motion` vs `framer-motion`). Both resolve to the same code.

4. **GET /api/me response — does it need a new `nextClaimAt` field?**
   - What we know: `getProfile()` already returns `dailyBonusTimestamp: user.lastBonusClaimedAt?.toISOString()`. The frontend can compute `nextClaimAt = lastBonusClaimedAt + 24h`.
   - Recommendation: Frontend computes `nextClaimAt` from `dailyBonusTimestamp` to keep the API clean. No backend change needed.

---

## Sources

### Primary (HIGH confidence)
- `https://orm.drizzle.team/docs/transactions` — `db.transaction()` API, isolation level config, rollback behavior
- `https://github.com/drizzle-team/drizzle-orm/discussions/1337` — Confirmed working `.for('update')` syntax inside `db.transaction()`
- Node.js 22 built-in `crypto` module — `randomInt(min, max)` CSPRNG, available since 14.10
- `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat` — `notation: 'compact'` for K/M/B formatting
- Project codebase (Phase 1 migrations, Phase 2 services) — verified schema, existing patterns, dependency versions

### Secondary (MEDIUM confidence)
- `https://github.com/emilkowalski/sonner` — Sonner v2.0.7, `<Toaster>` + `toast()` pattern (React 19 compatible confirmed by shadcn/ui adoption)
- `https://zustand.docs.pmnd.rs/` — Zustand v5, `create<T>()()` TypeScript pattern, React 19 compatibility confirmed via GitHub discussions
- `https://buildui.com/recipes/animated-number` — Framer Motion `useSpring` + `useTransform` count animation recipe

### Tertiary (LOW confidence)
- Drizzle `noWait`/`skipLocked` bug: GitHub issue #3554 — reported November 2024, assume still unfixed (LOW: not re-verified today)
- `react-countup` React 19 TypeScript issues: GitHub issue #877 — reported February 2025

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing packages confirmed from package.json; new packages (zustand, sonner) verified from official sources
- Architecture: HIGH — patterns derived from existing codebase conventions (authService.ts, validate.ts, requireAuth.ts) and official Drizzle docs
- Pitfalls: HIGH for race condition/SELECT FOR UPDATE (verified from Drizzle docs + GitHub); MEDIUM for react-countup issues (GitHub issues, not official changelog)
- Coin economy values: HIGH — locked decisions from CONTEXT.md

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30 days — Drizzle and Zustand are stable; framer-motion/sonner versions may update but patterns hold)
