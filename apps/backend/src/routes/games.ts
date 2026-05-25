import { Router, type IRouter } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { gameLimiter } from '../middleware/rateLimiter.js';
import { clickInterval } from '../middleware/clickInterval.js';
import { deductBet, settleBet } from '../services/walletService.js';
import { applyTierUp } from '../services/tierNotify.js';
import { resolveRouletteBets } from '../services/rouletteService.js';
import { resolvePlinko, rollPlinkoBucket } from '../services/plinkoService.js';
import { rollDice, resolveDice } from '../services/diceService.js';
import { spinGrid } from '../services/slotsService.js';
import { flipCoin, resolveCoinflip } from '../services/coinflipService.js';
import { initialHiloState, applyHiloGuess, type HiloSessionState } from '../services/hiloService.js';
import { initialPumpState, applyPump, type PumpSessionState } from '../services/pumpService.js';
import { startCrashRound, manualCashout, reconcileActiveCrash } from '../services/crashService.js';
import {
  diceWinChance,
  diceWinChanceValid,
  resolveSlots,
  hiloDirectionAvailable,
  isPumpDifficulty,
  pumpMaxPumps,
  CRASH,
} from '@gambling/shared';
import {
  generateMineGrid,
  calculateMinesMultiplier,
  type MinesSessionState,
} from '../services/minesService.js';
import {
  calculateHandValue,
  startGame,
  playerHit,
  playerStand,
  playerDouble,
  playerSplit,
  canSplit,
  canDouble,
  settle,
  totalProfit,
  MAX_PREDEAL_HANDS,
  type BlackjackSessionState,
} from '../services/blackjackService.js';
import { db } from '../db/index.js';
import { gameSessions } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { io } from '../socket/index.js';

export const gamesRouter: IRouter = Router();

// European wheel pocket sequence (clockwise from 12 o'clock, pocket 0 at top)
const WHEEL_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20,
  14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const betZoneSchema = z.union([
  z.literal('red'),
  z.literal('black'),
  z.literal('odd'),
  z.literal('even'),
  z.literal('dozen_1'),
  z.literal('dozen_2'),
  z.literal('dozen_3'),
  z.literal('col_1'),
  z.literal('col_2'),
  z.literal('col_3'),
  z.string().regex(/^number_([0-9]|[12][0-9]|3[0-6])$/, 'Invalid number bet zone'),
]);

const rouletteBetSchema = z.object({
  bets: z
    .array(z.object({ zone: betZoneSchema, amount: z.number().int().min(1).max(1_000_000) }))
    .min(1, 'At least one bet required')
    .max(50, 'Too many simultaneous bets'),
});

// POST /api/games/roulette/bet
// Pipeline: validate bets → deduct total → crypto.randomInt(0,37) → resolve → settle → log
// Returns 200 { winningPocket, profit, newBalance }
// Returns 400 on invalid bet shape/zone
// Returns 402 on INSUFFICIENT_FUNDS
// Returns 500 on unexpected error
gamesRouter.post('/roulette/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = rouletteBetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid bets' });
    return;
  }

  const userId = req.user!.id;
  const { bets } = parsed.data;
  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0);

  try {
    // Deduct total bet atomically before resolution (GINF-01)
    await deductBet(userId, totalBet, 'roulette');

    // Resolve outcome — crypto.randomInt(0, 37) selects pocket index (GINF-02, ROUL-01)
    const winningPocketIndex = randomInt(0, 37);
    const winningPocket = WHEEL_SEQUENCE[winningPocketIndex]!;

    // Calculate net profit from all placed bets
    const profit = resolveRouletteBets(winningPocket, bets);

    // Settle and log — outcome is pocket number string only (varchar 50 limit) (GINF-03, GINF-04)
    const { newBalance } = await settleBet(
      userId,
      profit,
      totalBet,
      String(winningPocket),
      'roulette',
    );

    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    await applyTierUp(userId);
    res.json({ winningPocket, profit, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: 'Insufficient funds' });
      return;
    }
    if (code === 'BET_TOO_SMALL') {
      res.status(400).json({ error: 'Bet amount too small' });
      return;
    }
    console.error('[games] roulette bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Plinko ───────────────────────────────────────────────────────────────────

const plinkoBetSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
  rows: z.number().int().min(8).max(16),
  riskLevel: z.enum(['low', 'medium', 'high', 'expert']),
});

