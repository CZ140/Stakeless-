import { randomInt } from 'node:crypto';
import { and, eq, isNull, desc } from 'drizzle-orm';
import {
  crashPointFromUniform,
  crashMultiplierAt,
  crashTimeToReachMs,
  crashCashoutWins,
} from '@gambling/shared';
import { db } from '../db/index.js';
import { gameSessions } from '../db/schema.js';
import { settleBet } from './walletService.js';
import { applyTierUp } from './tierNotify.js';
import { io } from '../socket/index.js';

// 1e9 uniform buckets — far finer than the 2dp crash point needs.
const UNIFORM_RES = 1_000_000_000;

// Draw a fresh crash point with a crypto-secure uniform (house edge baked into the
// shared distribution). Matches the rest of the platform's use of crypto.randomInt.
export function generateCrashPoint(): number {
  return crashPointFromUniform(randomInt(0, UNIFORM_RES) / UNIFORM_RES);
}

// Persisted per-round state (gameSessions.state JSON). crashPoint + startedAt make
// the whole round deterministic, so the outcome can always be recomputed without
// the in-memory timers — those are only a "push at the right moment" convenience.
export interface CrashSessionState {
  crashPoint: number;
  autoCashout: number | null;
  startedAt: number; // epoch ms
  status: 'active' | 'cashed' | 'busted';
  cashoutMultiplier?: number;
  payout?: number;
}

// In-memory timers (auto-cash-out + bust) keyed by sessionId. Lost on restart →
// reconciled lazily from the persisted state on resume / next start.
const timers = new Map<number, NodeJS.Timeout[]>();

export function cancelTimers(sessionId: number): void {
  const ts = timers.get(sessionId);
  if (ts) {
    ts.forEach(clearTimeout);
    timers.delete(sessionId);
  }
}

// Atomically claim a session for settlement: write the final state + completedAt,
// but only if it hasn't been settled yet. Exactly one caller wins this race
// (manual cash-out vs bust timer vs auto timer vs lazy reconcile).
async function claimSession(sessionId: number, finalState: CrashSessionState): Promise<boolean> {
  const rows = await db
    .update(gameSessions)
    .set({ state: JSON.stringify(finalState), completedAt: new Date() })
    .where(and(eq(gameSessions.id, sessionId), isNull(gameSessions.completedAt)))
    .returning({ id: gameSessions.id });
  return rows.length > 0;
}

// Settle a win (manual or auto) at `multiplier`. Returns the new balance, or null
// if another path already settled this session. Emits crash:cashout for the auto
// path (the manual path returns the result in the HTTP response instead).
export async function settleCrashWin(
  userId: number,
  sessionId: number,
  betAmount: number,
  state: CrashSessionState,
  multiplier: number,
  auto: boolean,
): Promise<number | null> {
  const payout = Math.floor(betAmount * multiplier);
  const finalState: CrashSessionState = {
    ...state,
    status: 'cashed',
    cashoutMultiplier: multiplier,
    payout,
  };
  if (!(await claimSession(sessionId, finalState))) return null;
  cancelTimers(sessionId);
  const { newBalance } = await settleBet(userId, payout, betAmount, `cashout_${multiplier.toFixed(2)}`, 'crash');
  io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
  if (auto) {
    io?.to(`user:${userId}`).emit('crash:cashout', { sessionId, multiplier, payout, newBalance, auto: true });
  }
  await applyTierUp(userId);
  return newBalance;
}

// Settle a bust (no cash-out in time). Emits crash:bust so the client stops the
// curve and reveals the crash point. No-op if the round was already settled.
export async function settleCrashBust(
  userId: number,
  sessionId: number,
  betAmount: number,
  state: CrashSessionState,
): Promise<void> {
  const finalState: CrashSessionState = { ...state, status: 'busted' };
  if (!(await claimSession(sessionId, finalState))) return;
  cancelTimers(sessionId);
  const { newBalance } = await settleBet(userId, 0, betAmount, `bust_${state.crashPoint.toFixed(2)}`, 'crash');
  io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
  io?.to(`user:${userId}`).emit('crash:bust', { sessionId, crashPoint: state.crashPoint });
  await applyTierUp(userId);
}

// Schedule the auto-cash-out (if armed and below the crash point) and the bust.
export function armRound(
  userId: number,
  sessionId: number,
  betAmount: number,
  state: CrashSessionState,
): void {
  cancelTimers(sessionId);
  const ts: NodeJS.Timeout[] = [];
  const elapsed = Date.now() - state.startedAt;

  if (state.autoCashout != null && crashCashoutWins(state.autoCashout, state.crashPoint)) {
    const delay = Math.max(0, crashTimeToReachMs(state.autoCashout) - elapsed);
    const target = state.autoCashout;
    ts.push(setTimeout(() => void settleCrashWin(userId, sessionId, betAmount, state, target, true), delay));
  }
  const bustDelay = Math.max(0, crashTimeToReachMs(state.crashPoint) - elapsed);
  ts.push(setTimeout(() => void settleCrashBust(userId, sessionId, betAmount, state), bustDelay));
  timers.set(sessionId, ts);
}