// POST /api/games/plinko/bet
// Pipeline: validate → deductBet → crypto.randomInt(0, rows+1) → resolvePlinko → settleBet
// Returns 200 { bucket, multiplier, profit, newBalance }
// Returns 400 on invalid input
// Returns 402 on INSUFFICIENT_FUNDS
// Returns 500 on unexpected error
gamesRouter.post('/plinko/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = plinkoBetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { betAmount, rows, riskLevel } = parsed.data;
  try {
    await deductBet(userId, betAmount, 'plinko');
    // Binomial roll — real Plinko odds (edges rare), not a uniform pick.
    const bucket = rollPlinkoBucket(rows);
    const multiplier = resolvePlinko(rows, riskLevel, bucket);
    // settleBet receives gross payout (stake + winnings).
    // profit passed to settleBet = floor(betAmount * multiplier) which is the gross payout.
    const grossPayout = Math.floor(betAmount * multiplier);
    const { newBalance } = await settleBet(userId, grossPayout, betAmount, `bucket_${bucket}`, 'plinko');
    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    await applyTierUp(userId);
    // net profit shown to player = gross payout - stake (stake was already deducted)
    res.json({ bucket, multiplier, profit: grossPayout - betAmount, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] plinko bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Dice ───────────────────────────────────────────────────────────────────

const diceBetSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
  // 0.01-step threshold the roll is compared against; bounds are validated below
  // via the implied win chance (depends on direction).
  target: z.number().min(0.01).max(99.99),
  direction: z.enum(['under', 'over']),
});

// POST /api/games/dice/bet
// Pipeline: validate → check win chance in range → deductBet → crypto roll →
// resolveDice → settleBet → emit → tier reconcile. Instant-settle (no session).
// Returns 200 { roll, target, direction, win, multiplier, winChance, profit, newBalance }
// Returns 400 on invalid input / target out of range, 402 on INSUFFICIENT_FUNDS.
gamesRouter.post('/dice/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = diceBetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { betAmount, target, direction } = parsed.data;

  // Reject targets whose win chance is outside the playable band BEFORE moving money.
  const winChance = diceWinChance(target, direction);
  if (!diceWinChanceValid(winChance)) {
    res.status(400).json({ error: 'Target out of range' });
    return;
  }

  try {
    await deductBet(userId, betAmount, 'dice');
    const roll = rollDice();
    const { win, multiplier } = resolveDice(roll, target, direction);
    // settleBet receives the gross payout (stake + winnings); 0 on a loss.
    const grossPayout = win ? Math.floor(betAmount * multiplier) : 0;
    const { newBalance } = await settleBet(
      userId,
      grossPayout,
      betAmount,
      `${direction}@${target}=${roll.toFixed(2)}`,
      'dice',
    );
    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    await applyTierUp(userId);
    // net profit shown to player = gross payout − stake (stake was already deducted)
    res.json({ roll, target, direction, win, multiplier, winChance, profit: grossPayout - betAmount, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] dice bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Slots ───────────────────────────────────────────────────────────────────

const slotsBetSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
});

// POST /api/games/slots/bet
// Pipeline: validate → deductBet → crypto spinGrid → resolveSlots → settleBet →
// emit → tier reconcile. Instant-settle (no session). The total bet is split
// evenly across the 5 paylines; resolveSlots is the shared single source of truth.
// Returns 200 { grid, lines, totalPayout, win, profit, newBalance }.
// Returns 400 on invalid input, 402 on INSUFFICIENT_FUNDS.
gamesRouter.post('/slots/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = slotsBetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { betAmount } = parsed.data;

  try {
    await deductBet(userId, betAmount, 'slots');
    const grid = spinGrid();
    const { lines, totalPayout, win } = resolveSlots(grid, betAmount);
    // settleBet receives the gross payout (stake + winnings); 0 on a loss.
    const { newBalance } = await settleBet(
      userId,
      totalPayout,
      betAmount,
      win ? `win_${totalPayout}` : 'loss',
      'slots',
    );
    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    await applyTierUp(userId);
    // net profit shown to player = gross payout − stake (stake was already deducted)
    res.json({ grid, lines, totalPayout, win, profit: totalPayout - betAmount, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] slots bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Coin Flip ─────────────────────────────────────────────────────────────

const coinflipBetSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
  call: z.enum(['heads', 'tails']),
});

// POST /api/games/flip/bet
// Pipeline: validate → deductBet → crypto flip → resolveCoinflip → settleBet →
// emit → tier reconcile. Instant-settle (no session). A fair 50/50 coin; a win
// pays the shared 1.94× (RTP / 0.5), so the RTP is 97%.
// Returns 200 { result, call, win, multiplier, profit, newBalance }.
// Returns 400 on invalid input, 402 on INSUFFICIENT_FUNDS.
gamesRouter.post('/flip/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = coinflipBetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { betAmount, call } = parsed.data;

  try {
    await deductBet(userId, betAmount, 'flip');
    const result = flipCoin();
    const { win, multiplier } = resolveCoinflip(result, call);
    // settleBet receives the gross payout (stake + winnings); 0 on a loss.
    const grossPayout = win ? Math.floor(betAmount * multiplier) : 0;
    const { newBalance } = await settleBet(
      userId,
      grossPayout,
      betAmount,
      `${call}=${result}`,
      'flip',
    );
    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    await applyTierUp(userId);
    // net profit shown to player = gross payout − stake (stake was already deducted)
    res.json({ result, call, win, multiplier, profit: grossPayout - betAmount, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] coinflip bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Crash ───────────────────────────────────────────────────────────────────

const crashStartSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
  // Optional auto-cash-out target; null/omitted = manual only.
  autoCashout: z.number().min(CRASH.MIN_AUTO_CASHOUT).max(CRASH.MAX_CRASH).nullable().optional(),
});
const crashCashoutSchema = z.object({ sessionId: z.number().int() });

// POST /api/games/crash/start
// Deducts the bet, draws a hidden crash point, persists the round, and arms its
// auto-cash-out + bust timers. The crash point is NEVER returned (revealing it
// would let a client cash out one tick before every bust). Returns the resume
// info: { sessionId, startedAt, autoCashout, serverNow, newBalance }.
// Returns 409 (with the running session) if a round is already in progress.
gamesRouter.post('/crash/start', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = crashStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { betAmount } = parsed.data;
  const autoCashout = parsed.data.autoCashout ?? null;

  // Surface the running round (for resume) without duplicating the 409 payload.
  async function respondAlreadyRunning() {
    const running = await reconcileActiveCrash(userId);
    res.status(409).json({
      error: 'You already have a round in progress',
      session: running
        ? {
            sessionId: running.sessionId,
            startedAt: running.startedAt,
            autoCashout: running.autoCashout,
            serverNow: Date.now(),
          }
        : undefined,
    });
  }

  try {
    // Fast path: settle/clean up any finished-but-unsettled round; reject if live.
    const existing = await reconcileActiveCrash(userId);
    if (existing && existing.status === 'running') {
      await respondAlreadyRunning();
      return;
    }

    // startCrashRound inserts first (the partial unique index is the real guard
    // against a concurrent double-start), then deducts, then arms.
    const round = await startCrashRound(userId, betAmount, autoCashout);
    io?.to(`user:${userId}`).emit('balance:update', { balance: round.newBalance });
    res.json({
      sessionId: round.sessionId,
      startedAt: round.startedAt,
      autoCashout: round.autoCashout,
      serverNow: Date.now(),
      newBalance: round.newBalance,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'ALREADY_RUNNING') { await respondAlreadyRunning(); return; }
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] crash start error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/crash/cashout
// Server-authoritative manual cash-out (computed from the server clock). Wins at
// the current multiplier if it's below the hidden crash point, else reports a bust.
// Returns 200 { win, multiplier?, payout?, crashPoint?, newBalance?, alreadySettled? }.
// Returns 404 if the round doesn't exist / isn't the caller's.
gamesRouter.post('/crash/cashout', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = crashCashoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  try {
    const result = await manualCashout(userId, parsed.data.sessionId);
    if (result == null) {
      res.status(404).json({ error: 'Round not found' });
      return;
    }
    res.json(result);
  } catch (err: unknown) {
    console.error('[games] crash cashout error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/games/crash/active-session
// Resume support: returns the live round so a refresh can rejoin the rising curve.
// Lazily settles a round whose bust/auto moment already passed (→ session: null).
gamesRouter.get('/crash/active-session', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  try {
    const recon = await reconcileActiveCrash(userId);
    if (!recon || recon.status !== 'running') {
      res.json({ session: null });
      return;
    }
    res.json({
      session: {
        sessionId: recon.sessionId,
        startedAt: recon.startedAt,
        autoCashout: recon.autoCashout,
        serverNow: Date.now(),
      },
    });
  } catch (err: unknown) {
    console.error('[games] crash active-session error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Mines routes ─────────────────────────────────────────────────────────────

const minesStartSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
  mineCount: z.number().int().min(1).max(24),
});

const minesTileSchema = z.object({
  sessionId: z.number().int(),
  row: z.number().int().min(0).max(4),
  col: z.number().int().min(0).max(4),
});

const minesCashoutSchema = z.object({
  sessionId: z.number().int(),
});

// POST /api/games/mines/start
// Pipeline: deduct bet → generate grid → store session → return { sessionId }
// Grid is NEVER returned to client during an active round (MINE-01)
// Returns 200 { sessionId }
// Returns 402 on INSUFFICIENT_FUNDS
// Returns 400/500 on error
gamesRouter.post('/mines/start', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = minesStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { betAmount, mineCount } = parsed.data;

  try {
    await deductBet(userId, betAmount, 'mines');

    const grid = generateMineGrid(mineCount);
    const state: MinesSessionState = {
      mineCount,
      grid,
      revealed: [],
      tilesRevealed: 0,
      multiplier: 1.0,
      status: 'active',
    };

    const [session] = await db
      .insert(gameSessions)
      .values({
        userId,
        gameType: 'mines',
        state: JSON.stringify(state),
        betAmount,
      })
      .returning({ id: gameSessions.id });

    res.json({ sessionId: session!.id });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: 'Insufficient funds' });
      return;
    }
    if (code === 'BET_TOO_SMALL') {
      res.status(400).json({ error: 'Bet amount too small' });
      return;
    }
    console.error('[games] mines start error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/mines/tile
// Pipeline: load session → validate tile → check mine → update state → return result
// Returns 200 { hit: true, mineGrid } on mine hit (round over, bet lost)
// Returns 200 { hit: false, gem: true, currentMultiplier, tilesRevealed } on safe tile
// Returns 400 on validation/state errors, 404 if session not found
gamesRouter.post('/mines/tile', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = minesTileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { sessionId, row, col } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.id, sessionId),
          eq(gameSessions.userId, userId),
          isNull(gameSessions.completedAt),
        ),
      );

    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = JSON.parse(session.state) as MinesSessionState;

    if (state.status !== 'active') {
      res.status(400).json({ error: 'Round already ended' });
      return;
    }

    const tileIndex = row * 5 + col;

    if (state.revealed.includes(tileIndex)) {
      res.status(400).json({ error: 'Tile already revealed' });
      return;
    }

    if (state.grid[tileIndex] === true) {
      // Mine hit — round over, bet lost
      state.status = 'exploded';
      await db
        .update(gameSessions)
        .set({ state: JSON.stringify(state), completedAt: new Date() })
        .where(eq(gameSessions.id, sessionId));

      const { newBalance } = await settleBet(userId, 0, session.betAmount, 'exploded', 'mines');
      io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
      await applyTierUp(userId);

      res.json({ hit: true, mineGrid: state.grid });
      return;
    }

    // Safe tile
    state.revealed.push(tileIndex);
    state.tilesRevealed++;
    state.multiplier = calculateMinesMultiplier(state.mineCount, state.tilesRevealed);

    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), updatedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));

    res.json({
      hit: false,
      gem: true,
      currentMultiplier: state.multiplier,
      tilesRevealed: state.tilesRevealed,
    });
  } catch (err: unknown) {
    console.error('[games] mines tile error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/mines/cashout
// Pipeline: load session → validate state → compute payout → settle → reveal grid
// Returns 200 { payout, newBalance, mineGrid }
// Returns 400 if no tiles revealed or round already ended
// Returns 404 if session not found
gamesRouter.post('/mines/cashout', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = minesCashoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { sessionId } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.id, sessionId),
          eq(gameSessions.userId, userId),
          isNull(gameSessions.completedAt),
        ),
      );

    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = JSON.parse(session.state) as MinesSessionState;

    if (state.status !== 'active') {
      res.status(400).json({ error: 'Round already ended' });
      return;
    }

    if (state.tilesRevealed === 0) {
      res.status(400).json({ error: 'Reveal at least one tile before cashing out' });
      return;
    }

    const payout = Math.floor(session.betAmount * state.multiplier);
    state.status = 'cashout';

    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), completedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));

    const { newBalance } = await settleBet(
      userId,
      payout,
      session.betAmount,
      `cashout_${state.tilesRevealed}`,
      'mines',
    );

    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    await applyTierUp(userId);
    res.json({ payout, newBalance, mineGrid: state.grid });
  } catch (err: unknown) {
    console.error('[games] mines cashout error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/games/mines/active-session
// Returns the current active Mines session for the authenticated user
// Mine positions are NEVER sent to client during an active round (MINE-01)
// Returns 200 { session: { sessionId, tilesRevealed, revealed, mineCount, multiplier, betAmount } }
// Returns 200 { session: null } if no active session
gamesRouter.get('/mines/active-session', requireAuth, async (req, res) => {
  const userId = req.user!.id;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.userId, userId),
          eq(gameSessions.gameType, 'mines'),
          isNull(gameSessions.completedAt),
        ),
      )
      .orderBy(desc(gameSessions.createdAt))
      .limit(1);

    const session = rows[0];
    if (!session) {
      res.json({ session: null });
      return;
    }

    const state = JSON.parse(session.state) as MinesSessionState;

    // Never send mine positions to client during active round (MINE-01)
    res.json({
      session: {
        sessionId: session.id,
        tilesRevealed: state.tilesRevealed,
        revealed: state.revealed,
        mineCount: state.mineCount,
        multiplier: state.multiplier,
        betAmount: session.betAmount,
      },
    });
  } catch (err: unknown) {
    console.error('[games] mines active-session error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Hi-Lo routes (card cash-out ladder) ─────────────────────────────────────

const hiloStartSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
});
const hiloGuessSchema = z.object({
  sessionId: z.number().int(),
  direction: z.enum(['hi', 'lo']),
});
const hiloCashoutSchema = z.object({
  sessionId: z.number().int(),
});