// Deduct already done by the caller. Generate the hidden crash point, persist the
// round, arm its timers, and return the resume info (crash point stays secret).
export async function startCrashRound(
  userId: number,
  betAmount: number,
  autoCashout: number | null,
): Promise<{ sessionId: number; startedAt: number; autoCashout: number | null }> {
  const crashPoint = generateCrashPoint();
  const startedAt = Date.now();
  const state: CrashSessionState = { crashPoint, autoCashout, startedAt, status: 'active' };
  const [session] = await db
    .insert(gameSessions)
    .values({ userId, gameType: 'crash', state: JSON.stringify(state), betAmount })
    .returning({ id: gameSessions.id });
  armRound(userId, session!.id, betAmount, state);
  return { sessionId: session!.id, startedAt, autoCashout };
}

export interface CrashReconcileResult {
  status: 'running' | 'busted' | 'cashed';
  sessionId: number;
  startedAt: number;
  autoCashout: number | null;
  crashPoint?: number; // revealed only once resolved
  cashoutMultiplier?: number;
  payout?: number;
  newBalance?: number | null;
}

// Resolve the player's latest active crash round deterministically as of now.
// Settles it if its bust / auto-cash-out moment has passed; re-arms timers and
// reports 'running' otherwise (covers a mid-round server restart). Returns null
// when there is no active round.
export async function reconcileActiveCrash(userId: number): Promise<CrashReconcileResult | null> {
  const rows = await db
    .select()
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.userId, userId),
        eq(gameSessions.gameType, 'crash'),
        isNull(gameSessions.completedAt),
      ),
    )
    .orderBy(desc(gameSessions.createdAt))
    .limit(1);
  const session = rows[0];
  if (!session) return null;

  const state = JSON.parse(session.state) as CrashSessionState;
  const betAmount = session.betAmount;
  const elapsed = Date.now() - state.startedAt;

  // Auto-cash-out resolves first if it's below the crash point and its time passed.
  if (
    state.autoCashout != null &&
    crashCashoutWins(state.autoCashout, state.crashPoint) &&
    elapsed >= crashTimeToReachMs(state.autoCashout)
  ) {
    const newBalance = await settleCrashWin(userId, session.id, betAmount, state, state.autoCashout, true);
    return {
      status: 'cashed',
      sessionId: session.id,
      startedAt: state.startedAt,
      autoCashout: state.autoCashout,
      cashoutMultiplier: state.autoCashout,
      payout: Math.floor(betAmount * state.autoCashout),
      newBalance,
    };
  }
  // Otherwise, has it busted?
  if (elapsed >= crashTimeToReachMs(state.crashPoint)) {
    await settleCrashBust(userId, session.id, betAmount, state);
    return {
      status: 'busted',
      sessionId: session.id,
      startedAt: state.startedAt,
      autoCashout: state.autoCashout,
      crashPoint: state.crashPoint,
    };
  }
  // Still running — re-arm (idempotent: cancels any existing timers first) + resume.
  armRound(userId, session.id, betAmount, state);
  return {
    status: 'running',
    sessionId: session.id,
    startedAt: state.startedAt,
    autoCashout: state.autoCashout,
  };
}

export interface ManualCashoutResult {
  win: boolean;
  multiplier?: number;
  payout?: number;
  crashPoint?: number;
  newBalance?: number;
  alreadySettled?: boolean;
}

// Reflect an already-settled session's stored outcome (used when a timer beat the
// manual request to the punch).
function settledOutcome(state: CrashSessionState): ManualCashoutResult {
  return state.status === 'cashed'
    ? { win: true, multiplier: state.cashoutMultiplier, payout: state.payout, alreadySettled: true }
    : { win: false, crashPoint: state.crashPoint, alreadySettled: true };
}

// Manual cash-out: server-authoritative on its own clock. Returns null if the
// round doesn't belong to the user / doesn't exist.
export async function manualCashout(userId: number, sessionId: number): Promise<ManualCashoutResult | null> {
  const rows = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId)));
  const session = rows[0];
  if (!session || session.gameType !== 'crash') return null;

  const state = JSON.parse(session.state) as CrashSessionState;
  if (session.completedAt) return settledOutcome(state);

  const betAmount = session.betAmount;
  const elapsed = Date.now() - state.startedAt;
  const c = crashMultiplierAt(elapsed);

  if (crashCashoutWins(c, state.crashPoint)) {
    const newBalance = await settleCrashWin(userId, sessionId, betAmount, state, c, false);
    if (newBalance == null) {
      // A timer settled it first — report the stored outcome.
      const fresh = (await db.select().from(gameSessions).where(eq(gameSessions.id, sessionId)))[0]!;
      return settledOutcome(JSON.parse(fresh.state) as CrashSessionState);
    }
    return { win: true, multiplier: c, payout: Math.floor(betAmount * c), newBalance };
  }

  // The curve already passed the crash point — settle the bust now (if a timer
  // hasn't) and report the loss.
  await settleCrashBust(userId, sessionId, betAmount, state);
  return { win: false, crashPoint: state.crashPoint };
}