// Load the caller's single open Hi-Lo session, or null.
async function loadActiveHilo(userId: number) {
  const rows = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.userId, userId), eq(gameSessions.gameType, 'hilo'), isNull(gameSessions.completedAt)))
    .orderBy(desc(gameSessions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

// POST /api/games/hilo/start
// Deducts the bet and opens a round with a freshly drawn (public) base card.
// The current card IS returned — only the NEXT card is unknown. Returns
// { sessionId, currentCard, streak, multiplier }.
// Returns 402 INSUFFICIENT_FUNDS, 409 if a round is already in progress.
gamesRouter.post('/hilo/start', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = hiloStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { betAmount } = parsed.data;

  try {
    const existing = await loadActiveHilo(userId);
    if (existing) {
      res.status(409).json({ error: 'You already have a round in progress' });
      return;
    }

    const { newBalance } = await deductBet(userId, betAmount, 'hilo');
    const state = initialHiloState();
    const [session] = await db
      .insert(gameSessions)
      .values({ userId, gameType: 'hilo', state: JSON.stringify(state), betAmount })
      .returning({ id: gameSessions.id });

    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    res.json({ sessionId: session!.id, currentCard: state.currentCard, streak: 0, multiplier: 1, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] hilo start error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/hilo/guess
// Draws the next card. A correct (strict) guess compounds the multiplier and the
// round continues; a wrong guess (or a tie) busts the round and settles a loss.
// Returns 200 { nextCard, win, busted, streak, multiplier, newBalance? }.
// Returns 400 if the round isn't active or the direction is impossible, 404 if
// the session isn't the caller's.
gamesRouter.post('/hilo/guess', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = hiloGuessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { sessionId, direction } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId), isNull(gameSessions.completedAt)));
    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = JSON.parse(session.state) as HiloSessionState;
    if (state.status !== 'active') {
      res.status(400).json({ error: 'Round already ended' });
      return;
    }
    // Reject an impossible call (Ace→higher, 2→lower) before drawing.
    if (!hiloDirectionAvailable(state.currentCard.rank, direction)) {
      res.status(400).json({ error: 'That call is not possible on this card' });
      return;
    }

    const { nextCard, win, multiplier, streak } = applyHiloGuess(state, direction);

    if (!win) {
      // Bust — round over, stake already deducted, nothing credited.
      await db
        .update(gameSessions)
        .set({ state: JSON.stringify(state), completedAt: new Date() })
        .where(eq(gameSessions.id, sessionId));
      const { newBalance } = await settleBet(userId, 0, session.betAmount, `bust_${streak}`, 'hilo');
      io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
      await applyTierUp(userId);
      res.json({ nextCard, win: false, busted: true, streak, multiplier, newBalance });
      return;
    }

    // Correct guess — advance the ladder; the player may guess again or cash out.
    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), updatedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));
    res.json({ nextCard, win: true, busted: false, streak, multiplier });
  } catch (err: unknown) {
    console.error('[games] hilo guess error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/hilo/cashout
// Locks in the current cumulative multiplier. Requires at least one correct
// guess. Returns 200 { payout, newBalance, multiplier, streak }.
// Returns 400 if no guess has been made or the round already ended, 404 if not
// the caller's session.
gamesRouter.post('/hilo/cashout', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = hiloCashoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { sessionId } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId), isNull(gameSessions.completedAt)));
    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = JSON.parse(session.state) as HiloSessionState;
    if (state.status !== 'active') {
      res.status(400).json({ error: 'Round already ended' });
      return;
    }
    if (state.streak === 0) {
      res.status(400).json({ error: 'Make at least one guess before cashing out' });
      return;
    }

    const payout = Math.floor(session.betAmount * state.multiplier);
    state.status = 'cashout';
    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), completedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));

    const { newBalance } = await settleBet(userId, payout, session.betAmount, `cashout_${state.streak}`, 'hilo');
    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    await applyTierUp(userId);
    res.json({ payout, newBalance, multiplier: state.multiplier, streak: state.streak });
  } catch (err: unknown) {
    console.error('[games] hilo cashout error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/games/hilo/active-session
// Resume support: returns the open round (current card is public) so a refresh
// can rejoin the ladder. Returns { session: null } when there is none.
gamesRouter.get('/hilo/active-session', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  try {
    const session = await loadActiveHilo(userId);
    if (!session) {
      res.json({ session: null });
      return;
    }
    const state = JSON.parse(session.state) as HiloSessionState;
    res.json({
      session: {
        sessionId: session.id,
        currentCard: state.currentCard,
        history: state.history,
        streak: state.streak,
        multiplier: state.multiplier,
        betAmount: session.betAmount,
      },
    });
  } catch (err: unknown) {
    console.error('[games] hilo active-session error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Pump routes (balloon cash-out ladder) ──────────────────────────────────

const pumpStartSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
  difficulty: z.enum(['easy', 'medium', 'hard', 'expert']),
});
const pumpInflateSchema = z.object({
  sessionId: z.number().int(),
});
const pumpCashoutSchema = z.object({
  sessionId: z.number().int(),
});

// Load the caller's single open Pump session, or null.
async function loadActivePump(userId: number) {
  const rows = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.userId, userId), eq(gameSessions.gameType, 'pump'), isNull(gameSessions.completedAt)))
    .orderBy(desc(gameSessions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

// POST /api/games/pump/start
// Deducts the bet and opens a round at 1× (0 pumps) on the chosen difficulty. The
// hidden hazard layout stays server-side. Returns { sessionId, difficulty, pumps,
// multiplier, maxPumps, newBalance }. 402 INSUFFICIENT_FUNDS, 409 if a round is
// already in progress.
gamesRouter.post('/pump/start', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = pumpStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { betAmount, difficulty } = parsed.data;
  if (!isPumpDifficulty(difficulty)) {
    res.status(400).json({ error: 'Invalid difficulty' });
    return;
  }

  try {
    const existing = await loadActivePump(userId);
    if (existing) {
      res.status(409).json({ error: 'You already have a round in progress' });
      return;
    }

    const { newBalance } = await deductBet(userId, betAmount, 'pump');
    const state = initialPumpState(difficulty);
    const [session] = await db
      .insert(gameSessions)
      .values({ userId, gameType: 'pump', state: JSON.stringify(state), betAmount })
      .returning({ id: gameSessions.id });

    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    res.json({
      sessionId: session!.id,
      difficulty,
      pumps: 0,
      multiplier: 1,
      maxPumps: pumpMaxPumps(difficulty),
      newBalance,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] pump start error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/pump/inflate
// Reveals the next hidden cell. A safe cell compounds the multiplier and the round
// continues; a hazard pops the balloon and settles a loss. Returns 200
// { popped, pumps, multiplier, maxedOut, newBalance? }. 400 if the round isn't
// active or is already maxed, 404 if the session isn't the caller's.
gamesRouter.post('/pump/inflate', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = pumpInflateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { sessionId } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId), isNull(gameSessions.completedAt)));
    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = JSON.parse(session.state) as PumpSessionState;
    if (state.status !== 'active') {
      res.status(400).json({ error: 'Round already ended' });
      return;
    }
    // The balloon is maxed — only hazards remain, so a pump would be a guaranteed
    // pop. Force the player to cash out instead of auto-losing their winnings.
    if (state.pumps >= pumpMaxPumps(state.difficulty)) {
      res.status(400).json({ error: 'Balloon is maxed — cash out' });
      return;
    }

    const { popped, pumps, multiplier } = applyPump(state);
    const maxedOut = pumps >= pumpMaxPumps(state.difficulty);

    if (popped) {
      // Pop — round over, stake already deducted, nothing credited.
      await db
        .update(gameSessions)
        .set({ state: JSON.stringify(state), completedAt: new Date() })
        .where(eq(gameSessions.id, sessionId));
      const { newBalance } = await settleBet(userId, 0, session.betAmount, `pop_${pumps}`, 'pump');
      io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
      await applyTierUp(userId);
      res.json({ popped: true, pumps, multiplier, maxedOut: false, newBalance });
      return;
    }

    // Survived — advance the ladder; the player may pump again or cash out.
    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), updatedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));
    res.json({ popped: false, pumps, multiplier, maxedOut });
  } catch (err: unknown) {
    console.error('[games] pump inflate error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/pump/cashout
// Locks in the current cumulative multiplier. Requires at least one pump. Returns
// 200 { payout, newBalance, multiplier, pumps }. 400 if no pump has been made or
// the round already ended, 404 if not the caller's session.
gamesRouter.post('/pump/cashout', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = pumpCashoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { sessionId } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId), isNull(gameSessions.completedAt)));
    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = JSON.parse(session.state) as PumpSessionState;
    if (state.status !== 'active') {
      res.status(400).json({ error: 'Round already ended' });
      return;
    }
    if (state.pumps === 0) {
      res.status(400).json({ error: 'Pump at least once before cashing out' });
      return;
    }

    const payout = Math.floor(session.betAmount * state.multiplier);
    state.status = 'cashout';
    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), completedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));

    const { newBalance } = await settleBet(userId, payout, session.betAmount, `cashout_${state.pumps}`, 'pump');
    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    await applyTierUp(userId);
    res.json({ payout, newBalance, multiplier: state.multiplier, pumps: state.pumps });
  } catch (err: unknown) {
    console.error('[games] pump cashout error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/games/pump/active-session
// Resume support: returns the open round (without the hidden hazard layout) so a
// refresh can rejoin the ladder. Returns { session: null } when there is none.
gamesRouter.get('/pump/active-session', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  try {
    const session = await loadActivePump(userId);
    if (!session) {
      res.json({ session: null });
      return;
    }
    const state = JSON.parse(session.state) as PumpSessionState;
    res.json({
      session: {
        sessionId: session.id,
        difficulty: state.difficulty,
        pumps: state.pumps,
        multiplier: state.multiplier,
        maxPumps: pumpMaxPumps(state.difficulty),
        betAmount: session.betAmount,
      },
    });
  } catch (err: unknown) {
    console.error('[games] pump active-session error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Blackjack routes (multi-hand + split) ──────────────────────────────────────

const blackjackDealSchema = z.object({
  bets: z
    .array(z.number().int().min(1).max(1_000_000))
    .min(1, 'At least one hand required')
    .max(MAX_PREDEAL_HANDS, `At most ${MAX_PREDEAL_HANDS} hands`),
});

const blackjackActionSchema = z.object({
  sessionId: z.number().int(),
  action: z.enum(['hit', 'stand', 'double', 'split']),
});

// Build the client-facing view of a session. Player hands are fully visible; the
// dealer hole card stays hidden until the round is settled.
function serializeBlackjack(
  state: BlackjackSessionState,
  sessionId: number,
  newBalance?: number,
) {
  const settled = state.phase === 'settled';
  return {
    sessionId,
    phase: state.phase,
    activeHandIndex: state.activeHandIndex,
    hands: state.hands.map((h) => ({
      cards: h.cards,
      bet: h.bet,
      value: calculateHandValue(h.cards).value,
      status: h.status,
      isDoubled: h.isDoubled,
      splitAce: h.splitAce,
      outcome: h.outcome,
      profit: h.profit,
    })),
    dealer: {
      upCard: state.dealerHand[0] ?? null,
      hand: settled ? state.dealerHand : null,
      value: settled ? calculateHandValue(state.dealerHand).value : null,
    },
    canSplit: canSplit(state),
    canDouble: canDouble(state),
    ...(newBalance !== undefined ? { newBalance } : {}),
  };
}

// Settle every hand to the wallet (one settleBet per hand), persist the session
// as completed, and emit a single balance update. Returns the final balance.
async function settleBlackjack(
  userId: number,
  sessionId: number,
  state: BlackjackSessionState,
): Promise<number> {
  settle(state);
  let newBalance = 0;
  for (const hand of state.hands) {
    const effectiveBet = hand.bet * (hand.isDoubled ? 2 : 1);
    const result = await settleBet(
      userId,
      hand.profit ?? 0,
      effectiveBet,
      hand.outcome ?? 'dealer_win',
      'blackjack',
    );
    newBalance = result.newBalance;
  }
  await db
    .update(gameSessions)
    .set({ state: JSON.stringify(state), completedAt: new Date() })
    .where(eq(gameSessions.id, sessionId));
  io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
  await applyTierUp(userId);
  return newBalance;
}

// POST /api/games/blackjack/deal
// Body: { bets: number[] } — one entry per pre-deal hand (1..MAX_PREDEAL_HANDS).
// Deducts the total stake, deals all hands, and either returns the player_turn
// view or, if every hand is a natural, settles immediately.
gamesRouter.post('/blackjack/deal', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = blackjackDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { bets } = parsed.data;
  const total = bets.reduce((sum, b) => sum + b, 0);

  try {
    await deductBet(userId, total, 'blackjack');

    const state = startGame(bets);

    const [session] = await db
      .insert(gameSessions)
      .values({ userId, gameType: 'blackjack', state: JSON.stringify(state), betAmount: total })
      .returning({ id: gameSessions.id });

    if (state.phase === 'dealer_turn') {
      // Every hand was a natural (or otherwise needs no player action) — settle now.
      const newBalance = await settleBlackjack(userId, session!.id, state);
      res.json(serializeBlackjack(state, session!.id, newBalance));
      return;
    }

    res.json(serializeBlackjack(state, session!.id));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] blackjack deal error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/blackjack/action
// Body: { sessionId, action: 'hit'|'stand'|'double'|'split' }. Applies the action
// to the active hand; double/split deduct the extra stake. Settles when the
// player turn ends.
gamesRouter.post('/blackjack/action', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = blackjackActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { sessionId, action } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId), isNull(gameSessions.completedAt)));
    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    let state = JSON.parse(session.state) as BlackjackSessionState;
    if (state.phase !== 'player_turn') {
      res.status(400).json({ error: 'Not player turn' });
      return;
    }

    const activeBet = state.hands[state.activeHandIndex]?.bet ?? 0;

    if (action === 'hit') {
      state = playerHit(state);
    } else if (action === 'stand') {
      state = playerStand(state);
    } else if (action === 'double') {
      if (!canDouble(state)) {
        res.status(400).json({ error: 'Cannot double this hand' });
        return;
      }
      await deductBet(userId, activeBet, 'blackjack');
      state = playerDouble(state);
    } else {
      // split
      if (!canSplit(state)) {
        res.status(400).json({ error: 'Cannot split this hand' });
        return;
      }
      await deductBet(userId, activeBet, 'blackjack');
      state = playerSplit(state);
    }

    if (state.phase === 'dealer_turn') {
      const newBalance = await settleBlackjack(userId, sessionId, state);
      res.json(serializeBlackjack(state, sessionId, newBalance));
      return;
    }

    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), updatedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));

    res.json(serializeBlackjack(state, sessionId));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    console.error('[games] blackjack action error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/games/blackjack/active-session
// Returns the player open hand so a refresh can resume play. The dealer hole
// card stays hidden during the player turn.
gamesRouter.get('/blackjack/active-session', requireAuth, async (req, res) => {
  const userId = req.user!.id;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.userId, userId), eq(gameSessions.gameType, 'blackjack'), isNull(gameSessions.completedAt)))
      .orderBy(desc(gameSessions.createdAt))
      .limit(1);

    const session = rows[0];
    if (!session) {
      res.json({ session: null });
      return;
    }

    const state = JSON.parse(session.state) as BlackjackSessionState;
    res.json({ session: serializeBlackjack(state, session.id) });
  } catch (err: unknown) {
    console.error('[games] blackjack active-session error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

void totalProfit; // exported for tests/diagnostics
